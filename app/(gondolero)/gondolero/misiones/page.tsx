import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckSquare } from 'lucide-react'
import type { TipoCampana } from '@/types'
import { MisionesSections, type ParticipacionCardData, type FotoStats } from './misiones-sections'

export default async function MisionesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: participaciones, error } = await supabase
    .from('participaciones')
    .select(`
      id, comercios_completados, puntos_acumulados, joined_at, estado,
      campana:campanas (
        id, nombre, tipo, puntos_por_foto, fecha_fin, objetivo_comercios
      )
    `)
    .eq('gondolero_id', user.id)
    .in('estado', ['activa', 'completada', 'abandonada'])
    .order('joined_at', { ascending: false })

  if (error) {
    console.error('Error fetching participaciones:', error.message)
  }

  const lista = (participaciones as ParticipacionCardData[] | null) ?? []

  // Foto stats por campaña (solo para activas — las otras no necesitan badge)
  const fotoStatsMap: Record<string, FotoStats> = {}
  if (lista.length > 0) {
    const campanaIds = lista.map(p => p.campana.id)
    const { data: fotosData } = await supabase
      .from('fotos')
      .select('campana_id, estado')
      .eq('gondolero_id', user.id)
      .in('campana_id', campanaIds)
    for (const f of fotosData ?? []) {
      const fo = f as { campana_id: string; estado: string }
      const s = fotoStatsMap[fo.campana_id] ?? { pendiente: 0, aprobada: 0, rechazada: 0 }
      if (fo.estado === 'pendiente' || fo.estado === 'en_revision') s.pendiente++
      else if (fo.estado === 'aprobada') s.aprobada++
      else if (fo.estado === 'rechazada') s.rechazada++
      fotoStatsMap[fo.campana_id] = s
    }
  }

  const activas    = lista.filter(p => p.estado === 'activa')
  const completadas = lista.filter(p => p.estado === 'completada')
  const abandonadas = lista.filter(p => p.estado === 'abandonada')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <CheckSquare size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Mis misiones</h1>
        </div>
        {activas.length > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">
            {activas.length} {activas.length === 1 ? 'misión activa' : 'misiones activas'}
          </p>
        )}
      </div>

      <div className="px-4 py-4">
        <MisionesSections
          activas={activas}
          completadas={completadas}
          abandonadas={abandonadas}
          fotoStatsMap={fotoStatsMap}
        />
      </div>
    </div>
  )
}
