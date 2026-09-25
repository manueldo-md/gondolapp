/**
 * probar-migracion-drop-zona-id.mjs — dry-run de 20261005100000.
 *
 *   node scripts/probar-migracion-drop-zona-id.mjs --ref <project-ref>
 *
 * Aplica la migración DENTRO de una transacción y termina con ROLLBACK. No
 * deja nada escrito, que en un DROP no es un detalle: es la diferencia entre
 * probarlo y hacerlo.
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE NO SE PIERDA NINGÚN COMERCIO NI NINGUNA LOCALIDAD. Se compara el
 *      mapa id → localidad_id completo, ANTES y DESPUÉS. Un DROP que se lleve
 *      algo de al lado se ve acá y no en producción.
 *
 *   2. QUE LAS PRECONDICIONES MUERDAN. Son dos y ninguna se ejercita sola:
 *        · un comercio con zona y SIN localidad → la migración se niega;
 *        · una vista colgada de la columna      → la migración se niega.
 *      Una precondición que nadie disparó es una línea que podría estar mal
 *      escrita sin que se note. Es lo que justifica este archivo.
 *
 *   3. QUE SE VAYA LA COLUMNA Y NINGUNA MÁS. Las dos direcciones: `zona_id`
 *      vive en TRES tablas y solo se va de una.
 *
 *   4. QUE SEA IDEMPOTENTE. Correrla dos veces tiene que dar lo mismo.
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

const RUTA = join(AQUI, '..', 'supabase', 'migrations', '20261005100000_drop_comercios_zona_id.sql')

/**
 * El BEGIN/COMMIT del archivo se saca: ese COMMIT cerraría NUESTRA transacción
 * y el DROP quedaría hecho de verdad. Si el reemplazo no matchea exactamente
 * dos veces se aborta — acá un descuido no deja un test en rojo, deja una
 * columna borrada.
 */
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
/** Devuelve el mensaje de error, o null si no falló. */
async function falla(q) { try { await pg.query(q); return null } catch (e) { return e.message } }

const hayColumna = async (tabla, col) => (await uno(
  `SELECT count(*)::int n FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [tabla, col])).n === 1

console.log(`\n▸ Dry-run sobre ${nombreDeRef(ref)}`)

try {
  // ═══ Parte 1: el camino feliz ═══════════════════════════════════════════
  await pg.query('BEGIN')

  caso('CONTROL — la columna existe antes de empezar', await hayColumna('comercios', 'zona_id'), true)

  const geoAntes = await todas(`SELECT id, localidad_id FROM comercios ORDER BY id`)
  const conZona = (await uno(`SELECT count(*)::int n FROM comercios WHERE zona_id IS NOT NULL`)).n
  const huerfanos = (await uno(
    `SELECT count(*)::int n FROM comercios WHERE zona_id IS NOT NULL AND localidad_id IS NULL`)).n
  const otrasAntes = await uno(`
    SELECT (SELECT count(*)::int FROM campana_zonas)   cz,
           (SELECT count(*)::int FROM gondolero_zonas) gz,
           (SELECT count(*)::int FROM zonas)           z`)

  console.log(`\n▸ Estado de partida: ${geoAntes.length} comercios, ${conZona} con zona, ${huerfanos} sin localidad`)
  console.log(`   campana_zonas ${otrasAntes.cz} · gondolero_zonas ${otrasAntes.gz} · zonas ${otrasAntes.z}`)

  if (huerfanos > 0) {
    console.log('\n   ⊘ La precondición NO se cumple en esta base: hay comercios con zona y sin')
    console.log('     localidad. La migración se va a negar, y hace bien. Correr primero')
    console.log('     scripts/reparar-localidades.mts.')
  }

  console.log('\n▸ 1. La migración corre sobre los datos de hoy')
  caso('aplicó sin excepción', await falla(SQL), null)

  console.log('\n▸ 2. No se perdió ningún comercio ni ninguna localidad')
  const geoDesp = await todas(`SELECT id, localidad_id FROM comercios ORDER BY id`)
  caso(`los ${geoAntes.length} comercios siguen, con la MISMA localidad cada uno`,
    JSON.stringify(geoDesp), JSON.stringify(geoAntes))

  console.log('\n▸ 3. Se fue la columna, y su FK con ella')
  caso('comercios.zona_id ya no está', await hayColumna('comercios', 'zona_id'), false)
  caso('comercios_zona_id_fkey tampoco', (await uno(
    `SELECT count(*)::int n FROM pg_constraint
      WHERE conrelid='public.comercios'::regclass AND conname='comercios_zona_id_fkey'`)).n, 0)

  console.log('\n▸ 4. LA OTRA DIRECCIÓN: no se llevó nada que no fuera suyo')
  caso('campana_zonas.zona_id sigue',   await hayColumna('campana_zonas', 'zona_id'), true)
  caso('gondolero_zonas.zona_id sigue', await hayColumna('gondolero_zonas', 'zona_id'), true)
  caso('comercios.localidad_id sigue',  await hayColumna('comercios', 'localidad_id'), true)
  const otrasDesp = await uno(`
    SELECT (SELECT count(*)::int FROM campana_zonas)   cz,
           (SELECT count(*)::int FROM gondolero_zonas) gz,
           (SELECT count(*)::int FROM zonas)           z`)
  caso('y las tres tablas tienen las mismas filas', otrasDesp, otrasAntes)

  console.log('\n▸ 5. Idempotente')
  caso('correrla de nuevo no falla', await falla(SQL), null)
  caso('y la columna sigue sin estar', await hayColumna('comercios', 'zona_id'), false)

  await pg.query('ROLLBACK')

  // ═══ Parte 2: que las precondiciones MUERDAN ════════════════════════════
  // Las dos se prueban CREANDO el estado que tienen que rechazar. Sin esto son
  // dos IF que nadie ejercitó.

  console.log('\n▸ 6. Un comercio con zona y SIN localidad la hace abortar')
  await pg.query('BEGIN')
  const z = await uno(`SELECT id FROM zonas LIMIT 1`)
  if (!z) {
    console.log('   ⊘  NO VERIFICABLE: la tabla zonas está vacía')
  } else {
    await pg.query(`
      INSERT INTO comercios (nombre, lat, lng, zona_id, localidad_id)
      VALUES ('dry-run huérfano', -31.4, -58.0, $1, NULL)`, [z.id])
    const e = await falla(SQL)
    caso('la migración aborta', e !== null, true)
    caso('y dice cuántos son y qué correr',
      /tienen zona y NO tienen localidad/.test(e ?? '') && /reparar-localidades/.test(e ?? ''), true)
  }
  await pg.query('ROLLBACK')
  caso('CONTROL — la columna sigue ahí después del rollback',
    await hayColumna('comercios', 'zona_id'), true)

  console.log('\n▸ 7. Una vista colgada de la columna también la hace abortar')
  await pg.query('BEGIN')
  await pg.query(`CREATE VIEW public.v_dry_run_zona AS SELECT id, zona_id FROM comercios`)
  const e2 = await falla(SQL)
  caso('la migración aborta', e2 !== null, true)
  caso('y nombra lo que encontró', /colgando de la columna además de su FK/.test(e2 ?? ''), true)
  await pg.query('ROLLBACK')

  console.log('\n▸ 8. Y la base quedó exactamente como estaba')
  caso('comercios.zona_id sigue', await hayColumna('comercios', 'zona_id'), true)
  caso('su FK también', (await uno(
    `SELECT count(*)::int n FROM pg_constraint
      WHERE conrelid='public.comercios'::regclass AND conname='comercios_zona_id_fkey'`)).n, 1)
  caso('la vista del dry-run no quedó', (await uno(
    `SELECT count(*)::int n FROM pg_views WHERE schemaname='public' AND viewname='v_dry_run_zona'`)).n, 0)
  caso('el mapa de localidades es el de antes',
    JSON.stringify(await todas(`SELECT id, localidad_id FROM comercios ORDER BY id`)),
    JSON.stringify(geoAntes))

} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e.message}`)
  try { await pg.query('ROLLBACK') } catch { /* la transacción ya estaba cerrada */ }
} finally {
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal — NO aplicar\n` : '\n✓ Dry-run limpio (ROLLBACK hecho). Nada quedó escrito.\n')
process.exit(fallos ? 1 : 0)
