import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckSquare, Star, Clock, ChevronRight } from 'lucide-react'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'
import { AbandonarBtn } from './abandonar-btn'

type FotoStats = { pendiente: number; aprobada: number; rechazada: number }

type ParticipacionRow = {
  id: string
  comercios_completados: number
  puntos_acumulados: number
  joined_at: string
  campana: {
    id: string
    nombre: string
    tipo: TipoCampana
    puntos_por_foto: number
    fecha_fin: string | null
    objetivo_comercios: number | null
  }
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

function MisionCard({ p, fotoStats }: { p: ParticipacionRow; fotoStats?: FotoStats }) {
  const c = p.campana
  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const progreso = calcularPorcentaje(p.comercios_completados, c.objetivo_comercios ?? 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 pb-3">
        {/* Badge tipo */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[c.tipo]}`}>
            {labelTipoCampana(c.tipo)}
          </span>
          {dias !== null && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock size={12} />
              <span className={dias <= 3 ? 'text-red-500 font-medium' : ''}>
                {dias === 0 ? 'Último día' : `${dias} días`}
              </span>
            </div>
          )}
        </div>

        {/* Nombre */}
        <h2 className="font-semibold text-gray-900 text-base leading-snug mb-3">
          {c.nombre}
        </h2>

        {/* Stats inline */}
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <Star size={14} className="text-gondo-verde-400 fill-gondo-verde-400" />
            <span className="text-sm font-semibold text-gondo-verde-400">
              {formatearPuntos(p.puntos_acumulados)} pts
            </span>
          </div>
          {fotoStats && (fotoStats.aprobada > 0 || fotoStats.pendiente > 0 || fotoStats.rechazada > 0) && (
            <div className="flex items-center gap-2 text-[11px] font-medium">
              {fotoStats.aprobada > 0 && (
                <span className="text-green-600">✅ {fotoStats.aprobada}</span>
              )}
              {fotoStats.pendiente > 0 && (
                <span className="text-amber-500">⏳ {fotoStats.pendiente}</span>
              )}
              {fotoStats.rechazada > 0 && (
                <span className="text-red-500">❌ {fotoStats.rechazada}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barra de progreso */}
      {c.objetivo_comercios !== null && c.objetivo_comercios > 0 && (
        <div className="px-4 pb-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-400">Progreso</span>
            <span className="text-xs font-medium text-gray-600">
              {p.comercios_completados} / {c.objetivo_comercios} comercios
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gondo-verde-400 rounded-full transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="px-4 pb-2">
        <Link
          href={`/gondolero/captura?campana=${c.id}`}
          className="flex items-center justify-center gap-2 w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors min-h-touch"
        >
          Ir a capturar
          <ChevronRight size={16} />
        </Link>
      </div>

      {/* Abandonar — discreto */}
      <div className="px-4 pb-3">
        <AbandonarBtn campanaId={c.id} />
      </div>
    </div>
  )
}

export default async function MisionesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: participaciones, error } = await supabase
    .from('participaciones')
    .select(`
      id, comercios_completados, puntos_acumulados, joined_at,
      campana:campanas (
        id, nombre, tipo, puntos_por_foto, fecha_fin, objetivo_comercios
      )
    `)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')
    .order('joined_at', { ascending: false })

  if (error) {
    console.error('Error fetching participaciones:', error.message)
  }

  const lista = (participaciones as ParticipacionRow[] | null) ?? []

  // Foto stats por campaña
  const fotoStatsMap = new Map<string, FotoStats>()
  if (lista.length > 0) {
    const campanaIds = lista.map(p => p.campana.id)
    const { data: fotosData } = await supabase
      .from('fotos')
      .select('campana_id, estado')
      .eq('gondolero_id', user.id)
      .in('campana_id', campanaIds)
    for (const f of fotosData ?? []) {
      const fo = f as { campana_id: string; estado: string }
      const s = fotoStatsMap.get(fo.campana_id) ?? { pendiente: 0, aprobada: 0, rechazada: 0 }
      if (fo.estado === 'pendiente' || fo.estado === 'en_revision') s.pendiente++
      else if (fo.estado === 'aprobada') s.aprobada++
      else if (fo.estado === 'rechazada') s.rechazada++
      fotoStatsMap.set(fo.campana_id, s)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <CheckSquare size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Mis misiones</h1>
        </div>
        {lista.length > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">
            {lista.length} {lista.length === 1 ? 'campaña activa' : 'campañas activas'}
          </p>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-base font-semibold text-gray-700 mb-1">
              No tenés misiones activas
            </h2>
            <p className="text-sm text-gray-400 max-w-xs mb-6">
              Unite a una campaña para empezar a ganar puntos.
            </p>
            <Link
              href="/gondolero/campanas"
              className="px-6 py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors"
            >
              Ver campañas disponibles
            </Link>
          </div>
        ) : (
          lista.map(p => <MisionCard key={p.id} p={p} fotoStats={fotoStatsMap.get(p.campana.id)} />)
        )}
      </div>
    </div>
  )
}
