import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Star, Clock, Camera, CheckCircle2, MapPin, ChevronRight } from 'lucide-react'
import { AbandonarBtn } from '../abandonar-btn'
import { RetirarFotoBtn } from './retirar-foto-btn'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
  formatearFecha,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'

type FotoRow = {
  id: string
  estado: string
  declaracion: string
  puntos_otorgados: number
  created_at: string
  comercio: { nombre: string } | null
}

const ESTADO_FOTO: Record<string, { label: string; color: string }> = {
  pendiente:   { label: 'En revisión', color: 'bg-amber-50 text-amber-600' },
  aprobada:    { label: 'Aprobada',    color: 'bg-green-50 text-green-600' },
  rechazada:   { label: 'Rechazada',   color: 'bg-red-50 text-red-500' },
  en_revision: { label: 'En revisión', color: 'bg-amber-50 text-amber-600' },
}

const DECLARACION_LABEL: Record<string, string> = {
  producto_presente:      'Producto presente',
  producto_no_encontrado: 'No encontrado',
  solo_competencia:       'Solo competencia',
}

export default async function MisionDetallePage({
  params,
}: {
  params: { campanaId: string }
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  type ParticipacionData = {
    id: string
    comercios_completados: number
    puntos_acumulados: number
    joined_at: string
    estado: string
  }

  type CampanaData = {
    id: string
    nombre: string
    tipo: string
    puntos_por_foto: number
    fecha_fin: string | null
    objetivo_comercios: number | null
    min_comercios_para_cobrar: number
    instruccion: string | null
  }

  const [participacionRes, campanaRes, fotosRes] = await Promise.all([
    supabase
      .from('participaciones')
      .select('id, comercios_completados, puntos_acumulados, joined_at, estado')
      .eq('campana_id', params.campanaId)
      .eq('gondolero_id', user.id)
      .maybeSingle(),

    supabase
      .from('campanas')
      .select('id, nombre, tipo, puntos_por_foto, fecha_fin, objetivo_comercios, min_comercios_para_cobrar, instruccion')
      .eq('id', params.campanaId)
      .single(),

    supabase
      .from('fotos')
      .select('id, estado, declaracion, puntos_otorgados, created_at, comercio:comercios ( nombre )')
      .eq('campana_id', params.campanaId)
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const participacion = participacionRes.data as ParticipacionData | null
  const campana = campanaRes.data as CampanaData | null

  if (!participacion || participacion.estado !== 'activa' || !campana) {
    redirect('/gondolero/misiones')
  }

  const fotos = (fotosRes.data as FotoRow[] | null) ?? []
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin as string) : null
  const progreso = calcularPorcentaje(
    participacion.comercios_completados,
    (campana.objetivo_comercios as number | null) ?? 0
  )
  const puntosConfirmados = fotos
    .filter(f => f.estado === 'aprobada')
    .reduce((sum, f) => sum + (f.puntos_otorgados ?? 0), 0)
  const faltanParaCobrar = Math.max(
    0,
    (campana.min_comercios_para_cobrar as number) - participacion.comercios_completados
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <Link
          href="/gondolero/misiones"
          className="inline-flex items-center gap-1.5 text-gray-500 text-sm mb-3 -ml-1"
        >
          <ArrowLeft size={16} />
          Mis misiones
        </Link>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            {labelTipoCampana(campana.tipo as TipoCampana)}
          </span>
          {dias !== null && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              dias <= 3 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
            }`}>
              {dias === 0 ? 'Último día' : `${dias} días`}
            </span>
          )}
        </div>
        <h1 className="text-lg font-bold text-gray-900 leading-snug">
          {campana.nombre as string}
        </h1>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Star size={18} className="text-gondo-verde-400 fill-gondo-verde-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gondo-verde-400">
              {formatearPuntos(puntosConfirmados)}
            </p>
            <p className="text-[11px] text-gray-400">pts ganados</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Camera size={18} className="text-gray-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gray-700">
              {participacion.comercios_completados}
            </p>
            <p className="text-[11px] text-gray-400">comercios</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <CheckCircle2 size={18} className="text-gray-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gray-700">{fotos.length}</p>
            <p className="text-[11px] text-gray-400">fotos</p>
          </div>
        </div>

        {/* Progreso */}
        {(campana.objetivo_comercios as number | null) !== null && (campana.objetivo_comercios as number) > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Progreso</h2>
              <span className="text-sm font-medium text-gray-600">
                {participacion.comercios_completados} / {campana.objetivo_comercios as number}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gondo-verde-400 rounded-full transition-all"
                style={{ width: `${progreso}%` }}
              />
            </div>
            {faltanParaCobrar > 0 && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <MapPin size={11} />
                Te faltan {faltanParaCobrar} {faltanParaCobrar === 1 ? 'comercio' : 'comercios'} para cobrar los puntos
              </p>
            )}
          </div>
        )}

        {/* Instrucción */}
        {(campana.instruccion as string | null) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-1.5">¿Qué tenés que hacer?</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{campana.instruccion as string}</p>
          </div>
        )}

        {/* Historial de fotos */}
        {fotos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Fotos enviadas ({fotos.length})
            </h2>
            <div className="space-y-3">
              {fotos.map(foto => {
                const estadoInfo = ESTADO_FOTO[foto.estado] ?? { label: foto.estado, color: 'bg-gray-100 text-gray-500' }
                return (
                  <div key={foto.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Camera size={14} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {foto.comercio?.nombre ?? 'Comercio'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {DECLARACION_LABEL[foto.declaracion] ?? foto.declaracion} · {formatearFecha(foto.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                        {estadoInfo.label}
                      </span>
                      {foto.estado === 'aprobada' && foto.puntos_otorgados > 0 && (
                        <span className="text-xs font-semibold text-gondo-verde-400">
                          +{formatearPuntos(foto.puntos_otorgados)} pts
                        </span>
                      )}
                      {foto.estado === 'pendiente' && (
                        <RetirarFotoBtn fotoId={foto.id} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Abandonar — discreto */}
        <div className="pt-2">
          <AbandonarBtn campanaId={params.campanaId} />
        </div>

      </div>

      {/* CTA fijo */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 via-gray-50 pt-4">
        <Link
          href={`/gondolero/captura?campana=${params.campanaId}`}
          className="flex items-center justify-center gap-2 w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl shadow-lg text-base hover:bg-gondo-verde-600 transition-colors min-h-touch"
        >
          Ir a capturar
          <ChevronRight size={18} />
        </Link>
      </div>

    </div>
  )
}
