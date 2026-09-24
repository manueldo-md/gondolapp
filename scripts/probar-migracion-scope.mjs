/**
 * probar-migracion-scope.mjs — DRY-RUN de 20260928100000_panel_scope_por_campana.sql
 *
 * Aplica la migración dentro de una transacción, la ejercita y termina con
 * ROLLBACK. No deja nada escrito.
 *
 *   node scripts/probar-migracion-scope.mjs            (dev)
 *   GONDOLAPP_PROD=1 node scripts/probar-migracion-scope.mjs --prod
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE EL SCOPE DE MARCA NO CAMBIE NI UN NÚMERO. Es la condición del
 *      tramo. El bloque DO de la migración ya lo verifica y aborta si falla;
 *      acá se vuelve a medir DESDE AFUERA y se imprimen los números, porque un
 *      bloque que no tira es una afirmación que no se puede leer.
 *
 *   2. QUE EL SCOPE FALLE CERRADO. Un arreglo vacío, un uuid inexistente y el
 *      arreglo de OTRA marca tienen que devolver lo que corresponde y nada más.
 *      El modo de falla de un scope por lista es mostrar de más, y es
 *      silencioso: nadie se queja de ver datos.
 *
 *   3. QUE UNA DISTRIBUIDORA OBTENGA ALGO. Es lo que el tramo vino a habilitar
 *      y hoy es imposible: `panel_marca_*` filtra por dueño y una distri no es
 *      dueña de ninguna campaña de marca.
 *
 *   4. QUE LAS VIEJAS SIGAN AHÍ. El DROP va en otra migración, después de
 *      verificar el deploy: si esta se las llevara, el código desplegado se
 *      queda llamando funciones que no existen.
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

// ── ESTE DRY-RUN QUEDÓ ATRÁS ────────────────────────────────────────────────
// Verifica que las funciones nuevas den lo mismo que `panel_marca_*`, que `20260929100000` borró. La migración que este
// script aplica no las recrea, así que contra una base al día fallaría con un
// error de SQL que no explica nada. Se omite, y se dice por qué.
//
// No se borra el archivo: documenta cómo se verificó esa migración, y el día
// que haya que reconstruir un ambiente desde cero —donde las funciones existen
// hasta que corre el DROP— vuelve a servir.
{
  const { rows } = await c.query(`
    SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname LIKE 'panel\\_marca\\_%'`)
  if (rows[0].n === 0) {
    console.log(`\n⊘ OMITIDO — las funciones panel_marca_* ya no existen (20260929100000).\n` +
      `  Este dry-run verifica una migración que quedó superada; no hay nada que probar.\n`)
    await c.end()
    process.exit(0)
  }
}

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
const uno = async (sql, args = []) => (await c.query(sql, args)).rows[0]
const n = v => Number(v)

/** Filas distintas entre dos consultas, en las dos direcciones y con multiplicidad. */
const NADA_DISTINTO = (a, b) => `
  SELECT count(*)::int AS dif FROM (
    (${a} EXCEPT ALL ${b}) UNION ALL (${b} EXCEPT ALL ${a})
  ) d`

try {
  await c.query('BEGIN')

  // ── Aplicar ────────────────────────────────────────────────────────────────
  // El BEGIN/COMMIT del archivo se saca: ese COMMIT cerraría NUESTRA
  // transacción y escribiría de verdad. Si el reemplazo no matchea, se aborta
  // en lugar de seguir — un borrado silencioso acá tiene daño real.
  const ARCHIVO = 'supabase/migrations/20260928100000_panel_scope_por_campana.sql'
  const crudo = fs.readFileSync(ARCHIVO, 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(`No se pudieron sacar el BEGIN/COMMIT (${sacados}). Se aborta.`)
  }
  await c.query(sql)
  console.log('\n▸ Migración aplicada — el bloque DO no tiró')
  console.log('   (o sea que el invariante de marca ya pasó DENTRO de la transacción)')

  // ── 1. El invariante, medido de nuevo y con los números a la vista ─────────
  console.log('\n▸ 1. El scope de marca no cambia ni un número')
  const marcas = (await c.query(`SELECT id, razon_social FROM marcas ORDER BY razon_social`)).rows

  for (const m of marcas) {
    const ids = (await c.query(
      `SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids FROM campanas WHERE marca_id = $1`,
      [m.id])).rows[0].ids

    for (const [fn, vieja, nueva] of [
      ['series',  `SELECT * FROM public.panel_marca_series('${m.id}')`,  `SELECT * FROM public.panel_series('${pgArr(ids)}')`],
      ['visitas', `SELECT * FROM public.panel_marca_visitas('${m.id}')`, `SELECT * FROM public.panel_visitas('${pgArr(ids)}')`],
      ['pdv',     `SELECT * FROM public.panel_marca_pdv('${m.id}')`,     `SELECT * FROM public.panel_pdv('${pgArr(ids)}')`],
    ]) {
      const { dif } = await uno(NADA_DISTINTO(vieja, nueva))
      const { c: filas } = await uno(`SELECT count(*)::int AS c FROM (${nueva}) x`)
      caso(`${m.razon_social.padEnd(16)} ${fn.padEnd(7)} · ${String(filas).padStart(3)} filas idénticas`, dif, 0)
    }
  }

  // ── 2. Que el scope falle CERRADO ─────────────────────────────────────────
  console.log('\n▸ 2. El scope falla cerrado, no abierto')
  caso('arreglo vacío → serie vacía',
    n((await uno(`SELECT count(*) AS c FROM public.panel_series(ARRAY[]::uuid[])`)).c), 0)
  caso('arreglo vacío → visitas vacías',
    n((await uno(`SELECT count(*) AS c FROM public.panel_visitas(ARRAY[]::uuid[])`)).c), 0)
  caso('arreglo vacío → pdv vacío',
    n((await uno(`SELECT count(*) AS c FROM public.panel_pdv(ARRAY[]::uuid[])`)).c), 0)
  caso('uuid inexistente → nada',
    n((await uno(`SELECT count(*) AS c FROM public.panel_pdv(ARRAY['00000000-0000-0000-0000-000000000000'::uuid])`)).c), 0)

  // El que de verdad importa: pedir las campañas de OTRA marca no devuelve las
  // propias ni las mezcla. Es el control de que la lista ES el permiso.
  if (marcas.length >= 2) {
    const [a, b] = marcas
    const idsA = (await c.query(`SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids FROM campanas WHERE marca_id = $1`, [a.id])).rows[0].ids
    const { dif } = await uno(NADA_DISTINTO(
      `SELECT * FROM public.panel_pdv('${pgArr(idsA)}')`,
      `SELECT * FROM public.panel_marca_pdv('${a.id}')`))
    caso(`las campañas de ${a.razon_social} no traen nada de ${b.razon_social}`, dif, 0)
  }

  // ── 3. Una campaña sola: el parámetro que se va ───────────────────────────
  console.log('\n▸ 3. Filtrar por una campaña es un arreglo de un elemento')
  const conCampana = (await c.query(`
    SELECT ma.id AS marca_id, ma.razon_social, c.id AS campana_id, c.nombre
      FROM campanas c JOIN marcas ma ON ma.id = c.marca_id
     ORDER BY ma.razon_social LIMIT 3`)).rows
  for (const r of conCampana) {
    const { dif } = await uno(NADA_DISTINTO(
      `SELECT * FROM public.panel_marca_pdv('${r.marca_id}', '${r.campana_id}')`,
      `SELECT * FROM public.panel_pdv(ARRAY['${r.campana_id}'::uuid])`))
    caso(`${r.nombre.slice(0, 40)}`, dif, 0)
  }

  // ── 4. La distribuidora, que es lo que esto habilita ──────────────────────
  console.log('\n▸ 4. Una distribuidora obtiene su panel (hoy es imposible)')
  const distris = (await c.query(`
    SELECT d.id, d.razon_social, count(c.id)::int AS campanas
      FROM distribuidoras d LEFT JOIN campanas c ON c.distri_id = d.id
     GROUP BY 1, 2 ORDER BY campanas DESC, d.razon_social`)).rows

  let alguna = false
  for (const d of distris) {
    const ids = (await c.query(`SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids FROM campanas WHERE distri_id = $1`, [d.id])).rows[0].ids
    const serie   = n((await uno(`SELECT count(*) AS c FROM public.panel_series('${pgArr(ids)}')`)).c)
    const visitas = n((await uno(`SELECT count(*) AS c FROM public.panel_visitas('${pgArr(ids)}')`)).c)
    const pdv     = n((await uno(`SELECT count(*) AS c FROM public.panel_pdv('${pgArr(ids)}')`)).c)
    console.log(`   ·  ${d.razon_social.padEnd(24)} ${String(d.campanas).padStart(2)} campañas → ` +
                `serie ${String(serie).padStart(3)} · visitas ${String(visitas).padStart(2)} · pdv ${String(pdv).padStart(3)}`)
    if (pdv > 0) alguna = true
    // Una distri sin campañas no puede ver NADA. Es el caso de alta nueva.
    if (d.campanas === 0) caso(`   ${d.razon_social}: sin campañas → sin datos`, [serie, visitas, pdv], [0, 0, 0])
  }
  caso('al menos una distribuidora tiene PDV que mostrar', alguna, true)

  // ── 5. Las viejas siguen ahí ──────────────────────────────────────────────
  console.log('\n▸ 5. Las funciones viejas NO se dropean en esta migración')
  const { c: viejas } = await uno(`
    SELECT count(*)::int AS c FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname LIKE 'panel\\_marca\\_%'`)
  caso('las tres panel_marca_* siguen existiendo', viejas, 3)

  const { c: nuevas } = await uno(`
    SELECT count(*)::int AS c FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname IN ('panel_series','panel_visitas','panel_pdv')`)
  caso('y hay UNA sola firma de cada nueva', nuevas, 3)

  // ── 6. Permisos ───────────────────────────────────────────────────────────
  console.log('\n▸ 6. Permisos')
  for (const fn of ['panel_series(uuid[])', 'panel_visitas(uuid[])', 'panel_pdv(uuid[])']) {
    const r = await uno(`
      SELECT has_function_privilege('anon',          'public.${fn}', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') AS auth,
             has_function_privilege('service_role',  'public.${fn}', 'EXECUTE') AS srv`)
    caso(`${fn.padEnd(22)} anon=no auth=no service_role=sí`, [r.anon, r.auth, r.srv], [false, false, true])
  }

} catch (e) {
  fallos++
  console.error(`\n✗ ${e.message}`)
} finally {
  await c.query('ROLLBACK')
  console.log('\n▸ ROLLBACK — la base quedó exactamente como estaba.')
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0

/** Un uuid[] de JS al literal de Postgres. Los ids vienen de la base, no del usuario. */
function pgArr(ids) {
  return `{${ids.join(',')}}`
}
