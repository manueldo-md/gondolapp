/**
 * probar-migracion-panel-provincia.mjs — dry-run de 20261008100000.
 *
 *   node scripts/probar-migracion-panel-provincia.mjs --ref <project-ref>
 *
 * Aplica la migración DENTRO de una transacción y termina con ROLLBACK.
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE EL PANEL DEVUELVA EXACTAMENTE LO MISMO. Se comparan las columnas
 *      viejas, fila por fila y campaña por campaña, antes y después. Una
 *      función que se recrea es una función que se puede recrear mal, y el
 *      síntoma sería un número distinto en un dashboard que nadie audita.
 *
 *   2. QUE LOS PERMISOS NO SE ABRAN. El DROP se los lleva y Supabase tiene un
 *      ALTER DEFAULT PRIVILEGES que le da EXECUTE a anon y authenticated sobre
 *      cada función nueva, EXPLÍCITAMENTE. Sin los REVOKE del pie, esta
 *      migración deja la función más abierta de lo que estaba — y el
 *      parámetro es una lista de campañas, un dato que varias pantallas ya
 *      muestran. Se prueba de verdad: se corre la migración SIN los REVOKE y
 *      se verifica que ahí sí queda abierta.
 *
 *   3. QUE LA CADENA DE CUATRO NIVELES RESUELVA. `localidades` no tiene
 *      `provincia_id`: son dos saltos, y si alguno estuviera mal el filtro
 *      mostraría de menos sin que falle nada.
 *
 *   4. QUE UN COMERCIO SIN LOCALIDAD SIGA LLEGANDO. Los JOIN son LEFT a
 *      propósito. Un INNER lo borraría del panel, y el que haga la resta va a
 *      desconfiar del resto de los números.
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

const RUTA = join(AQUI, '..', 'supabase', 'migrations', '20261008100000_panel_pdv_con_provincia.sql')

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

/**
 * La misma migración con los REVOKE comentados. Sirve para probar que el
 * peligro es real: sin ellos la función NUEVA queda ejecutable por
 * authenticated, porque Supabase se los da sola.
 */
const SQL_SIN_REVOKE = SQL.replace(/^REVOKE ALL ON FUNCTION public\.panel_pdv.*$/mi, '-- (sin revoke)')
if (SQL_SIN_REVOKE === SQL) {
  console.error('\n✗ No se encontró la línea del REVOKE. El caso 3 no probaría nada.\n')
  process.exit(1)
}

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

const VIEJAS = `comercio_id, comercio_nombre, comercio_tipo, lat, lng,
                localidad_id, localidad_nombre, misiones, con_valor, verdaderos, ultima_medicion`
const permisos = async () => await uno(`
  SELECT has_function_privilege('anon',          'public.panel_pdv(uuid[])', 'EXECUTE') anon,
         has_function_privilege('authenticated', 'public.panel_pdv(uuid[])', 'EXECUTE') auth,
         has_function_privilege('service_role',  'public.panel_pdv(uuid[])', 'EXECUTE') srv`)

console.log(`\n▸ Dry-run sobre ${nombreDeRef(ref)}`)

try {
  await pg.query('BEGIN')

  // Un arreglo por marca y otro con TODO: si la función se rompiera solo al
  // agrupar varias campañas, un único caso no lo vería.
  const scopes = await todas(`
    SELECT m.razon_social AS nombre, array_agg(DISTINCT c.id) AS ids
      FROM marcas m JOIN campanas c ON c.marca_id = m.id
     GROUP BY 1 ORDER BY 1`)
  const todasLasCampanas = (await uno(
    `SELECT coalesce(array_agg(DISTINCT campana_id), ARRAY[]::uuid[]) ids
       FROM misiones WHERE estado NOT IN ('descartada','rechazada')`)).ids
  scopes.push({ nombre: '(todas)', ids: todasLasCampanas })

  const antes = new Map()
  for (const s of scopes) {
    antes.set(s.nombre, await todas(
      `SELECT ${VIEJAS} FROM public.panel_pdv($1::uuid[]) ORDER BY comercio_id`, [s.ids]))
  }
  const permAntes = await permisos()
  console.log(`\n▸ Estado de partida: ${scopes.length} scopes · permisos ${JSON.stringify(permAntes)}`)

  console.log('\n▸ 1. La migración corre sobre los datos de hoy')
  caso('aplicó sin excepción', await falla(SQL), null)

  console.log('\n▸ 2. Las columnas VIEJAS devuelven exactamente lo mismo')
  for (const s of scopes) {
    const desp = await todas(
      `SELECT ${VIEJAS} FROM public.panel_pdv($1::uuid[]) ORDER BY comercio_id`, [s.ids])
    const prev = antes.get(s.nombre)
    caso(`${s.nombre.padEnd(18)} · ${String(prev.length).padStart(3)} filas idénticas`,
      JSON.stringify(desp), JSON.stringify(prev))
  }

  console.log('\n▸ 3. Los permisos siguen EXACTAMENTE como estaban')
  caso('anon=no authenticated=no service_role=sí', await permisos(),
    { anon: false, auth: false, srv: true })
  caso('CONTROL — y así estaban antes', permAntes, { anon: false, auth: false, srv: true })

  console.log('\n▸ 4. La cadena de cuatro niveles resuelve')
  const geo = await uno(`
    SELECT count(*)::int filas,
           count(*) FILTER (WHERE provincia_id IS NOT NULL)::int con_prov,
           count(*) FILTER (WHERE localidad_id IS NOT NULL AND provincia_id IS NULL)::int rotos,
           count(DISTINCT provincia_nombre)::int provincias
      FROM public.panel_pdv($1::uuid[])`, [todasLasCampanas])
  caso('ningún comercio con localidad se queda sin provincia', geo.rotos, 0)
  caso('y hay al menos una provincia', geo.provincias > 0, true)
  console.log(`       ${geo.filas} filas · ${geo.con_prov} con provincia · ${geo.provincias} provincias distintas`)

  console.log('\n▸ 5. Un comercio SIN localidad sigue llegando (los JOIN son LEFT)')
  await pg.query('SAVEPOINT s1')
  const victima = await uno(`
    SELECT comercio_id FROM public.panel_pdv($1::uuid[])
     WHERE localidad_id IS NOT NULL LIMIT 1`, [todasLasCampanas])
  if (!victima) {
    console.log('   ⊘  NO VERIFICABLE: no hay ningún comercio con localidad en el panel')
  } else {
    await pg.query(`UPDATE comercios SET localidad_id = NULL WHERE id = $1`, [victima.comercio_id])
    const f = await uno(`
      SELECT localidad_id, provincia_id FROM public.panel_pdv($1::uuid[])
       WHERE comercio_id = $2`, [todasLasCampanas, victima.comercio_id])
    caso('la fila sigue apareciendo', !!f, true)
    caso('con la geografía en NULL, no borrada', [f?.localidad_id, f?.provincia_id], [null, null])
  }
  await pg.query('ROLLBACK TO SAVEPOINT s1')

  console.log('\n▸ 6. Los DOS números del KPI salen de esta función sola')
  const kpi = await uno(`
    SELECT count(DISTINCT provincia_id)::int relevando,
           count(DISTINCT provincia_id) FILTER (WHERE verdaderos > 0)::int con_producto
      FROM public.panel_pdv($1::uuid[])`, [todasLasCampanas])
  caso('con producto nunca supera a relevando', kpi.con_producto <= kpi.relevando, true)
  console.log(`       relevando en ${kpi.relevando} · con producto en ${kpi.con_producto}`)

  console.log('\n▸ 7. Idempotente')
  caso('correrla de nuevo no falla', await falla(SQL), null)

  await pg.query('ROLLBACK')

  // ═══ Parte 2: que el peligro del DROP sea real ══════════════════════════
  // Sin esto, los REVOKE del pie parecen ceremonia. Se corre la MISMA
  // migración con esa línea comentada y se verifica que la función queda
  // abierta: es lo que pasaría si alguien los borra por prolijidad.
  console.log('\n▸ 8. SIN los REVOKE la migración SE NIEGA — y eso es mejor de lo que esperaba')
  // La primera versión de este control esperaba que la variante sin REVOKE
  // aplicara y dejara la función abierta, para mostrar el peligro. No llegó a
  // ese punto: **el bloque de verificación de la propia migración la aborta**.
  // O sea que el peligro no solo es real —Supabase efectivamente le da EXECUTE
  // a anon y authenticated sobre la función nueva— sino que además está
  // atajado ahí mismo, y no depende de que este script lo mire.
  await pg.query('BEGIN')
  const err = await falla(SQL_SIN_REVOKE)
  caso('la migración aborta', err !== null, true)
  caso('y dice qué roles quedaron con EXECUTE',
    /anon=t/.test(err ?? '') && /authenticated=t/.test(err ?? ''), true)
  caso('CONTROL — el mensaje es el de la verificación, no otro error',
    /\[panel_pdv\] Quedó ejecutable/.test(err ?? ''), true)
  await pg.query('ROLLBACK')

  console.log('\n▸ 9. Y la base quedó como estaba')
  caso('permisos intactos', await permisos(), permAntes)
  const cols = (await uno(`
    SELECT pg_get_function_result('public.panel_pdv(uuid[])'::regprocedure) r`)).r
  caso('la función vieja sigue, sin las columnas nuevas', /provincia_id/.test(cols), false)

} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e.message}`)
  try { await pg.query('ROLLBACK') } catch { /* la transacción ya estaba cerrada */ }
} finally {
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal — NO aplicar\n` : '\n✓ Dry-run limpio (ROLLBACK hecho). Nada quedó escrito.\n')
process.exit(fallos ? 1 : 0)
