/**
 * probar-migracion-fxr.mjs — DRY-RUN de 20260923100000_codigo_fixer_prefijo_fxr.sql
 *
 * Aplica la migración entera dentro de una transacción, la ejercita, y termina
 * con ROLLBACK. **No deja nada escrito**: se puede correr contra dev las veces
 * que haga falta.
 *
 * Lo que tiene que probar, en orden de importancia:
 *
 *   1. QUE EL REGISTRO PÚBLICO SIGA ANDANDO. `handle_new_user`
 *      es un trigger sobre auth.users y llama al generador: si la firma nueva
 *      quedara mal, nadie puede darse de alta — y el síntoma sería "el registro
 *      no anda", no "quedó mal una migración".
 *   2. Que el trigger mantenga la correspondencia en las cinco transiciones.
 *   3. Que NO rote un código que ya está bien (un cambio de tipo que no cambia
 *      nada le rotaría el código a alguien que ya lo dictó por teléfono).
 *   4. Que el backfill migre a los fixers existentes y sea idempotente.
 *
 *   node scripts/probar-migracion-fxr.mjs
 */
import pg from 'pg'
import fs from 'fs'

const url = fs.readFileSync('.env.dev.local', 'utf8')
  .match(/^PGURL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
const uno = async (sql, args = []) => (await c.query(sql, args)).rows[0]
const codigoDe = async id => (await uno('SELECT codigo_gondolero AS c FROM profiles WHERE id = $1', [id])).c

// Un usuario de juguete que arranca como gondolero, creado por el camino REAL:
// un INSERT en auth.users, que es lo que dispara handle_new_user.
const nuevoAlta = async (meta) => {
  const id = (await uno('SELECT gen_random_uuid() AS id')).id
  await c.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
    [id, `dry-run-${id}@ejemplo.test`, JSON.stringify(meta)],
  )
  return id
}

try {
  await c.query('BEGIN')

  console.log('\n▸ ANTES de la migración')
  const antes = await uno(`
    SELECT count(*) FILTER (WHERE tipo_actor = 'fixer')::int AS fixers,
           count(*) FILTER (WHERE tipo_actor = 'fixer' AND codigo_gondolero LIKE 'GND-%')::int AS fixers_gnd,
           count(*) FILTER (WHERE tipo_actor = 'gondolero')::int AS gondoleros
    FROM profiles`)
  console.log(`   ${antes.fixers} fixers (${antes.fixers_gnd} con GND), ${antes.gondoleros} gondoleros`)
  caso('CONTROL — hoy todos los fixers tienen prefijo de gondolero', antes.fixers_gnd, antes.fixers)

  // ── Aplicar la migración ───────────────────────────────────────────────────
  //
  // EL ARCHIVO TRAE SU PROPIO `BEGIN;` / `COMMIT;` porque está hecho para pegar
  // en el SQL Editor. Acá hay que SACARLOS: ese `COMMIT;` cerraría la
  // transacción de este dry-run y **escribiría sobre dev**, que es exactamente
  // lo que esta prueba promete no hacer.
  //
  // Por eso no alcanza con reemplazar y seguir: si el archivo cambia de forma y
  // el reemplazo no matchea, el borrado sería silencioso y el daño real. Se
  // verifica que hayan salido los dos, y que no quede ninguno suelto.
  const crudo = fs.readFileSync('supabase/migrations/20260923100000_codigo_fixer_prefijo_fxr.sql', 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (transacción manejada por el dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(
      `No se pudieron sacar el BEGIN/COMMIT del archivo (encontrados: ${sacados}). ` +
      'Se aborta: correrlo así commitearía sobre dev.')
  }
  await c.query(sql)
  console.log('\n▸ Migración aplicada (el bloque de verificación no tiró)')

  console.log('\n▸ La firma: tiene que quedar UNA sola')
  const firmas = (await c.query(
    `SELECT oid::regprocedure::text AS f FROM pg_proc WHERE proname = 'generar_codigo_gondolero' ORDER BY 1`
  )).rows.map(r => r.f)
  caso('una sola firma, la de un argumento', firmas, ['generar_codigo_gondolero(text)'])

  // El punto del DROP. Sin él la vieja sobrevive SIN dar error —el parámetro no
  // tiene DEFAULT, así que no hay ambigüedad— y queda un generador que devuelve
  // GND pase lo que pase, listo para ponerle prefijo de gondolero a un fixer.
  // Que la entrada de cero argumentos ya no exista es lo que se verifica acá.
  let vieja = null
  try { await c.query(`SAVEPOINT s2; SELECT generar_codigo_gondolero()`) }
  catch (e) { vieja = e.code }
  finally { await c.query('ROLLBACK TO SAVEPOINT s2') }
  caso('la entrada vieja de cero argumentos ya no existe (42883)', vieja, '42883')

  console.log('\n▸ El generador')
  caso('gondolero da GND', /^GND-[2-9]{4}-[2-9]{4}$/.test((await uno(`SELECT generar_codigo_gondolero('gondolero') AS c`)).c), true)
  caso('fixer da FXR',     /^FXR-[2-9]{4}-[2-9]{4}$/.test((await uno(`SELECT generar_codigo_gondolero('fixer') AS c`)).c), true)
  let rechazo = null
  try { await c.query(`SAVEPOINT s; SELECT generar_codigo_gondolero('marca')`) }
  catch (e) { rechazo = e.code }
  finally { await c.query('ROLLBACK TO SAVEPOINT s') }
  caso('una marca no puede pedir código (22023)', rechazo, '22023')

  // ── 1. EL REGISTRO PÚBLICO ─────────────────────────────────────────────────
  console.log('\n▸ EL REGISTRO PÚBLICO, que es lo que el DROP podía romper')
  const idAlta = await nuevoAlta({ tipo_actor: 'gondolero', nombre: 'Dry Run', celular: '3442000000' })
  const perfilAlta = await uno(
    'SELECT tipo_actor, nombre, celular, codigo_gondolero FROM profiles WHERE id = $1', [idAlta])
  caso('el alta creó el profile', perfilAlta !== undefined, true)
  caso('con tipo gondolero', perfilAlta?.tipo_actor, 'gondolero')
  caso('con el celular, que la versión 052 había perdido', perfilAlta?.celular, '3442000000')
  caso('y con un código GND', /^GND-[2-9]{4}-[2-9]{4}$/.test(perfilAlta?.codigo_gondolero ?? ''), true)

  // La whitelist: quien pida otro tipo desde el formulario público igual nace
  // gondolero, y por lo tanto con GND. Es lo que impide pedirse un FXR solo.
  const idColado = await nuevoAlta({ tipo_actor: 'fixer', nombre: 'Se quiso colar' })
  const colado = await uno('SELECT tipo_actor, codigo_gondolero FROM profiles WHERE id = $1', [idColado])
  caso('pedir tipo_actor=fixer en la metadata NO alcanza', colado?.tipo_actor, 'gondolero')
  caso('y por lo tanto tampoco da un FXR', /^GND-/.test(colado?.codigo_gondolero ?? ''), true)

  // ── 2. Las transiciones ────────────────────────────────────────────────────
  console.log('\n▸ El trigger, en las cinco transiciones')
  const cambiar = async (id, tipo) => {
    await c.query('UPDATE profiles SET tipo_actor = $2 WHERE id = $1', [id, tipo])
    return codigoDe(id)
  }

  caso('gondolero → fixer da FXR',     /^FXR-[2-9]{4}-[2-9]{4}$/.test(await cambiar(idAlta, 'fixer')), true)
  caso('fixer → gondolero vuelve a GND', /^GND-[2-9]{4}-[2-9]{4}$/.test(await cambiar(idAlta, 'gondolero')), true)
  caso('gondolero → marca deja el código en NULL', await cambiar(idAlta, 'marca'), null)
  caso('marca → gondolero lo recupera',  /^GND-[2-9]{4}-[2-9]{4}$/.test(await cambiar(idAlta, 'gondolero')), true)
  caso('gondolero → distribuidora también limpia', await cambiar(idAlta, 'distribuidora'), null)
  await cambiar(idAlta, 'gondolero')

  // ── 3. La guarda que impide rotar un código ya dictado ─────────────────────
  console.log('\n▸ Lo que NO tiene que pasar: rotarle el código a alguien')
  const antesNoOp = await codigoDe(idAlta)
  await c.query(`UPDATE profiles SET tipo_actor = 'gondolero' WHERE id = $1`, [idAlta])
  caso('un cambio de tipo que no cambia el tipo no rota el código', await codigoDe(idAlta), antesNoOp)
  await c.query(`UPDATE profiles SET nombre = 'Otro nombre' WHERE id = $1`, [idAlta])
  caso('un UPDATE de otra columna tampoco lo toca', await codigoDe(idAlta), antesNoOp)

  // Y la reparación del bug que ya estaba: una marca con GND heredado.
  console.log('\n▸ Y lo que SÍ repara: la marca con un GND heredado')
  await c.query(
    `UPDATE profiles SET tipo_actor = 'gondolero' WHERE id = $1`, [idColado])
  const heredado = await codigoDe(idColado)
  // Se fuerza el estado viejo salteando el trigger, que es como está hoy en la base.
  await c.query('ALTER TABLE profiles DISABLE TRIGGER profiles_sincronizar_codigo')
  await c.query(`UPDATE profiles SET tipo_actor = 'marca' WHERE id = $1`, [idColado])
  await c.query('ALTER TABLE profiles ENABLE TRIGGER profiles_sincronizar_codigo')
  caso('CONTROL — hoy una marca se queda con el GND del gondolero que era', await codigoDe(idColado), heredado)
  await c.query(`UPDATE profiles SET tipo_actor = 'marca' WHERE id = $1`, [idColado])
  caso('el próximo toque a su tipo lo limpia', await codigoDe(idColado), null)

  // ── 4. El backfill ─────────────────────────────────────────────────────────
  console.log('\n▸ El backfill')
  const despues = await uno(`
    SELECT count(*) FILTER (WHERE tipo_actor = 'fixer'     AND codigo_gondolero ~ '^FXR-[2-9]{4}-[2-9]{4}$')::int AS fixers_ok,
           count(*) FILTER (WHERE tipo_actor = 'fixer')::int AS fixers,
           count(*) FILTER (WHERE tipo_actor = 'gondolero' AND codigo_gondolero ~ '^GND-[2-9]{4}-[2-9]{4}$')::int AS gond_ok,
           count(*) FILTER (WHERE tipo_actor = 'gondolero')::int AS gond
    FROM profiles`)
  caso('los fixers quedaron todos en FXR', despues.fixers_ok, despues.fixers)
  caso('los gondoleros siguen todos en GND', despues.gond_ok, despues.gond)

  const segunda = await uno('SELECT * FROM backfill_codigos_gondolero()')
  caso('una segunda corrida no toca nada (idempotente)',
    { asignados: segunda.asignados, fallidos: segunda.fallidos }, { asignados: 0, fallidos: 0 })

  console.log('\n▸ Nadie perdió el código, y nadie lo ganó de más')
  const sin = await uno(`
    SELECT count(*) FILTER (WHERE tipo_actor IN ('gondolero','fixer') AND codigo_gondolero IS NULL)::int AS actores_sin,
           count(*) FILTER (WHERE tipo_actor NOT IN ('gondolero','fixer') AND codigo_gondolero IS NOT NULL)::int AS empresas_con,
           (SELECT count(*) FROM (SELECT codigo_gondolero FROM profiles WHERE codigo_gondolero IS NOT NULL
                                  GROUP BY 1 HAVING count(*) > 1) d)::int AS duplicados
    FROM profiles`)
  caso('ningún gondolero ni fixer sin código', sin.actores_sin, 0)
  caso('ninguna empresa con código', sin.empresas_con, 0)
  caso('ningún código duplicado', sin.duplicados, 0)

} finally {
  await c.query('ROLLBACK')
  console.log('\n(ROLLBACK — dev quedó exactamente como estaba)')
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
