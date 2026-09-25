/**
 * medir-superficie-plata.mts — cuánta plata queda al alcance de un IDOR.
 *
 *   npx tsx scripts/medir-superficie-plata.mts            (dev)
 *   npx tsx scripts/medir-superficie-plata.mts --prod
 *
 * SOLO LECTURA. No escribe una fila.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * `aprobarFoto`, `aprobarFotoMarca` y `aprobarFotoAdmin` reciben un `fotoId`
 * del cliente y no preguntan de quién es la campaña de esa foto. Decir "es un
 * agujero" es barato; lo que decide la prioridad es CUÁNTO paga hoy y a
 * cuántas filas llega. Esto lo cuenta contra datos reales.
 *
 * Tres preguntas, y ninguna se contesta de memoria:
 *
 *   1. ¿Cuántas fotos pendientes puede aprobar una distri que NO es la dueña
 *      de la campaña, y cuántos puntos valen?
 *   2. ¿Cuántas de esas son "unidad de pago" —sin misión— o sea que acreditan
 *      en el acto, sin retención ni mínimo?
 *   3. ¿Cuántas fotos YA aprobadas se pueden volver a aprobar? Ninguna de las
 *      tres chequea el estado antes de escribir, y el insert en
 *      `movimientos_puntos` no tiene índice único: reaprobar vuelve a pagar.
 */
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const { vars } = credencialesDeRef(ref)

createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const pg = new Client({ connectionString: vars.PGURL })
await pg.connect()

console.log(`\n▸ ${nombreDeRef(ref)}\n`)

// `puntos_por_mision` si es > 0, si no `puntos_por_foto`. Es la misma
// expresión que usan las tres actions; si se separan, este número miente.
const PUNTOS = `CASE WHEN coalesce(c.puntos_por_mision,0) > 0
                    THEN c.puntos_por_mision ELSE coalesce(c.puntos_por_foto,0) END`

// ── 1. Cuántos dueños distintos hay ─────────────────────────────────────────
// Sin al menos dos tenants con fotos, "cruzado" no significa nada.
{
  const { rows } = await pg.query(`
    SELECT count(DISTINCT c.distri_id) FILTER (WHERE c.distri_id IS NOT NULL) distris,
           count(DISTINCT c.marca_id)  FILTER (WHERE c.marca_id  IS NOT NULL) marcas
      FROM fotos f JOIN campanas c ON c.id = f.campana_id`)
  console.log(`  dueños de campañas con fotos: ${rows[0].distris} distris · ${rows[0].marcas} marcas`)
}

// ── 2. Las pendientes: qué puede aprobar quien no es el dueño ───────────────
console.log('\n▸ Fotos PENDIENTES, por dueño de la campaña')
{
  const { rows } = await pg.query(`
    SELECT coalesce(d.razon_social, m.razon_social, '(sin dueño)') dueno,
           count(*) fotos,
           sum(${PUNTOS}) puntos,
           count(*) FILTER (WHERE f.mision_id IS NULL AND c.tipo IS DISTINCT FROM 'comercios') al_toque
      FROM fotos f
      JOIN campanas c ON c.id = f.campana_id
      LEFT JOIN distribuidoras d ON d.id = c.distri_id
      LEFT JOIN marcas m ON m.id = c.marca_id
     WHERE f.estado = 'pendiente'
     GROUP BY 1 ORDER BY 3 DESC NULLS LAST`)
  if (!rows.length) console.log('  (ninguna)')
  for (const r of rows) {
    console.log(`  ${String(r.dueno).slice(0, 28).padEnd(28)} ${String(r.fotos).padStart(4)} fotos · ` +
      `${String(r.puntos ?? 0).padStart(6)} puntos · ${r.al_toque} acreditan sin retención`)
  }
  const total = rows.reduce((s: number, r: { puntos: string }) => s + Number(r.puntos ?? 0), 0)
  console.log(`  ─────────────────────────────────────────`)
  console.log(`  Cualquier distri/marca/repositora autenticada las puede aprobar todas: ${total} puntos`)
}

// ── 3. El replay: reaprobar lo ya aprobado ──────────────────────────────────
// Ninguna de las tres actions mira `estado` antes de escribir, y
// `movimientos_puntos` no tiene índice único por foto: el segundo insert entra.
console.log('\n▸ Fotos YA APROBADAS que se pueden volver a aprobar (replay)')
{
  const { rows } = await pg.query(`
    SELECT count(*) n, coalesce(sum(${PUNTOS}), 0) puntos
      FROM fotos f JOIN campanas c ON c.id = f.campana_id
     WHERE f.estado = 'aprobada'
       AND f.mision_id IS NULL
       AND c.tipo IS DISTINCT FROM 'comercios'
       AND ${PUNTOS} > 0`)
  console.log(`  ${rows[0].n} fotos · ${rows[0].puntos} puntos POR PASADA, repetible sin límite`)

  const { rows: idx } = await pg.query(`
    SELECT count(*) n FROM pg_indexes
     WHERE tablename = 'movimientos_puntos' AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%foto_id%'`)
  console.log(`  índices únicos sobre movimientos_puntos(foto_id): ${idx[0].n}`)
}

// ── 4. El otro camino: validar el alta de un comercio ajeno ─────────────────
// `puedeTocar` deja pasar todo comercio sin `campana_id`, y ese es el caso
// normal: el alta oportunista no la escribe a propósito.
console.log('\n▸ Comercios pendientes que `puedeTocar` deja pasar a CUALQUIER distri')
{
  const { rows } = await pg.query(`
    SELECT count(*) FILTER (WHERE campana_id IS NULL) sin_campana,
           count(*) FILTER (WHERE campana_id IS NOT NULL) con_campana,
           count(*) total
      FROM comercios WHERE estado = 'pendiente_validacion'`)
  const r = rows[0]
  console.log(`  ${r.sin_campana} de ${r.total} pendientes no tienen campana_id → puedeTocar devuelve true`)
  console.log(`  ${r.con_campana} sí la tienen → ahí el permiso efectivamente filtra`)
}

// ── 5. Los canjes al alcance de procesarCanje ───────────────────────────────
console.log('\n▸ Canjes pendientes (procesarCanje entrega el premio)')
{
  const { rows } = await pg.query(`
    SELECT count(*) n, coalesce(sum(puntos), 0) puntos FROM canjes WHERE estado = 'pendiente'`)
  console.log(`  ${rows[0].n} canjes · ${rows[0].puntos} puntos`)
}

await pg.end()
console.log('\n(solo lectura — no se escribió nada)\n')
