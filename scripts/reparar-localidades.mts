/**
 * reparar-localidades.mts — les pone localidad a los comercios que quedaron sin
 * ella, con alguien mirando la lista antes de escribir.
 *
 *   npx tsx scripts/reparar-localidades.mts                        (propone, dev)
 *   npx tsx scripts/reparar-localidades.mts --prod                 (propone, prod)
 *   npx tsx scripts/reparar-localidades.mts --aplicar --confirmo=8
 *
 * ── LOS QUE REPARA, Y CÓMO SE LOS ENCUENTRA ─────────────────────────────────
 * Los que entraron por el agujero: la app escribía `zona_id` y nunca
 * `localidad_id`. La correlación es **perfecta y sin una sola excepción en las
 * dos bases** —todo comercio tiene una cosa o la otra, nunca ambas— así que
 * `localidad_id IS NULL` los identifica sin heurística.
 *
 * ── POR QUÉ ESCRIBE `localidad_id` Y NO SOLO LA SUGERENCIA ──────────────────
 * Estos comercios en su mayoría **ya están validados**: de los 19, solo 2 en dev
 * y 3 en prod están en `pendiente_validacion`. O sea que **no pasan por la
 * bandeja** y nadie los va a confirmar ahí nunca. Acá la revisión humana es la
 * de este script, y por eso escribe el dato.
 *
 * ── LA CONFIRMACIÓN NO ES UN FLAG QUE SE TIPEA SIN MIRAR ────────────────────
 * `--aplicar` exige además `--confirmo=N` con el número exacto de comercios que
 * se van a escribir, que **solo se sabe corriendo la propuesta y leyéndola**. Un
 * `--si` se tipea de memoria; un número hay que ir a buscarlo.
 *
 * Es la misma familia que el `RAISE EXCEPTION` de las migraciones: un OK que se
 * puede dar sin haber mirado no es una confirmación.
 *
 * ── LO QUE NO TOCA ──────────────────────────────────────────────────────────
 * Solo escribe los `exacto`. Los `ambiguo`, `fuera` y `sin_dato` quedan con su
 * sugerencia registrada y sin localidad: son justamente los que necesitan a
 * alguien que conozca la zona, y este script no es esa persona.
 *
 * Y **nunca pisa una localidad existente**: filtra por `localidad_id IS NULL`.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { calcularSugerencia } from '../lib/localidad-sugerida'
import { explicarResolucion } from '../lib/geocoding'

const esProd   = process.argv.includes('--prod')
const aplicar  = process.argv.includes('--aplicar')
const confirmo = Number((process.argv.find(a => a.startsWith('--confirmo=')) ?? '').split('=')[1])
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'

if (esProd && aplicar && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para escribir en producción hace falta GONDOLAPP_PROD=1.\n')
  process.exit(1)
}

const { vars } = credencialesDeRef(ref)
for (const k of ['PGURL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEOAPIFY_SERVER_KEY']) {
  if (!vars[k]) { console.error(`\n✗ Falta ${k} en el .env de ${nombreDeRef(ref)}\n`); process.exit(1) }
}
process.env.GEOAPIFY_SERVER_KEY = vars.GEOAPIFY_SERVER_KEY

const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const pg = new Client({ connectionString: vars.PGURL })
await pg.connect()

console.log(`\n▸ ${nombreDeRef(ref)} · ${aplicar ? 'APLICANDO' : 'solo propone (nada se escribe)'}`)

const { rows: comercios } = await pg.query(`
  SELECT id, nombre, lat, lng, estado, created_at
    FROM comercios
   WHERE localidad_id IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
   ORDER BY created_at`)

if (comercios.length === 0) {
  console.log('\n✓ No hay comercios sin localidad. Nada que reparar.\n')
  await pg.end(); process.exit(0)
}
console.log(`  ${comercios.length} comercios sin localidad\n`)

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
type Prop = { id: string; nombre: string; localidadId: number | null; etiqueta: string; estado: string; texto: string | null }
const props: Prop[] = []

for (const co of comercios) {
  await dormir(220)                                   // ~4/s, bajo el límite de 5
  const r = await calcularSugerencia(Number(co.lat), Number(co.lng), admin as never)
  if (!r) {
    props.push({ id: co.id, nombre: co.nombre, localidadId: null, etiqueta: 'no se pudo consultar', estado: 'error', texto: null })
  } else {
    props.push({
      id: co.id, nombre: co.nombre,
      localidadId: r.estado === 'exacto' ? r.localidadId : null,
      etiqueta: explicarResolucion(r),
      estado: r.estado,
      texto: r.estado === 'exacto' ? r.fila.nombre
           : r.estado === 'ambiguo' ? r.candidato
           : r.estado === 'fuera' ? r.candidatos[0] : null,
    })
  }
  const p = props[props.length - 1]
  const marca = p.localidadId ? '✓' : '·'
  console.log(`  ${marca} ${String(co.nombre).slice(0, 26).padEnd(26)} ${p.estado.padEnd(9)} ${p.etiqueta}`)
}

const escribibles = props.filter(p => p.localidadId !== null)
const resto = props.filter(p => p.localidadId === null)

console.log(`\n  ── resumen ──`)
console.log(`  SE ESCRIBIRÍAN: ${escribibles.length}`)
console.log(`  quedan para una persona: ${resto.length}` +
  (resto.length ? `  (${[...new Set(resto.map(r => r.estado))].join(', ')})` : ''))

if (!aplicar) {
  console.log(`\n  Para aplicar, mirá la lista de arriba y después:`)
  console.log(`    npx tsx scripts/reparar-localidades.mts${esProd ? ' --prod' : ''} --aplicar --confirmo=${escribibles.length}`)
  console.log(`\n  El número sale de haber leído esto. Un "--si" se tipea de memoria.\n`)
  await pg.end(); process.exit(0)
}

// ── Aplicar ────────────────────────────────────────────────────────────────
if (confirmo !== escribibles.length) {
  console.error(`\n✗ --confirmo=${Number.isNaN(confirmo) ? '(falta)' : confirmo} y se escribirían ${escribibles.length}.`)
  console.error('  No se escribe nada. Corré sin --aplicar, mirá la lista y volvé con el número correcto.\n')
  await pg.end(); process.exit(1)
}

let escritos = 0, fallidos = 0
for (const p of props) {
  // Se guarda la SUGERENCIA para todos —incluidos los que no se escriben— así
  // queda la procedencia y se puede reprocesar solo lo que falta.
  const { error: e1 } = await admin.from('comercios').update({
    localidad_sugerida_estado: p.estado,
    localidad_sugerida_id: p.localidadId,
    localidad_sugerida_texto: p.texto,
  }).eq('id', p.id)
  if (e1) { console.error(`  ✗ sugerencia de ${p.nombre}: ${e1.message}`); fallidos++; continue }

  if (p.localidadId === null) continue

  // `.is('localidad_id', null)` no es decorativo: si alguien le puso localidad
  // entre la propuesta y esto, no se la pisa.
  const { error: e2, count } = await admin.from('comercios')
    .update({ localidad_id: p.localidadId }, { count: 'exact' })
    .eq('id', p.id).is('localidad_id', null)
  if (e2) { console.error(`  ✗ ${p.nombre}: ${e2.message}`); fallidos++ }
  else if (count === 0) console.log(`  · ${p.nombre}: ya tenía localidad, no se tocó`)
  else escritos++
}

const { rows: quedan } = await pg.query(
  'SELECT count(*) n FROM comercios WHERE localidad_id IS NULL AND lat IS NOT NULL')
console.log(`\n  escritos ${escritos} · fallidos ${fallidos} · siguen sin localidad ${quedan[0].n}`)
console.log(fallidos ? '\n✗ Hubo fallos.\n' : '\n✓ Listo.\n')
await pg.end()
process.exit(fallidos ? 1 : 0)
