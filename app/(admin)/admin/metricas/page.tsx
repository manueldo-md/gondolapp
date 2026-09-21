import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Ruler } from 'lucide-react'
import type { Metrica } from '@/lib/metricas'
import { TablaTipificar, type PreguntaFila } from './tabla-tipificar'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Tipificar las preguntas que ya existen.
 *
 * El constructor de campañas cubre lo que se cree de ahora en adelante. Esta
 * pantalla es para lo que ya está: al 21/9/2026 hay cuatro preguntas no-foto en
 * producción, todas con respuestas cargadas, y sin tipificarlas el panel de la
 * marca arranca sin una sola serie.
 *
 * Por qué se puede tipificar algo que ya tiene respuestas: pasar de "sin
 * métrica" a una métrica **no reinterpreta nada**. Las respuestas siempre
 * quisieron decir lo mismo. Lo que sí reinterpreta —cambiar de métrica, o
 * sacarla— queda bloqueado. Ver `cambioDeMetricaPermitido`.
 */
export default async function MetricasPage() {
  const admin = adminClient()

  // Cuatro consultas planas en vez de un embed anidado: `bloque_campos` →
  // `bloques_foto` → `campanas` son tres niveles, y los embeds de PostgREST a
  // esa profundidad devuelven objeto o array según el caso. Con 36 campos y 20
  // campañas, resolverlo en JS no cuesta nada.
  const [camposRes, bloquesRes, campanasRes, metricasRes, respuestasRes] = await Promise.all([
    admin.from('bloque_campos').select('id, bloque_id, tipo, pregunta, orden, metrica_id'),
    admin.from('bloques_foto').select('id, campana_id, instruccion, orden'),
    admin.from('campanas').select('id, nombre, tipo, estado, marca_id, distri_id, created_at'),
    admin.from('metricas').select('id, slug, nombre, descripcion, tipo_respuesta, fuentes, orden, activa').order('orden'),
    admin.from('mision_respuestas').select('campo_id'),
  ])

  const metricas = (metricasRes.data ?? []) as unknown as Metrica[]

  const bloques = new Map((bloquesRes.data ?? []).map(b => [b.id, b]))
  const campanas = new Map((campanasRes.data ?? []).map(c => [c.id, c]))

  const respuestasPorCampo = new Map<string, number>()
  for (const r of respuestasRes.data ?? []) {
    if (!r.campo_id) continue
    respuestasPorCampo.set(r.campo_id, (respuestasPorCampo.get(r.campo_id) ?? 0) + 1)
  }

  // Los campos `foto` quedan afuera: una foto no es una medición comparable, y
  // el CHECK de `metricas.tipo_respuesta` tampoco la acepta. Mostrarlos sería
  // ofrecer una acción imposible.
  const filas: PreguntaFila[] = (camposRes.data ?? [])
    .filter(c => c.tipo !== 'foto')
    .map(c => {
      const bloque = bloques.get(c.bloque_id)
      const campana = bloque ? campanas.get(bloque.campana_id) : undefined
      return {
        id:            c.id,
        pregunta:      c.pregunta ?? '',
        tipo:          c.tipo,
        metricaId:     c.metrica_id ?? null,
        respuestas:    respuestasPorCampo.get(c.id) ?? 0,
        campanaId:     campana?.id ?? null,
        campanaNombre: campana?.nombre ?? 'Campaña desconocida',
        campanaEstado: campana?.estado ?? null,
        campanaCreada: campana?.created_at ?? null,
      }
    })
    // Las que más respuestas tienen primero: son las que más le aportan al panel
    // y las que más se gana tipificando.
    .sort((a, b) => b.respuestas - a.respuestas || a.pregunta.localeCompare(b.pregunta))

  const sinTipificar = filas.filter(f => !f.metricaId).length
  const conRespuestas = filas.filter(f => !f.metricaId && f.respuestas > 0).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Ruler size={18} className="text-gray-400" />
            Métricas
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filas.length} pregunta{filas.length !== 1 ? 's' : ''} —{' '}
            {sinTipificar} sin métrica
            {conRespuestas > 0 && `, ${conRespuestas} de ellas con respuestas cargadas`}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 leading-relaxed">
        <strong className="font-semibold">Qué hace tipificar una pregunta.</strong>{' '}
        Dos campañas que preguntan lo mismo con otras palabras hoy son datos
        sueltos. Decir qué mide cada una es lo que deja al panel de la marca
        compararlas entre campañas y en el tiempo.
        <br />
        <span className="text-indigo-700">
          Tipificar una pregunta que ya tiene respuestas está permitido: no
          cambia qué significan, solo hace que el sistema lo sepa. Cambiarle la
          métrica o sacársela, en cambio, queda bloqueado mientras haya
          respuestas.
        </span>
      </div>

      <TablaTipificar filas={filas} metricas={metricas} />
    </div>
  )
}
