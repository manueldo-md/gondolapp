import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Users, Star, CheckCircle2, XCircle } from 'lucide-react'
import type { NivelGondolero } from '@/types'
import { SolicitudesTab } from './solicitudes-tab'
import { InvitarPanel } from './invitar-panel'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface GondoleroRow {
  id: string
  nombre: string | null
  alias: string | null
  nivel: NivelGondolero
  activo: boolean
  created_at: string
}

interface GondoleroConStats extends GondoleroRow {
  totalFotos: number
  fotosAprobadas: number
  tasaAprobacion: number
  vinculadoActual: boolean // true = distri_id = esta distri, false = histórico desvinculado
}

const NIVEL_LABEL: Record<NivelGondolero, string> = {
  casual: 'Casual',
  activo: 'Activo',
  pro:    'Pro',
}

const NIVEL_COLOR: Record<NivelGondolero, string> = {
  casual: 'bg-gray-100 text-gray-600',
  activo: 'bg-blue-100 text-blue-700',
  pro:    'bg-gondo-amber-50 text-gondo-amber-400',
}

export default async function GondolerosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: perfil } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = perfil?.distri_id ?? null

  // Obtener nombre de la distribuidora
  let distriNombre = 'Mi distribuidora'
  if (distriId) {
    const { data: distriData } = await admin
      .from('distribuidoras')
      .select('razon_social')
      .eq('id', distriId)
      .single()
    if (distriData?.razon_social) distriNombre = distriData.razon_social
  }

  // Gondoleros actualmente vinculados
  const gondolerosActualesData = distriId
    ? await admin
        .from('profiles')
        .select('id, nombre, alias, nivel, activo, created_at')
        .eq('tipo_actor', 'gondolero')
        .eq('distri_id', distriId)
        .order('created_at', { ascending: false })
    : { data: null }
  const gondolerosActuales = (gondolerosActualesData.data as GondoleroRow[] | null) ?? []
  const actualesIds = new Set(gondolerosActuales.map(g => g.id))

  // Gondoleros históricos: alguna vez aprobados, ahora desvinculados
  let gondolerosHistoricos: GondoleroRow[] = []
  if (distriId) {
    const { data: histSol } = await admin
      .from('gondolero_distri_solicitudes')
      .select('gondolero_id')
      .eq('distri_id', distriId)
      .eq('estado', 'aprobada')

    const historicosIds = (histSol ?? [])
      .map((s: { gondolero_id: string }) => s.gondolero_id)
      .filter(id => !actualesIds.has(id))

    if (historicosIds.length > 0) {
      const { data: histProfiles } = await admin
        .from('profiles')
        .select('id, nombre, alias, nivel, activo, created_at')
        .in('id', historicosIds)
        .order('created_at', { ascending: false })
      gondolerosHistoricos = (histProfiles as GondoleroRow[] | null) ?? []
    }
  }

  // Lista combinada: actuales primero, luego históricos desvinculados
  const gondoleros: GondoleroRow[] = [...gondolerosActuales, ...gondolerosHistoricos]

  // Stats de fotos
  const ids = gondoleros.map(g => g.id)
  let statsMap: Record<string, { total: number; aprobadas: number }> = {}
  if (ids.length > 0) {
    const { data: fotosData } = await admin
      .from('fotos')
      .select('gondolero_id, estado')
      .in('gondolero_id', ids)
    statsMap = (fotosData ?? []).reduce<Record<string, { total: number; aprobadas: number }>>(
      (acc, f) => {
        if (!acc[f.gondolero_id]) acc[f.gondolero_id] = { total: 0, aprobadas: 0 }
        acc[f.gondolero_id].total++
        if (f.estado === 'aprobada') acc[f.gondolero_id].aprobadas++
        return acc
      }, {}
    )
  }

  const lista: GondoleroConStats[] = gondoleros.map(g => {
    const stats = statsMap[g.id] ?? { total: 0, aprobadas: 0 }
    const tasa = stats.total > 0 ? Math.round((stats.aprobadas / stats.total) * 100) : 0
    return {
      ...g,
      totalFotos: stats.total,
      fotosAprobadas: stats.aprobadas,
      tasaAprobacion: tasa,
      vinculadoActual: actualesIds.has(g.id),
    }
  })

  // Solicitudes pendientes
  let solicitudes: Array<{
    id: string
    gondolero_id: string
    gondolero_alias: string | null
    gondolero_nombre: string | null
    created_at: string
  }> = []

  if (distriId) {
    try {
      const { data: solData } = await admin
        .from('gondolero_distri_solicitudes')
        .select('id, gondolero_id, created_at, gondolero:profiles!gondolero_id(alias, nombre)')
        .eq('distri_id', distriId)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true })

      solicitudes = ((solData ?? []) as unknown[]).map((s: unknown) => {
        const row = s as {
          id: string; gondolero_id: string; created_at: string
          gondolero: { alias: string | null; nombre: string | null } | Array<{ alias: string | null; nombre: string | null }> | null
        }
        const g = Array.isArray(row.gondolero) ? row.gondolero[0] : row.gondolero
        return {
          id: row.id,
          gondolero_id: row.gondolero_id,
          gondolero_alias: g?.alias ?? null,
          gondolero_nombre: g?.nombre ?? null,
          created_at: row.created_at,
        }
      })
    } catch {
      // Tabla puede no existir aún en la DB — ignorar
    }
  }

  const resolvedSearchParams = await searchParams
  const tab = resolvedSearchParams.tab ?? 'vinculados'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Gondoleros</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {gondolerosActuales.length} vinculado{gondolerosActuales.length !== 1 ? 's' : ''}
            {gondolerosHistoricos.length > 0 && ` · ${gondolerosHistoricos.length} histórico${gondolerosHistoricos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Panel de invitación — siempre visible */}
      <div className="mb-6">
        <InvitarPanel distriId={distriId ?? ''} distriNombre={distriNombre} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <a
          href="/distribuidora/gondoleros?tab=vinculados"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'vinculados'
              ? 'bg-[#BA7517] text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          Gondoleros ({lista.length})
        </a>
        <a
          href="/distribuidora/gondoleros?tab=solicitudes"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'solicitudes'
              ? 'bg-[#BA7517] text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          Solicitudes
          {solicitudes.length > 0 && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
              tab === 'solicitudes' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
            }`}>
              {solicitudes.length}
            </span>
          )}
        </a>
      </div>

      {/* Tab content */}
      {tab === 'solicitudes' ? (
        <SolicitudesTab
          solicitudes={solicitudes}
          distriId={distriId ?? ''}
          distriNombre={distriNombre}
        />
      ) : (
        /* Vinculados table */
        lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Users size={28} className="text-gray-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">Sin gondoleros aún</h3>
            <p className="text-sm text-gray-400">Cuando haya gondoleros vinculados, aparecerán acá.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Gondolero</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Nivel</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Fotos enviadas</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Tasa aprobación</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${g.vinculadoActual ? 'bg-gondo-amber-50' : 'bg-gray-100'}`}>
                          <span className={`font-bold text-xs ${g.vinculadoActual ? 'text-gondo-amber-400' : 'text-gray-400'}`}>
                            {(g.alias ?? g.nombre ?? '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900 truncate">{g.alias ?? g.nombre ?? 'Sin nombre'}</p>
                            {!g.vinculadoActual && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                                Desvinculado
                              </span>
                            )}
                          </div>
                          {g.alias && g.nombre && (
                            <p className="text-xs text-gray-400 truncate">{g.nombre}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${NIVEL_COLOR[g.nivel]}`}>
                        {NIVEL_LABEL[g.nivel]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Star size={13} className="text-gondo-amber-400" />
                        <span className="font-semibold text-gray-900">{g.totalFotos}</span>
                        {g.fotosAprobadas > 0 && (
                          <span className="text-xs text-gray-400">({g.fotosAprobadas} aprobadas)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {g.totalFotos > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gondo-verde-400 rounded-full" style={{ width: `${g.tasaAprobacion}%` }} />
                          </div>
                          <span className="font-medium text-gray-700 text-xs w-10 text-right">{g.tasaAprobacion}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {g.activo ? (
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle2 size={14} />
                          <span className="text-xs font-medium">Activo</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-gray-400">
                          <XCircle size={14} />
                          <span className="text-xs font-medium">Inactivo</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
