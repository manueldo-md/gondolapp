import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Star, Clock, Camera, MapPin, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import { UnirseButton } from './unirse-button'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
  formatearFecha,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'

type BloqueFotoRow = {
  id: string
  orden: number
  instruccion: string
  tipo_contenido: string
}

type CampanaDetalle = {
  id: string
  nombre: string
  tipo: TipoCampana
  financiada_por: string
  distri_id: string | null
  marca_id: string | null
  puntos_por_foto: number
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_limite_inscripcion: string | null
  objetivo_comercios: number | null
  tope_total_comercios: number | null
  max_comercios_por_gondolero: number
  min_comercios_para_cobrar: number
  comercios_relevados: number
  instruccion: string | null
  nivel_minimo: string | null
  marca: { razon_social: string } | null
  bloques_foto: BloqueFotoRow[]
}

type MisionRow = {
  id: string
  estado: string
  puntos_total: number
  created_at: string
  comercio: { nombre: string; direccion: string | null } | null
}

const COLORES_TIPO: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-600',
  pop:          'bg-purple-50 text-purple-600',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-600',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-600',
  interna:      'bg-gray-100 text-gray-500',
}

const NIVEL_ORDEN: Record<string, number> = { casual: 0, activo: 1, pro: 2 }
const NIVEL_LABEL: Record<string, string>  = { casual: 'Casual', activo: 'Activo', pro: 'Pro' }

const ESTADO_MISION: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'En revisión', color: 'bg-amber-50 text-amber-600' },
  aprobada:  { label: 'Aprobada',    color: 'bg-green-50 text-green-600' },
  rechazada: { label: 'Rechazada',   color: 'bg-red-50 text-red-500'    },
  parcial:   { label: 'Parcial',     color: 'bg-blue-50 text-blue-600'  },
}

function ReqRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {ok
        ? <CheckCircle2 size={15} className="text-green-500 shrink-0" />
        : <XCircle     size={15} className="text-red-500 shrink-0" />
      }
      <span className={`text-sm ${ok ? 'text-gray-600' : 'text-red-700 font-medium'}`}>{text}</span>
    </div>
  )
}

export default async function CampanaDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: campanaData } = await supabase
    .from('campanas')
    .select(`
      id, nombre, tipo, financiada_por, distri_id, marca_id,
      puntos_por_foto, fecha_inicio, fecha_fin, fecha_limite_inscripcion,
      objetivo_comercios, tope_total_comercios, max_comercios_por_gondolero, min_comercios_para_cobrar,
      comercios_relevados, instruccion, nivel_minimo,
      marca:marcas ( razon_social ),
      bloques_foto ( id, orden, instruccion, tipo_contenido )
    `)
    .eq('id', params.id)
    .eq('estado', 'activa')
    .single()

  if (!campanaData) notFound()

  const [{ data: participacionData }, { data: profileData }, { data: misDistrisData }, { data: misionesData }] = await Promise.all([
    supabase
      .from('participaciones')
      .select('id, estado')
      .eq('campana_id', params.id)
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('nivel')
      .eq('id', user.id)
      .single(),
    supabase
      .from('gondolero_distri_solicitudes')
      .select('distri_id')
      .eq('gondolero_id', user.id)
      .eq('estado', 'aprobada'),
    supabase
      .from('misiones')
      .select('id, estado, puntos_total, created_at, comercio:comercios ( nombre, direccion )')
      .eq('campana_id', params.id)
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const c = campanaData as unknown as CampanaDetalle
  const participacion = participacionData as { id: string; estado: string } | null
  const gondoleroNivel = (profileData as { nivel: string } | null)?.nivel ?? 'casual'
  const misDistriIds = (misDistrisData ?? []).map((d: { distri_id: string }) => d.distri_id)
  const misiones = (misionesData as MisionRow[] | null) ?? []

  const yaUnido        = participacion?.estado === 'activa' || misiones.length > 0
  const participacionAnteriorEstado = (
    participacion?.estado === 'completada' || participacion?.estado === 'abandonada'
  ) ? participacion.estado as 'completada' | 'abandonada' : null

  const dias         = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const progreso     = calcularPorcentaje(c.comercios_relevados, c.objetivo_comercios ?? 0)
  const bloques      = [...(c.bloques_foto ?? [])].sort((a, b) => a.orden - b.orden)

  // Badge de creador
  const esMiDistri = !!c.distri_id && misDistriIds.includes(c.distri_id)
  const esGondolApp = c.financiada_por === 'gondolapp' || (!c.distri_id && !c.marca_id)

  // ── Control de acceso según financiador ───────────────────────────────────────
  let sinAcceso = false
  let motivoSinAcceso: string | undefined

  if (c.financiada_por === 'distri' && c.distri_id && !misDistriIds.includes(c.distri_id)) {
    sinAcceso = true
    motivoSinAcceso = 'Esta campaña es exclusiva para gondoleros vinculados a esa distribuidora.'
  } else if (c.financiada_por === 'marca' && c.marca_id) {
    if (misDistriIds.length === 0) {
      sinAcceso = true
      motivoSinAcceso = 'Esta campaña es exclusiva para gondoleros de distribuidoras vinculadas a esta marca.'
    }
  }

  // Restricciones operativas de acceso
  const nivelMinimo       = c.nivel_minimo ?? 'casual'
  const nivelOk           = (NIVEL_ORDEN[gondoleroNivel] ?? 0) >= (NIVEL_ORDEN[nivelMinimo] ?? 0)
  const inscripcionCerrada = !!(c.fecha_limite_inscripcion && new Date(c.fecha_limite_inscripcion) < new Date())
  const cupoLleno         = !!(c.tope_total_comercios != null && c.comercios_relevados >= c.tope_total_comercios)
  const cupoProgreso      = c.tope_total_comercios
    ? calcularPorcentaje(c.comercios_relevados, c.tope_total_comercios)
    : null

  const puedeUnirse = nivelOk && !inscripcionCerrada && !cupoLleno && !sinAcceso

  const mostrarPanelAcceso = !yaUnido
  const hayRestricciones = !nivelOk || inscripcionCerrada || cupoLleno || sinAcceso || !!participacionAnteriorEstado

  const alcanzeLimite = misiones.length >= c.max_comercios_por_gondolero

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* Header con back */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <Link
          href="/gondolero/campanas"
          className="inline-flex items-center gap-1.5 text-gray-500 text-sm mb-3 -ml-1 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Campañas
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[c.tipo]}`}>
            {labelTipoCampana(c.tipo)}
          </span>
          {sinAcceso && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
              🔒 Acceso restringido
            </span>
          )}
          {!sinAcceso && esMiDistri && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
              📦 Tu distribuidora
            </span>
          )}
          {!sinAcceso && !esMiDistri && esGondolApp && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              GondolApp
            </span>
          )}
          {nivelMinimo !== 'casual' && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
              Nivel {NIVEL_LABEL[nivelMinimo]} requerido
            </span>
          )}
        </div>
        <h1 className="text-lg font-bold text-gray-900 mt-2 leading-snug">
          {c.nombre}
        </h1>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ── Ya participando ── */}
        {yaUnido && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <p className="text-sm font-semibold text-green-800">Ya estás participando en esta campaña</p>
          </div>
        )}

        {/* ── Participación anterior (completada / abandonada) ── */}
        {!yaUnido && participacionAnteriorEstado && (
          <div className={`rounded-2xl border p-4 ${
            participacionAnteriorEstado === 'completada'
              ? 'bg-green-50 border-green-200'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <p className={`text-sm font-semibold mb-0.5 ${
              participacionAnteriorEstado === 'completada' ? 'text-green-800' : 'text-gray-700'
            }`}>
              {participacionAnteriorEstado === 'completada'
                ? '✅ Ya completaste esta campaña'
                : '⏸ Abandonaste esta campaña'}
            </p>
            <p className="text-xs text-gray-500">
              {puedeUnirse ? 'Podés volver a unirte.' : 'No hay cupos o la inscripción está cerrada.'}
            </p>
          </div>
        )}

        {/* Stats principales */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Star size={18} className="text-gondo-verde-400 fill-gondo-verde-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gondo-verde-400">{formatearPuntos(c.puntos_por_foto)}</p>
            <p className="text-[11px] text-gray-400">pts/foto</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Clock size={18} className="text-gray-400 mx-auto mb-1" />
            <p className={`text-base font-bold ${dias !== null && dias <= 3 ? 'text-red-500' : 'text-gray-700'}`}>
              {dias === null ? '—' : dias === 0 ? 'Hoy' : dias}
            </p>
            <p className="text-[11px] text-gray-400">días</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Camera size={18} className="text-gray-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gray-700">{bloques.length}</p>
            <p className="text-[11px] text-gray-400">{bloques.length === 1 ? 'foto' : 'fotos'}</p>
          </div>
        </div>

        {/* Instrucción general */}
        {c.instruccion && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">¿Qué tenés que hacer?</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{c.instruccion}</p>
          </div>
        )}

        {/* Bloques de foto */}
        {bloques.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Fotos requeridas</h2>
            <div className="space-y-3">
              {bloques.map((bloque, i) => (
                <div key={bloque.id} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-gondo-verde-50 text-gondo-verde-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{bloque.instruccion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Sección de misiones (solo para participantes activos) ── */}
        {yaUnido && (
          <>
            {/* Dos contadores: campaña general + mis misiones */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gondo-verde-400">{c.comercios_relevados}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">comercios<br/>en la campaña</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gray-700">{misiones.length}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                  {misiones.length === 1 ? 'misión tuya' : 'misiones tuyas'}<br/>
                  <span className="text-gray-300">(máx {c.max_comercios_por_gondolero})</span>
                </p>
              </div>
            </div>

            {/* Botón Nueva misión o límite alcanzado */}
            {!alcanzeLimite && !cupoLleno ? (
              <Link
                href={`/gondolero/captura?campana=${c.id}`}
                className="flex items-center justify-center gap-2 w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl shadow-sm text-base hover:bg-gondo-verde-600 transition-colors"
              >
                <Camera size={18} />
                Nueva misión
              </Link>
            ) : (
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 text-center">
                <p className="text-sm font-semibold text-gray-600">
                  {cupoLleno ? 'Campaña sin cupos disponibles' : 'Alcanzaste el límite de misiones'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {cupoLleno
                    ? 'El cupo total de la campaña está completo.'
                    : `Completaste el máximo de ${c.max_comercios_por_gondolero} comercios para esta campaña.`}
                </p>
              </div>
            )}

            {/* Lista de misiones */}
            {misiones.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Tus misiones</h2>
                <div className="space-y-3">
                  {misiones.map(mision => (
                    <div key={mision.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {mision.comercio?.nombre ?? 'Comercio'}
                        </p>
                        {mision.comercio?.direccion && (
                          <p className="text-xs text-gray-400 truncate">{mision.comercio.direccion}</p>
                        )}
                        <p className="text-xs text-gray-400">{formatearFecha(mision.created_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_MISION[mision.estado]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                          {ESTADO_MISION[mision.estado]?.label ?? mision.estado}
                        </span>
                        {mision.puntos_total > 0 && (
                          <span className="text-xs font-semibold text-gondo-verde-400">
                            +{formatearPuntos(mision.puntos_total)} pts
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Panel de acceso / condiciones (solo para no participantes) */}
        {mostrarPanelAcceso && (hayRestricciones || !yaUnido) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Condiciones de acceso</h2>
            <div className="space-y-2.5">
              {c.fecha_limite_inscripcion ? (
                <ReqRow
                  ok={!inscripcionCerrada}
                  text={inscripcionCerrada
                    ? `Inscripción cerrada (venció el ${formatearFecha(c.fecha_limite_inscripcion)})`
                    : `Inscripción abierta hasta el ${formatearFecha(c.fecha_limite_inscripcion)}`}
                />
              ) : (
                <ReqRow ok text="Inscripción abierta" />
              )}

              {c.tope_total_comercios != null && (
                <ReqRow
                  ok={!cupoLleno}
                  text={cupoLleno
                    ? `Sin cupos — ${c.comercios_relevados}/${c.tope_total_comercios} completos`
                    : `Cupos disponibles — ${c.tope_total_comercios - c.comercios_relevados} restantes`}
                />
              )}

              {nivelMinimo !== 'casual' && (
                <ReqRow
                  ok={nivelOk}
                  text={nivelOk
                    ? `Tu nivel ${NIVEL_LABEL[gondoleroNivel]} cumple el requisito (${NIVEL_LABEL[nivelMinimo]})`
                    : `Requiere nivel ${NIVEL_LABEL[nivelMinimo]} — tu nivel es ${NIVEL_LABEL[gondoleroNivel]}`}
                />
              )}

              <div className="flex items-center gap-2.5">
                <MapPin size={15} className="text-gondo-verde-400 shrink-0" />
                <span className="text-sm text-gray-600">
                  Mínimo <span className="font-medium">{c.min_comercios_para_cobrar} comercios</span> para cobrar puntos
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Camera size={15} className="text-gondo-verde-400 shrink-0" />
                <span className="text-sm text-gray-600">
                  Máximo <span className="font-medium">{c.max_comercios_por_gondolero} comercios</span> por gondolero
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Cupo total (barra visual) — solo para no participantes */}
        {!yaUnido && c.tope_total_comercios != null && (
          <div className={`rounded-2xl border p-4 ${cupoLleno ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Cupo disponible</h2>
              <span className={`text-sm font-medium ${cupoLleno ? 'text-red-600' : 'text-gray-600'}`}>
                {c.comercios_relevados} / {c.tope_total_comercios}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${cupoLleno ? 'bg-red-400' : 'bg-gondo-verde-400'}`}
                style={{ width: `${cupoProgreso}%` }}
              />
            </div>
            <p className={`text-xs mt-1.5 ${cupoLleno ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {cupoLleno ? 'Sin cupos disponibles' : `${c.tope_total_comercios - c.comercios_relevados} cupos restantes`}
            </p>
          </div>
        )}

        {/* Progreso general — solo para no participantes */}
        {!yaUnido && c.objetivo_comercios !== null && c.objetivo_comercios > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Progreso general</h2>
              <span className="text-sm font-medium text-gray-600">
                {c.comercios_relevados} / {c.objetivo_comercios}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gondo-verde-400 rounded-full" style={{ width: `${progreso}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">comercios relevados</p>
          </div>
        )}

      </div>

      {/* CTA fijo al fondo — solo para usuarios no unidos */}
      {!yaUnido && (
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 via-gray-50 pt-4">
          <UnirseButton
            campanaId={c.id}
            yaUnido={yaUnido}
            inscripcionCerrada={inscripcionCerrada}
            cupoLleno={cupoLleno}
            nivelOk={nivelOk}
            nivelMinimo={nivelMinimo}
            gondoleroNivel={gondoleroNivel}
            participacionAnteriorEstado={participacionAnteriorEstado}
            sinAcceso={sinAcceso}
            motivoSinAcceso={motivoSinAcceso}
          />
        </div>
      )}

    </div>
  )
}
