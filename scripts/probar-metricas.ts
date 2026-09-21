/**
 * probar-metricas.ts — SOLO LECTURA
 *
 * Dos cosas:
 *   1. Las tres reglas de cambio, como casos, sin base de por medio.
 *   2. Lo que la pantalla de /admin/metricas va a mostrar en ese ambiente:
 *      qué preguntas hay, cuántas respuestas tienen y qué métricas les calzan.
 *
 *   npx tsx scripts/probar-metricas.ts --ref <project-ref>
 */
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { cambioDeMetricaPermitido, metricasCompatibles, type Metrica } from '../lib/metricas'

let fallos = 0

function caso(
  nombre: string,
  params: { actual: string | null; nueva: string | null; respuestas: number },
  esperado: boolean,
) {
  const r = cambioDeMetricaPermitido(params)
  const ok = r.ok === esperado
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!r.ok) console.log(`       → ${r.motivo}`)
}

console.log('\n▸ Las tres reglas de cambio')

// El caso que da sentido a todo el tramo: las cuatro preguntas de producción
// tienen respuestas y hay que poder tipificarlas.
caso('sin métrica → métrica, CON respuestas', { actual: null, nueva: 'presencia', respuestas: 27 }, true)
caso('sin métrica → métrica, sin respuestas', { actual: null, nueva: 'presencia', respuestas: 0 }, true)

caso('métrica A → métrica B, sin respuestas', { actual: 'frentes', nueva: 'precio', respuestas: 0 }, true)
caso('métrica A → métrica B, CON respuestas', { actual: 'frentes', nueva: 'precio', respuestas: 12 }, false)

caso('métrica → sin métrica, sin respuestas', { actual: 'precio', nueva: null, respuestas: 0 }, true)
caso('métrica → sin métrica, CON respuestas', { actual: 'precio', nueva: null, respuestas: 12 }, false)

// Controles: guardar lo mismo no puede rebotar, y "sin métrica" a "sin métrica"
// tampoco — si no, abrir el selector y cerrarlo daría error.
caso('CONTROL — la misma métrica, con respuestas', { actual: 'precio', nueva: 'precio', respuestas: 99 }, true)
caso('CONTROL — sin métrica a sin métrica', { actual: null, nueva: null, respuestas: 99 }, true)

async function main() {
  // ── Lo que va a mostrar la pantalla ─────────────────────────────────────────
  const ref = process.argv[process.argv.indexOf('--ref') + 1]
  const cred = credencialesDeRef(ref)
  if (!cred) {
    console.error('\n✗ sin credenciales para ' + ref)
    process.exit(1)
  }
  const db = createClient(cred.vars.NEXT_PUBLIC_SUPABASE_URL, cred.vars.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\n▸ /admin/metricas en ${nombreDeRef(ref)} (${ref})`)

  const [campos, bloques, campanas, metricasRes, respuestas] = await Promise.all([
    db.from('bloque_campos').select('id, bloque_id, tipo, pregunta, metrica_id'),
    db.from('bloques_foto').select('id, campana_id'),
    db.from('campanas').select('id, nombre'),
    db.from('metricas').select('id, slug, nombre, descripcion, tipo_respuesta, fuentes, orden, activa').order('orden'),
    db.from('mision_respuestas').select('campo_id'),
  ])

  const metricas = (metricasRes.data ?? []) as unknown as Metrica[]
  if (metricas.length === 0) {
    console.log('   ✗ el catálogo está vacío: ¿corriste la migración en este ambiente?')
    fallos++
  }

  const bloqueDe = new Map((bloques.data ?? []).map(b => [b.id, b.campana_id]))
  const campanaDe = new Map((campanas.data ?? []).map(c => [c.id, c.nombre]))

  const cuenta = new Map<string, number>()
  for (const r of respuestas.data ?? []) {
    if (!r.campo_id) continue
    cuenta.set(r.campo_id, (cuenta.get(r.campo_id) ?? 0) + 1)
  }

  const filas = (campos.data ?? [])
    .filter(c => c.tipo !== 'foto')
    .map(c => ({
      pregunta: c.pregunta ?? '',
      tipo: c.tipo,
      metrica: metricas.find(m => m.id === (c as { metrica_id?: string | null }).metrica_id)?.nombre ?? null,
      respuestas: cuenta.get(c.id) ?? 0,
      campana: campanaDe.get(bloqueDe.get(c.bloque_id) ?? '') ?? '—',
      compatibles: metricasCompatibles(metricas, c.tipo).map(m => m.nombre),
    }))
    .sort((a, b) => b.respuestas - a.respuestas || a.pregunta.localeCompare(b.pregunta))

  console.log(`   ${filas.length} preguntas no-foto\n`)
  for (const f of filas) {
    const estado = f.metrica ? `[${f.metrica}]` : f.compatibles.length ? `sin métrica → ${f.compatibles.join(' / ')}` : 'sin métrica → ninguna compatible'
    console.log(`   ${String(f.respuestas).padStart(3)} resp · ${f.tipo.padEnd(18)} · ${estado}`)
    console.log(`              ${f.pregunta || '(sin texto)'}`)
    console.log(`              ${f.campana}`)
  }

  const huerfanas = filas.filter(f => f.compatibles.length === 0 && !f.metrica)
  if (huerfanas.length) {
    console.log(`\n   ${huerfanas.length} pregunta(s) sin ninguna métrica compatible — la pantalla lo va a decir, no ofrece un selector vacío.`)
  }

  console.log(fallos ? `\n✗ ${fallos} caso(s) mal\n` : '\n✓ Todo como se esperaba.\n')
  // `process.exitCode` y no `process.exit()`: en Windows, cortar el proceso con
  // el socket de supabase-js todavía abierto dispara un assert de libuv que
  // ensucia la salida y hace parecer que algo falló.
  process.exitCode = fallos ? 1 : 0

}

main()
