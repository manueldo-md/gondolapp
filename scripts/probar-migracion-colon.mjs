/**
 * probar-migracion-colon.mjs — DRY-RUN de 20260930100000_colon_unico_en_entre_rios.sql
 *
 * Aplica la migración dentro de una transacción, la ejercita y termina con
 * ROLLBACK. No deja nada escrito.
 *
 *   node scripts/probar-migracion-colon.mjs            (dev)
 *   GONDOLAPP_PROD=1 node scripts/probar-migracion-colon.mjs --prod
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE NO SE PIERDA LA ZONA DE NADIE. `gondolero_localidades` tiene la FK
 *      con ON DELETE CASCADE, así que un DELETE pelado se lleva la zona
 *      declarada de un gondolero SIN DECIR NADA. En dev existe exactamente ese
 *      caso: alguien eligió las dos variantes de Colón porque en pantalla se
 *      ven idénticas. Después de la migración tiene que seguir teniendo Colón.
 *
 *   2. QUE NO SE BORRE EL BUENO. Se verifica que la fila que sobrevive es la
 *      que tiene los 12 comercios y las 3 campañas del piloto. Chequear una
 *      sola dirección dejaría pasar el borrado inverso, que es el error caro.
 *
 *   3. QUE SEA IDEMPOTENTE. Correrla dos veces no puede fallar ni borrar de
 *      más: la segunda encuentra una sola fila y sale por el RETURN.
 *
 *   4. QUE LA PRECONDICIÓN MUERDA. Si la fila a borrar tuviera comercios, la
 *      migración tiene que ABORTAR en vez de borrarlos. Se prueba de verdad,
 *      colgándole un comercio a propósito dentro de la transacción.
 *
 * El punto 4 es el que más importa del archivo: una precondición que nadie
 * ejercitó puede estar mal escrita sin que se note.
 */
import pg from 'pg'
import fs from 'fs'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const MIGRACION = 'supabase/migrations/20260930100000_colon_unico_en_entre_rios.sql'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'

if (esProd && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para correrlo contra producción hace falta GONDOLAPP_PROD=1.\n')
  process.exit(1)
}

const cred = credencialesDeRef(ref)
if (!cred?.vars.PGURL) { console.error(`\n✗ Sin PGURL para ${ref}\n`); process.exit(1) }

// El BEGIN/COMMIT del archivo se saca: ese COMMIT cerraría NUESTRA transacción
// y escribiría de verdad. Si el reemplazo no matchea, abortamos — un borrado
// silencioso acá sería daño real sobre la base.
const crudo = fs.readFileSync(MIGRACION, 'utf8')
if (!/^BEGIN;\s*$/m.test(crudo) || !/^COMMIT;\s*$/m.test(crudo)) {
  console.error('\n✗ No encontré el BEGIN;/COMMIT; del archivo. Abortando para no correr algo distinto.\n')
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

const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

const COLON = `
  SELECT l.id, d.nombre depto FROM localidades l
    JOIN departamentos d ON d.id = l.departamento_id
    JOIN provincias p ON p.id = d.provincia_id
   WHERE p.nombre = 'Entre Ríos' AND l.nombre = 'Colón' ORDER BY l.id`

try {
  // ══════════════════════════════════════════════════════════════════════════
  await c.query('BEGIN')

  const antes = (await c.query(COLON)).rows
  console.log(`\n▸ ANTES: ${antes.length} filas de Colón — ${antes.map(r => `id ${r.id} (${r.depto})`).join(' · ')}`)

  const zonasAntes = (await c.query(
    `SELECT gondolero_id FROM gondolero_localidades WHERE localidad_id = ANY($1::int[])`,
    [antes.map(r => r.id)])).rows.map(r => r.gondolero_id)
  const gondolerosAntes = [...new Set(zonasAntes)]
  console.log(`  gondoleros con alguna variante de Colón como zona: ${gondolerosAntes.length}`)

  const comerciosAntes = Number((await c.query(
    `SELECT count(*) n FROM comercios WHERE localidad_id = ANY($1::int[])`, [antes.map(r => r.id)])).rows[0].n)
  const campsAntes = Number((await c.query(
    `SELECT count(*) n FROM campana_localidades WHERE localidad_id = ANY($1::int[])`, [antes.map(r => r.id)])).rows[0].n)
  const totalAntes = Number((await c.query('SELECT count(*) n FROM localidades')).rows[0].n)

  await c.query(sql)

  console.log('\n▸ DESPUÉS de aplicarla')
  const despues = (await c.query(COLON)).rows
  caso('Colón quedó una sola vez en Entre Ríos', despues.length, 1)
  caso('y la que quedó es la del departamento Colón', despues[0]?.depto, 'Colón')
  caso('se borró exactamente una localidad',
    totalAntes - Number((await c.query('SELECT count(*) n FROM localidades')).rows[0].n), 1)

  console.log('\n▸ El piloto quedó entero')
  caso('los comercios siguen todos',
    Number((await c.query(`SELECT count(*) n FROM comercios WHERE localidad_id = $1`, [despues[0].id])).rows[0].n),
    comerciosAntes)
  caso('las campañas también',
    Number((await c.query(`SELECT count(*) n FROM campana_localidades WHERE localidad_id = $1`, [despues[0].id])).rows[0].n),
    campsAntes)

  console.log('\n▸ EL CASCADE: nadie perdió su zona')
  const zonasDespues = (await c.query(
    `SELECT gondolero_id FROM gondolero_localidades WHERE localidad_id = $1`, [despues[0].id])).rows.map(r => r.gondolero_id)
  caso('los mismos gondoleros siguen teniendo Colón',
    [...new Set(zonasDespues)].sort(), gondolerosAntes.sort())
  caso('y ninguno quedó duplicado',
    zonasDespues.length, new Set(zonasDespues).size)
  caso('sin zonas huérfanas', Number((await c.query(
    `SELECT count(*) n FROM gondolero_localidades g
      WHERE NOT EXISTS (SELECT 1 FROM localidades l WHERE l.id = g.localidad_id)`)).rows[0].n), 0)

  console.log('\n▸ Idempotente: correrla de nuevo no hace nada')
  await c.query(sql)
  caso('sigue habiendo una sola', (await c.query(COLON)).rows.length, 1)
  caso('y no borró otra localidad',
    totalAntes - Number((await c.query('SELECT count(*) n FROM localidades')).rows[0].n), 1)

  await c.query('ROLLBACK')

  // ══════════════════════════════════════════════════════════════════════════
  // CONTROL — la precondición tiene que ABORTAR si el que se va tiene datos.
  // Se prueba de verdad: le colgamos un comercio y esperamos la excepción.
  console.log('\n▸ CONTROL — si la fila a borrar tuviera comercios, aborta')
  await c.query('BEGIN')
  const sobra = (await c.query(`
    SELECT l.id FROM localidades l JOIN departamentos d ON d.id = l.departamento_id
      JOIN provincias p ON p.id = d.provincia_id
     WHERE p.nombre='Entre Ríos' AND l.nombre='Colón' AND d.nombre='Uruguay'`)).rows[0]
  if (!sobra) {
    console.log('   ⊘ NO VERIFICABLE — esta base ya no tiene la fila duplicada')
  } else {
    await c.query(`UPDATE comercios SET localidad_id = $1
                    WHERE id = (SELECT id FROM comercios WHERE localidad_id IS NOT NULL LIMIT 1)`, [sobra.id])
    // La excepción aborta la transacción entera, así que sin SAVEPOINT todo lo
    // que venga después falla con "current transaction is aborted" y el script
    // reportaría un fallo propio como si fuera de la migración.
    await c.query('SAVEPOINT antes_del_control')
    let abortó = false
    try { await c.query(sql) } catch (e) { abortó = /NO se borra/.test(e.message) }
    await c.query('ROLLBACK TO SAVEPOINT antes_del_control')
    caso('aborta con el mensaje que explica por qué', abortó, true)
    caso('y no borró nada: las dos filas siguen', (await c.query(COLON)).rows.length, 2)
  }
  await c.query('ROLLBACK')

} catch (e) {
  console.error('\n✗ Excepción:', e.message)
  try { await c.query('ROLLBACK') } catch {}
  fallos++
}

await c.end()
console.log(fallos ? `\n✗ ${fallos} mal. NO aplicar.\n` : '\n✓ Todo como se esperaba. Nada quedó escrito (ROLLBACK).\n')
process.exit(fallos ? 1 : 0)
