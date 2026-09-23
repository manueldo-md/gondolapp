/**
 * probar-migracion-pdv.mjs — DRY-RUN de 20260926100000_panel_marca_pdv.sql
 *
 * Aplica la migración dentro de una transacción, la ejercita y termina con
 * ROLLBACK. No deja nada escrito.
 *
 *   node scripts/probar-migracion-pdv.mjs            (dev)
 *   GONDOLAPP_PROD=1 node scripts/probar-migracion-pdv.mjs --prod
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE LAS DOS FUNCIONES NO SE PUEDAN CONTRADECIR. Los afirmativos de
 *      `panel_marca_pdv` tienen que dar lo mismo que los de
 *      `panel_marca_series`. Si se separan, vuelve el bug que esta etapa cierra:
 *      la misma pantalla diciendo 64% arriba y 0% por ciudad.
 *
 *   2. QUE VISITAR NO SEA MEDIR. Un comercio visitado sin pregunta de presencia
 *      tiene que aparecer con `con_valor = 0`, no desaparecer y no contar como
 *      ausencia. Es la diferencia entre "el producto no está" y "no
 *      preguntamos", y la marca actúa distinto en cada caso.
 *
 *   3. QUE NADIE MIDA MÁS DE LO QUE VISITÓ.
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

try {
  await c.query('BEGIN')

  // ── CONTROL — el estado roto de HOY ────────────────────────────────────────
  // La presencia por ciudad salía de contar fotos.declaracion. Para una marca
  // que mide con preguntas tipificadas, eso es cero en todas las ciudades.
  console.log('\n▸ CONTROL — lo que la cobertura por ciudad cuenta HOY')
  const roto = (await c.query(`
    SELECT ma.razon_social AS marca,
           count(DISTINCT f.comercio_id) FILTER (WHERE f.declaracion = 'producto_presente')::int AS con_presencia
      FROM campanas c
      JOIN marcas ma ON ma.id = c.marca_id
      LEFT JOIN fotos f ON f.campana_id = c.id AND f.estado = 'aprobada'
     GROUP BY 1 ORDER BY 1`)).rows
  for (const r of roto) console.log(`   ·  ${r.marca}: ${r.con_presencia} PDV con presencia`)

  // ── Aplicar ────────────────────────────────────────────────────────────────
  const ARCHIVO = 'supabase/migrations/20260926100000_panel_marca_pdv.sql'
  const crudo = fs.readFileSync(ARCHIVO, 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(`No se pudieron sacar el BEGIN/COMMIT (${sacados}). Se aborta.`)
  }
  await c.query(sql)
  console.log('\n▸ Migración aplicada (el bloque DO no tiró)')

  const marcas = (await c.query(`SELECT id, razon_social FROM marcas ORDER BY razon_social`)).rows

  console.log('\n▸ LAS DOS FUNCIONES NO SE PUEDEN CONTRADECIR')
  for (const m of marcas) {
    const r = await uno(`
      SELECT (SELECT coalesce(sum(verdaderos), 0)::int FROM public.panel_marca_pdv($1))    AS pdv,
             (SELECT coalesce(sum(verdaderos), 0)::int FROM public.panel_marca_series($1)
               WHERE campana_id IS NULL AND metrica_slug = 'presencia')                    AS serie`,
      [m.id])
    caso(`${m.razon_social}: afirmativos por PDV = afirmativos de la serie`, r.pdv, r.serie)
  }

  console.log('\n▸ VISITAR NO ES MEDIR')
  const brecha = await uno(`
    SELECT count(*)::int AS pdv,
           count(*) FILTER (WHERE con_valor = 0)::int AS sin_medir,
           count(*) FILTER (WHERE con_valor > misiones)::int AS imposibles
      FROM public.panel_marca_pdv(
        (SELECT c.marca_id FROM misiones mi JOIN campanas c ON c.id = mi.campana_id
          WHERE c.marca_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1))`)
  caso('nadie mide más de lo que visita', brecha.imposibles, 0)
  console.log(`   ·  ${brecha.pdv} PDV, de los cuales ${brecha.sin_medir} visitados sin medir presencia`)
  caso('CONTROL — hay PDV visitados sin medir (si no, el caso no se probó)',
    brecha.sin_medir > 0, true)

  console.log('\n▸ Todo PDV tiene al menos una visita')
  const sinVisita = await uno(`
    SELECT count(*)::int AS n FROM public.panel_marca_pdv(
      (SELECT id FROM marcas ORDER BY razon_social LIMIT 1)) WHERE misiones < 1`)
  caso('ninguno con 0 misiones', sinVisita.n, 0)

  console.log('\n▸ Permisos')
  const perm = await uno(`
    SELECT has_function_privilege('service_role',  'public.panel_marca_pdv(uuid)', 'EXECUTE') AS srv,
           has_function_privilege('authenticated', 'public.panel_marca_pdv(uuid)', 'EXECUTE') AS auth,
           has_function_privilege('anon',          'public.panel_marca_pdv(uuid)', 'EXECUTE') AS anon`)
  caso('service_role sí, authenticated no, anon no',
    { srv: perm.srv, auth: perm.auth, anon: perm.anon }, { srv: true, auth: false, anon: false })

  console.log('\n▸ Una marca inexistente devuelve vacío, no todo')
  const vacia = await uno(`
    SELECT count(*)::int AS n
      FROM public.panel_marca_pdv('00000000-0000-0000-0000-000000000000')`)
  caso('cero filas', vacia.n, 0)

} finally {
  await c.query('ROLLBACK')
  console.log(`\n(ROLLBACK — ${nombreDeRef(ref)} quedó exactamente como estaba)`)
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
