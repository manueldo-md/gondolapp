/**
 * probar-migracion-sugerida.mjs — DRY-RUN de 20261001100000_localidad_sugerida.sql
 *
 * Aplica la migración dentro de una transacción, la ejercita y termina con
 * ROLLBACK. No deja nada escrito.
 *
 *   node scripts/probar-migracion-sugerida.mjs            (dev)
 *   GONDOLAPP_PROD=1 node scripts/probar-migracion-sugerida.mjs --prod
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE EL CHECK IMPIDA LA DECISIÓN QUE NADIE DEBE TOMAR. Un
 *      `localidad_sugerida_id` con estado 'ambiguo' sería una máquina eligiendo
 *      entre dos localidades, que es exactamente lo que este tramo evita. Se
 *      prueba intentando escribirlo y esperando el rechazo.
 *
 *   2. QUE LOS CUATRO ESTADOS REALES ENTREN. De nada sirve un CHECK que además
 *      bloquee lo que la app va a escribir. Se escribe uno de cada uno.
 *
 *   3. QUE NO SE TOQUE NINGUNA FILA EXISTENTE. Los comercios y sus localidades
 *      tienen que quedar igual, y todas las filas nacer con estado NULL —
 *      "todavía no se intentó", que no es lo mismo que 'sin_dato'.
 *
 *   4. QUE SEA IDEMPOTENTE. Es `ADD COLUMN IF NOT EXISTS` más dos CHECK
 *      guardados por nombre, así que correrla dos veces no puede fallar.
 *
 * El 1 es el que justifica el archivo: una constraint que nadie ejercitó puede
 * estar mal escrita sin que se note.
 */
import pg from 'pg'
import fs from 'fs'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const MIGRACION = 'supabase/migrations/20261001100000_localidad_sugerida.sql'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'

if (esProd && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para correrlo contra producción hace falta GONDOLAPP_PROD=1.\n')
  process.exit(1)
}

const cred = credencialesDeRef(ref)
if (!cred?.vars.PGURL) { console.error(`\n✗ Sin PGURL para ${ref}\n`); process.exit(1) }

// El BEGIN/COMMIT del archivo se saca: ese COMMIT cerraría NUESTRA transacción
// y escribiría de verdad. Si el reemplazo no matchea, abortamos.
const crudo = fs.readFileSync(MIGRACION, 'utf8')
if (!/^BEGIN;\s*$/m.test(crudo) || !/^COMMIT;\s*$/m.test(crudo)) {
  console.error('\n✗ No encontré el BEGIN;/COMMIT;. Abortando para no correr algo distinto.\n')
  process.exit(1)
}
const sql = crudo.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

/** Corre algo que TIENE que fallar, sin dejar la transacción abortada. */
async function rechaza(c, sqlMalo) {
  await c.query('SAVEPOINT sp')
  let rechazado = false, msg = ''
  try { await c.query(sqlMalo) } catch (e) { rechazado = true; msg = e.message }
  await c.query('ROLLBACK TO SAVEPOINT sp')
  return { rechazado, msg }
}

const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

try {
  await c.query('BEGIN')

  const comAntes = Number((await c.query('SELECT count(*) n FROM comercios')).rows[0].n)
  const locAntes = Number((await c.query('SELECT count(*) n FROM comercios WHERE localidad_id IS NOT NULL')).rows[0].n)
  console.log(`\n▸ ANTES: ${comAntes} comercios, ${locAntes} con localidad`)

  await c.query(sql)

  console.log('\n▸ Las columnas y los checks')
  caso('están las tres columnas', Number((await c.query(`
    SELECT count(*) n FROM information_schema.columns
     WHERE table_name='comercios' AND column_name LIKE 'localidad_sugerida%'`)).rows[0].n), 3)
  caso('localidad_sugerida_id es FK a localidades', Number((await c.query(`
    SELECT count(*) n FROM pg_constraint
     WHERE conrelid='comercios'::regclass AND confrelid='localidades'::regclass
       AND pg_get_constraintdef(oid) LIKE '%localidad_sugerida_id%'`)).rows[0].n), 1)

  console.log('\n▸ Toda fila nace SIN intentar (NULL), que no es sin_dato')
  caso('ninguna fila quedó con estado', Number((await c.query(
    `SELECT count(*) n FROM comercios WHERE localidad_sugerida_estado IS NOT NULL`)).rows[0].n), 0)
  caso('los comercios siguen todos',
    Number((await c.query('SELECT count(*) n FROM comercios')).rows[0].n), comAntes)
  caso('y sus localidades no se movieron',
    Number((await c.query('SELECT count(*) n FROM comercios WHERE localidad_id IS NOT NULL')).rows[0].n), locAntes)

  // Una fila cualquiera para escribirle encima dentro de la transacción.
  const unId = (await c.query('SELECT id FROM comercios LIMIT 1')).rows[0].id
  const unaLoc = (await c.query('SELECT id FROM localidades LIMIT 1')).rows[0].id

  console.log('\n▸ Los cuatro estados reales entran')
  for (const e of ['exacto', 'ambiguo', 'fuera', 'sin_dato', 'error']) {
    const id = e === 'exacto' ? unaLoc : null
    const r = await rechaza(c, `UPDATE comercios SET localidad_sugerida_estado='${e}',
      localidad_sugerida_id=${id === null ? 'NULL' : id} WHERE id='${unId}'`)
    caso(`'${e}' se puede escribir`, r.rechazado, false)
  }

  console.log('\n▸ EL CHECK QUE IMPORTA — una máquina no elige entre dos localidades')
  {
    const r = await rechaza(c, `UPDATE comercios
      SET localidad_sugerida_estado='ambiguo', localidad_sugerida_id=${unaLoc} WHERE id='${unId}'`)
    caso('un id de sugerencia con estado ambiguo se RECHAZA', r.rechazado, true)
    caso('y lo rechaza el check que dice por qué',
      /sugerencia_solo_si_exacto/.test(r.msg), true)

    const r2 = await rechaza(c, `UPDATE comercios
      SET localidad_sugerida_estado='fuera', localidad_sugerida_id=${unaLoc} WHERE id='${unId}'`)
    caso('con estado fuera tampoco', r2.rechazado, true)

    const r3 = await rechaza(c, `UPDATE comercios
      SET localidad_sugerida_id=${unaLoc} WHERE id='${unId}'`)
    caso('ni un id sin ningún estado', r3.rechazado, true)
  }

  console.log('\n▸ Un estado inventado no entra')
  {
    const r = await rechaza(c, `UPDATE comercios
      SET localidad_sugerida_estado='resuelto' WHERE id='${unId}'`)
    caso("'resuelto' se rechaza", r.rechazado, true)
    caso('por el check de estado', /localidad_sugerida_estado_check/.test(r.msg), true)
  }

  console.log('\n▸ El texto se puede guardar sin id, que es el caso de fuera')
  {
    const r = await rechaza(c, `UPDATE comercios
      SET localidad_sugerida_estado='fuera', localidad_sugerida_texto='Pueblito Sin Padrón'
      WHERE id='${unId}'`)
    caso('estado fuera + texto, sin id', r.rechazado, false)
  }

  console.log('\n▸ Idempotente')
  await c.query(sql)
  caso('correrla de nuevo no falla ni duplica columnas', Number((await c.query(`
    SELECT count(*) n FROM information_schema.columns
     WHERE table_name='comercios' AND column_name LIKE 'localidad_sugerida%'`)).rows[0].n), 3)

  await c.query('ROLLBACK')
} catch (e) {
  console.error('\n✗ Excepción:', e.message)
  try { await c.query('ROLLBACK') } catch {}
  fallos++
}

await c.end()
console.log(fallos ? `\n✗ ${fallos} mal. NO aplicar.\n` : '\n✓ Todo como se esperaba. Nada quedó escrito (ROLLBACK).\n')
process.exit(fallos ? 1 : 0)
