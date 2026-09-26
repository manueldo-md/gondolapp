/**
 * probar-migracion-limpiar-gondolero-zonas.mjs — dry-run de 20261006100000.
 *
 *   node scripts/probar-migracion-limpiar-gondolero-zonas.mjs --ref <project-ref>
 *
 * Aplica la migración DENTRO de una transacción y termina con ROLLBACK.
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE EL AVISO VUELVA. Es el objetivo, no el borrado: se calcula el mismo
 *      `tieneZonas` que hace `gondolero/campanas/page.tsx` —mirando LAS DOS
 *      tablas— para cada gondolero afectado, antes y después. Antes tiene que
 *      dar true (por eso el cartel no aparecía) y después false.
 *
 *   2. QUE NO SE TOQUE `gondolero_localidades`. Se comparan las filas enteras,
 *      no el conteo. Confundir las dos tablas es el bug que esto limpia.
 *
 *   3. QUE LA TABLA SIGA EXISTIENDO. Esta migración vacía, no dropea: quedan
 *      cinco lectores en la app y un `to_regclass` en NULL les rompe la
 *      consulta entera.
 *
 *   4. QUE SIRVA AUNQUE LA BASE YA ESTÉ LIMPIA. En dev la tabla tiene cero
 *      filas, así que un "quedó en cero" ahí no prueba nada. El caso 5 crea
 *      una fila a propósito para que el control tenga algo que borrar.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const AQUI = dirname(fileURLToPath(import.meta.url))

const i = process.argv.indexOf('--ref')
if (i === -1 || !process.argv[i + 1]) { console.error('\n✗ Falta --ref <project-ref>\n'); process.exit(1) }
const ref = process.argv[i + 1]
const { vars } = credencialesDeRef(ref)

const RUTA = join(AQUI, '..', 'supabase', 'migrations', '20261006100000_limpiar_gondolero_zonas.sql')

/** El BEGIN/COMMIT se saca: ese COMMIT cerraría NUESTRA transacción y el DELETE quedaría hecho. */
function sqlDeLaMigracion() {
  const crudo = readFileSync(RUTA, 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(`No se pudieron sacar el BEGIN/COMMIT (${sacados} encontrados). Se aborta.`)
  }
  return sql
}
const SQL = sqlDeLaMigracion()

const pg = new Client({ connectionString: vars.PGURL, ssl: { rejectUnauthorized: false } })
await pg.connect()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
const uno = async (q, a = []) => (await pg.query(q, a)).rows[0]
const todas = async (q, a = []) => (await pg.query(q, a)).rows
async function falla(q) { try { await pg.query(q); return null } catch (e) { return e.message } }

/**
 * El mismo `tieneZonas` de `gondolero/campanas/page.tsx`, en SQL: hay zonas si
 * aparece en CUALQUIERA de las dos tablas. Mientras dé true, el cartel amarillo
 * no se muestra.
 */
const tieneZonas = async id => (await uno(`
  SELECT (EXISTS (SELECT 1 FROM gondolero_zonas       WHERE gondolero_id = $1)
       OR EXISTS (SELECT 1 FROM gondolero_localidades WHERE gondolero_id = $1)) t`, [id])).t

console.log(`\n▸ Dry-run sobre ${nombreDeRef(ref)}`)

try {
  await pg.query('BEGIN')

  const afectados = await todas(`
    SELECT DISTINCT gz.gondolero_id, p.nombre
      FROM gondolero_zonas gz JOIN profiles p ON p.id = gz.gondolero_id
     ORDER BY p.nombre`)
  const filasAntes = (await uno(`SELECT count(*)::int n FROM gondolero_zonas`)).n
  const locAntes = await todas(`SELECT gondolero_id, nivel, ref_id FROM gondolero_localidades ORDER BY 1,2,3`)

  console.log(`\n▸ Estado de partida: ${filasAntes} filas en gondolero_zonas, ${afectados.length} gondolero(s) afectado(s)`)
  console.log(`   gondolero_localidades: ${locAntes.length} filas (no se toca)`)

  const antes = []
  for (const g of afectados) antes.push([g.nombre, await tieneZonas(g.gondolero_id)])
  if (antes.length) console.log(`   tieneZonas hoy: ${antes.map(([n, t]) => `${n}=${t}`).join(' · ')}`)

  console.log('\n▸ 1. La migración corre sobre los datos de hoy')
  caso('aplicó sin excepción', await falla(SQL), null)

  console.log('\n▸ 2. EL AVISO VUELVE: tieneZonas pasa a false para los afectados')
  if (afectados.length === 0) {
    console.log('   ⊘  Esta base no tiene filas; el caso 5 lo prueba con una creada a propósito')
  } else {
    for (const g of afectados) {
      caso(`${g.nombre} — antes true, ahora false`,
        [antes.find(a => a[0] === g.nombre)[1], await tieneZonas(g.gondolero_id)], [true, false])
    }
  }

  console.log('\n▸ 3. gondolero_localidades intacta, fila por fila')
  caso(`las ${locAntes.length} filas son exactamente las mismas`,
    JSON.stringify(await todas(`SELECT gondolero_id, nivel, ref_id FROM gondolero_localidades ORDER BY 1,2,3`)),
    JSON.stringify(locAntes))

  console.log('\n▸ 4. La tabla sigue existiendo (esto vacía, no dropea)')
  caso('to_regclass no es NULL',
    (await uno(`SELECT to_regclass('public.gondolero_zonas') IS NOT NULL r`)).r, true)
  caso('y está vacía', (await uno(`SELECT count(*)::int n FROM gondolero_zonas`)).n, 0)

  console.log('\n▸ 5. Idempotente')
  caso('correrla de nuevo no falla', await falla(SQL), null)

  await pg.query('ROLLBACK')

  // ═══ Parte 2: que el borrado MUERDA de verdad ═══════════════════════════
  // En dev la tabla está vacía, así que "quedó en cero" no prueba nada. Acá se
  // crea el estado exacto del bug —un gondolero con filas en la tabla vieja y
  // ninguna en la nueva— y se verifica que la migración lo deshaga.
  console.log('\n▸ 6. Con una fila creada a propósito, la borra')
  await pg.query('BEGIN')
  const g = await uno(`
    SELECT p.id, p.nombre FROM profiles p
     WHERE p.tipo_actor = 'gondolero'
       AND NOT EXISTS (SELECT 1 FROM gondolero_localidades gl WHERE gl.gondolero_id = p.id)
     LIMIT 1`)
  const z = await uno(`SELECT id, nombre FROM zonas WHERE tipo = 'ciudad' LIMIT 1`)

  if (!g || !z) {
    console.log('   ⊘  NO VERIFICABLE: hace falta un gondolero sin localidades y una zona ciudad')
  } else {
    await pg.query(
      `INSERT INTO gondolero_zonas (gondolero_id, zona_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`, [g.id, z.id])
    caso(`${g.nombre} con "${z.nombre}" — tieneZonas es true y el cartel NO se muestra`,
      await tieneZonas(g.id), true)
    caso('la migración aplica', await falla(SQL), null)
    caso('la fila se fue', (await uno(
      `SELECT count(*)::int n FROM gondolero_zonas WHERE gondolero_id = $1`, [g.id])).n, 0)
    caso('y tieneZonas pasa a false, o sea que el cartel vuelve', await tieneZonas(g.id), false)
  }
  await pg.query('ROLLBACK')

  console.log('\n▸ 7. Y la base quedó exactamente como estaba')
  caso('gondolero_zonas tiene las filas de antes',
    (await uno(`SELECT count(*)::int n FROM gondolero_zonas`)).n, filasAntes)
  caso('gondolero_localidades también',
    JSON.stringify(await todas(`SELECT gondolero_id, nivel, ref_id FROM gondolero_localidades ORDER BY 1,2,3`)),
    JSON.stringify(locAntes))

} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e.message}`)
  try { await pg.query('ROLLBACK') } catch { /* la transacción ya estaba cerrada */ }
} finally {
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal — NO aplicar\n` : '\n✓ Dry-run limpio (ROLLBACK hecho). Nada quedó escrito.\n')
process.exit(fallos ? 1 : 0)
