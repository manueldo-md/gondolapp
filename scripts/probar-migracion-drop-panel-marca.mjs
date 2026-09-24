/**
 * probar-migracion-drop-panel-marca.mjs
 *   DRY-RUN de 20260929100000_drop_panel_marca.sql
 *
 * Aplica la migración dentro de una transacción, la ejercita y termina con
 * ROLLBACK. No deja nada escrito.
 *
 *   node scripts/probar-migracion-drop-panel-marca.mjs            (dev)
 *   GONDOLAPP_PROD=1 node scripts/probar-migracion-drop-panel-marca.mjs --prod
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE EL PANEL SIGA RESPONDIENDO DESPUÉS DEL DROP. Es lo único que
 *      importa: se comparan las filas que devuelven las tres funciones nuevas
 *      ANTES y DESPUÉS de borrar las viejas, para cada marca. Si el DROP se
 *      lleva algo de lo que dependen, se ve acá y no en producción.
 *
 *   2. QUE SE VAYAN LAS TRES Y NINGUNA MÁS. Las dos direcciones. Chequear una
 *      sola deja pasar un DROP de más, que es el error caro.
 *
 *   3. QUE LA PRECONDICIÓN MUERDA. Si las funciones nuevas no estuvieran, la
 *      migración tiene que negarse a borrar las viejas. Se prueba de verdad:
 *      se dropean las nuevas en una transacción aparte y se corre la migración
 *      esperando que EXPLOTE.
 *
 * El punto 3 es el que justifica este archivo. Los otros dos los verifica el
 * bloque DO de la migración; éste los vuelve a medir desde afuera y los
 * imprime, porque un bloque que no tira es una afirmación que no se puede leer.
 */
import pg from 'pg'
import fs from 'fs'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'

if (esProd && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para correrlo contra producción hace falta GONDOLAPP_PROD=1.\n')
  process.exit(1)
}

const cred = credencialesDeRef(ref)
if (!cred?.vars.PGURL) { console.error(`\n✗ Sin PGURL para ${ref}\n`); process.exit(1) }

console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
const uno = async (sql, args = []) => (await c.query(sql, args)).rows[0]
const todas = async (sql, args = []) => (await c.query(sql, args)).rows

const ARCHIVO = 'supabase/migrations/20260929100000_drop_panel_marca.sql'

/**
 * El BEGIN/COMMIT del archivo se saca: ese COMMIT cerraría NUESTRA transacción
 * y el DROP quedaría escrito de verdad. Si el reemplazo no matchea, se aborta —
 * acá un borrado silencioso tiene daño real.
 */
function sqlDeLaMigracion() {
  const crudo = fs.readFileSync(ARCHIVO, 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(`No se pudieron sacar el BEGIN/COMMIT (${sacados}). Se aborta.`)
  }
  return sql
}

const pgArr = ids => `{${ids.join(',')}}`
const cuentaPorNombre = `
  SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname LIKE $1`

try {
  // ═══ Parte 1: el camino feliz ═════════════════════════════════════════════
  await c.query('BEGIN')

  const marcas = await todas(`SELECT id, razon_social FROM marcas ORDER BY razon_social`)
  const idsPorMarca = new Map()
  for (const m of marcas) {
    const { ids } = await uno(
      `SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids FROM campanas WHERE marca_id = $1`,
      [m.id])
    idsPorMarca.set(m.id, ids)
  }

  // Lo que las funciones NUEVAS devuelven hoy, con las viejas todavía puestas.
  const antes = new Map()
  for (const m of marcas) {
    const ids = pgArr(idsPorMarca.get(m.id))
    antes.set(m.id, {
      series:  await todas(`SELECT * FROM public.panel_series('${ids}')`),
      visitas: await todas(`SELECT * FROM public.panel_visitas('${ids}')`),
      pdv:     await todas(`SELECT * FROM public.panel_pdv('${ids}')`),
    })
  }

  const { n: viejasAntes } = await uno(cuentaPorNombre, ['panel\\_marca\\_%'])
  console.log(`\n▸ Estado de partida: ${viejasAntes} funciones panel_marca_*`)

  await c.query(sqlDeLaMigracion())
  console.log('▸ Migración aplicada — el bloque DO no tiró')

  console.log('\n▸ 1. El panel devuelve EXACTAMENTE lo mismo después del DROP')
  for (const m of marcas) {
    const ids = pgArr(idsPorMarca.get(m.id))
    const despues = {
      series:  await todas(`SELECT * FROM public.panel_series('${ids}')`),
      visitas: await todas(`SELECT * FROM public.panel_visitas('${ids}')`),
      pdv:     await todas(`SELECT * FROM public.panel_pdv('${ids}')`),
    }
    const a = antes.get(m.id)
    for (const k of ['series', 'visitas', 'pdv']) {
      caso(`${m.razon_social.padEnd(18)} ${k.padEnd(7)} · ${String(a[k].length).padStart(3)} filas idénticas`,
        JSON.stringify(despues[k]) === JSON.stringify(a[k]), true)
    }
  }

  console.log('\n▸ 2. Se fueron las tres, y ninguna más')
  caso('cero funciones panel_marca_*',
    (await uno(cuentaPorNombre, ['panel\\_marca\\_%'])).n, 0)
  caso('CONTROL — antes había tres', viejasAntes, 3)

  const nuevas = await todas(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname IN ('panel_series','panel_visitas','panel_pdv')
     ORDER BY p.proname`)
  caso('las tres nuevas siguen, con una firma cada una',
    nuevas.map(r => `${r.proname}(${r.args})`),
    ['panel_pdv(_campanas uuid[])', 'panel_series(_campanas uuid[])', 'panel_visitas(_campanas uuid[])'])

  console.log('\n▸ 3. Permisos intactos')
  for (const fn of ['panel_series(uuid[])', 'panel_visitas(uuid[])', 'panel_pdv(uuid[])']) {
    const r = await uno(`
      SELECT has_function_privilege('anon',          'public.${fn}', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') AS auth,
             has_function_privilege('service_role',  'public.${fn}', 'EXECUTE') AS srv`)
    caso(`${fn.padEnd(22)} anon=no auth=no service_role=sí`, [r.anon, r.auth, r.srv], [false, false, true])
  }

  await c.query('ROLLBACK')

  // ═══ Parte 2: que la precondición MUERDA ══════════════════════════════════
  // Si las funciones nuevas no están, la migración tiene que negarse a borrar
  // las viejas. Sin este caso, la precondición es una línea que nadie ejercitó
  // y que podría estar mal escrita sin que se note.
  console.log('\n▸ 4. Sin las funciones nuevas, la migración se NIEGA a borrar')
  await c.query('BEGIN')
  await c.query(`DROP FUNCTION IF EXISTS public.panel_series(uuid[])`)
  await c.query(`DROP FUNCTION IF EXISTS public.panel_visitas(uuid[])`)
  await c.query(`DROP FUNCTION IF EXISTS public.panel_pdv(uuid[])`)

  let explotó = false
  let mensaje = ''
  try {
    await c.query(sqlDeLaMigracion())
  } catch (e) {
    explotó = true
    mensaje = e.message
  }
  caso('la migración aborta', explotó, true)
  caso('y dice por qué', /faltan las funciones nuevas/.test(mensaje), true)

  // La transacción quedó abortada por la excepción: no se puede consultar hasta
  // el ROLLBACK. Que las viejas sobrevivieron lo garantiza el propio abort.
  await c.query('ROLLBACK')

  console.log('\n▸ 5. Y la base quedó como estaba')
  caso('las tres viejas siguen ahí',
    (await uno(cuentaPorNombre, ['panel\\_marca\\_%'])).n, 3)
  caso('y las tres nuevas también',
    (await uno(cuentaPorNombre, ['panel\\_%'])).n >= 6, true)

} catch (e) {
  fallos++
  console.error(`\n✗ ${e.message}`)
  try { await c.query('ROLLBACK') } catch { /* la transacción ya estaba cerrada */ }
} finally {
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba. Nada quedó escrito.\n')
process.exitCode = fallos ? 1 : 0
