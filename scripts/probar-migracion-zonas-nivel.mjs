/**
 * probar-migracion-zonas-nivel.mjs — DRY-RUN de 20261002100000
 *
 *   node scripts/probar-migracion-zonas-nivel.mjs            (dev)
 *   GONDOLAPP_PROD=1 node scripts/probar-migracion-zonas-nivel.mjs --prod
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE LA FK SE REEMPLACE ENTERA. `ref_id` no puede tener FK porque apunta
 *      a tres tablas, y la FK daba DOS cosas: validar al escribir y borrar en
 *      cascada. Un trigger que solo valide repone la mitad — y la mitad que
 *      falta es la que ya mordió, porque `20260930100000` borró una localidad y
 *      lo que impidió las huérfanas fue el CASCADE.
 *
 *      Se prueba lo uno y lo otro: un `ref_id` inventado tiene que ser
 *      RECHAZADO, y borrar la fila de geografía tiene que llevarse la zona.
 *
 *   2. QUE NO SE PIERDA NI UNA FILA. Las que había pasan a nivel localidad con
 *      el mismo id. Verificar solo "se crearon las columnas" dejaría pasar una
 *      migración que las crea y borra los datos.
 *
 *   3. QUE LA PK PERMITA LO QUE ANTES ERA IMPOSIBLE — la provincia 3 y el
 *      departamento 3 a la vez — y siga impidiendo el duplicado exacto.
 *
 *   4. QUE SEA IDEMPOTENTE.
 */
import pg from 'pg'
import fs from 'fs'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const MIGRACION = 'supabase/migrations/20261002100000_gondolero_zonas_por_nivel.sql'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
if (esProd && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para correrlo contra producción hace falta GONDOLAPP_PROD=1.\n')
  process.exit(1)
}
const cred = credencialesDeRef(ref)
if (!cred?.vars.PGURL) { console.error(`\n✗ Sin PGURL para ${ref}\n`); process.exit(1) }

const crudo = fs.readFileSync(MIGRACION, 'utf8')
if (!/^BEGIN;\s*$/m.test(crudo) || !/^COMMIT;\s*$/m.test(crudo)) {
  console.error('\n✗ No encontré el BEGIN;/COMMIT;. Abortando.\n'); process.exit(1)
}
const sql = crudo.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
async function rechaza(c, q) {
  await c.query('SAVEPOINT sp')
  let r = false, msg = ''
  try { await c.query(q) } catch (e) { r = true; msg = e.message }
  await c.query('ROLLBACK TO SAVEPOINT sp')
  return { rechazado: r, msg }
}

const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

try {
  await c.query('BEGIN')

  const antes = Number((await c.query('SELECT count(*) n FROM gondolero_localidades')).rows[0].n)
  const idsAntes = (await c.query(
    'SELECT gondolero_id, localidad_id FROM gondolero_localidades ORDER BY 1,2')).rows
  console.log(`\n▸ ANTES: ${antes} filas`)

  await c.query(sql)

  console.log('\n▸ Las columnas, la PK y los triggers')
  caso('están nivel y ref_id', Number((await c.query(`
    SELECT count(*) n FROM information_schema.columns
     WHERE table_name='gondolero_localidades' AND column_name IN ('nivel','ref_id')`)).rows[0].n), 2)
  caso('localidad_id se fue', Number((await c.query(`
    SELECT count(*) n FROM information_schema.columns
     WHERE table_name='gondolero_localidades' AND column_name='localidad_id'`)).rows[0].n), 0)
  caso('la PK incluye el nivel', (await c.query(`
    SELECT pg_get_constraintdef(oid) d FROM pg_constraint
     WHERE conname='gondolero_localidades_pkey'`)).rows[0].d,
    'PRIMARY KEY (gondolero_id, nivel, ref_id)')
  caso('los 4 triggers que reemplazan la FK', Number((await c.query(`
    SELECT count(*) n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'gondolero_zonas_%'`)).rows[0].n), 4)

  console.log('\n▸ NO se perdió ni una fila')
  caso('la misma cantidad',
    Number((await c.query('SELECT count(*) n FROM gondolero_localidades')).rows[0].n), antes)
  caso('todas quedaron en nivel localidad', Number((await c.query(
    `SELECT count(*) n FROM gondolero_localidades WHERE nivel <> 'localidad'`)).rows[0].n), 0)
  caso('y con el mismo id que tenían',
    (await c.query('SELECT gondolero_id, ref_id AS localidad_id FROM gondolero_localidades ORDER BY 1,2')).rows,
    idsAntes)

  // Alguien para escribirle filas de prueba.
  const g = (await c.query('SELECT id FROM profiles LIMIT 1')).rows[0].id
  const prov = (await c.query('SELECT id FROM provincias LIMIT 1')).rows[0].id
  const dep = (await c.query('SELECT id FROM departamentos LIMIT 1')).rows[0].id
  const loc = (await c.query('SELECT id FROM localidades LIMIT 1')).rows[0].id
  // Para el CONTROL hace falta un id que NO exista como provincia: con ids
  // chicos las tres tablas se pisan y el control saldría NO VERIFICABLE.
  const locAlto = (await c.query(
    'SELECT max(id) m FROM localidades')).rows[0].m
  const ins = (n, r) => `INSERT INTO gondolero_localidades (gondolero_id, nivel, ref_id)
                         VALUES ('${g}', '${n}', ${r})`

  console.log('\n▸ LA VALIDACIÓN — la mitad de la FK que valida al escribir')
  for (const [n, r] of [['provincia', prov], ['departamento', dep], ['localidad', loc]]) {
    caso(`'${n}' con un id que existe entra`, (await rechaza(c, ins(n, r))).rechazado, false)
  }
  {
    const x = await rechaza(c, ins('provincia', 999999))
    caso('un ref_id inventado se RECHAZA', x.rechazado, true)
    caso('y el error dice qué nivel y qué id', /No existe provincia con id 999999/.test(x.msg), true)
  }
  caso('un nivel inventado lo frena el CHECK',
    (await rechaza(c, ins('region', prov))).rechazado, true)
  // CONTROL: el id de una localidad NO vale como provincia, aunque sea un
  // entero válido en otra tabla. Sin esto, el trigger no estaría discriminando.
  {
    const hay = (await c.query(
      'SELECT count(*) n FROM provincias WHERE id = $1', [locAlto])).rows[0].n
    if (Number(hay) === 0) {
      caso('CONTROL — un id de localidad NO vale como provincia',
        (await rechaza(c, ins('provincia', locAlto))).rechazado, true)
    } else {
      console.log('   ⊘ NO VERIFICABLE — ese id existe en las dos tablas')
    }
  }

  console.log('\n▸ LA CASCADA — la otra mitad, que un trigger de validación no repone')
  {
    await c.query('SAVEPOINT casc')
    // Una provincia nueva, sin nada colgando, para poder borrarla.
    const p2 = (await c.query(
      "INSERT INTO provincias (nombre) VALUES ('[TEST] Zona Fantasma') RETURNING id")).rows[0].id
    await c.query(ins('provincia', p2))
    caso('la zona quedó escrita', Number((await c.query(
      `SELECT count(*) n FROM gondolero_localidades WHERE nivel='provincia' AND ref_id=$1`, [p2])).rows[0].n), 1)
    await c.query('DELETE FROM provincias WHERE id = $1', [p2])
    caso('al borrar la provincia, la zona se va sola', Number((await c.query(
      `SELECT count(*) n FROM gondolero_localidades WHERE nivel='provincia' AND ref_id=$1`, [p2])).rows[0].n), 0)
    caso('y no quedó ninguna zona huérfana', Number((await c.query(`
      SELECT count(*) n FROM gondolero_localidades gl
       WHERE (gl.nivel='localidad'    AND NOT EXISTS (SELECT 1 FROM localidades   x WHERE x.id=gl.ref_id))
          OR (gl.nivel='departamento' AND NOT EXISTS (SELECT 1 FROM departamentos x WHERE x.id=gl.ref_id))
          OR (gl.nivel='provincia'    AND NOT EXISTS (SELECT 1 FROM provincias    x WHERE x.id=gl.ref_id))`)).rows[0].n), 0)
    await c.query('ROLLBACK TO SAVEPOINT casc')
  }

  console.log('\n▸ La PK: el mismo número en dos niveles ya no choca')
  {
    await c.query('SAVEPOINT pk')
    // Un id que exista como provincia Y como departamento, que es el caso que
    // la PK vieja —(gondolero, localidad_id)— no podía representar.
    const par = (await c.query(`
      SELECT p.id FROM provincias p JOIN departamentos d ON d.id = p.id LIMIT 1`)).rows[0]
    if (par) {
      await c.query(ins('provincia', par.id))
      caso('provincia N y departamento N conviven',
        (await rechaza(c, ins('departamento', par.id))).rechazado, false)
    } else {
      console.log('   ⊘ NO VERIFICABLE — ningún id coincide entre provincias y departamentos')
    }
    await c.query('ROLLBACK TO SAVEPOINT pk')

    // En su propio savepoint: si el id de arriba coincidía con éste, el insert
    // de setup chocaba antes de llegar a la prueba.
    await c.query('SAVEPOINT dup')
    await c.query(ins('provincia', prov))
    caso('pero el duplicado exacto sigue rechazado',
      (await rechaza(c, ins('provincia', prov))).rechazado, true)
    await c.query('ROLLBACK TO SAVEPOINT dup')
  }

  console.log('\n▸ Idempotente')
  await c.query(sql)
  caso('correrla de nuevo no falla ni pierde filas',
    Number((await c.query('SELECT count(*) n FROM gondolero_localidades')).rows[0].n), antes)

  await c.query('ROLLBACK')
} catch (e) {
  console.error('\n✗ Excepción:', e.message)
  try { await c.query('ROLLBACK') } catch {}
  fallos++
}

await c.end()
console.log(fallos ? `\n✗ ${fallos} mal. NO aplicar.\n` : '\n✓ Todo como se esperaba. Nada quedó escrito (ROLLBACK).\n')
process.exit(fallos ? 1 : 0)
