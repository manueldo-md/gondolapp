import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Users, Star, CheckCircle2, XCircle } from 'lucide-react'
import { SolicitudesFixerTab } from './solicitudes-tab'
import { InvitarFixerPanel } from './invitar-panel'
import { FixerDesvincularBtn } from './fixer-desvincular-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface FixerRow {
  id: string
  nombre: string | null
  alias: string | null
  activo: boolean
  created_at: string
}

interface FixerConStats extends FixerRow {
  totalFotos: number
  fotosAprobadas: number
  tasaAprobacion: number
  vinculadoActual: boolean
}

export default async function FixersDistriPage({
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

  let distriNombre = 'Mi distribuidora'
  if (distriId) {
    const { data: distriData } = await admin
      .from('distribuidoras')
      .select('razon_social')
      .eq('id', distriId)
      .single()
    if (distriData?.razon_social) distriNombre = distriData.razon_social
  }

  // Fuente de verdad: fixer_distri_solicitudes
  let actualesIds: string[] = []
  let historicosIds: string[] = []
  if (distriId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [actSol, histSol] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from('fixer_distri_solicitudes').select('fixer_id').eq('distri_id', distriId).eq('estado', 'aprobada'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from('fixer_distri_solicitudes').select('fixer_id').eq('distri_id', distriId).eq('estado', 'terminada'),
    ])
    actualesIds  = (actSol.data  ?? []).map((s: { fixer_id: string }) => s.fixer_id)
    historicosIds = (histSol.data ?? []).map((s: { fixer_id: string }) => s.fixer_id)
  }

  const allIds = [...actualesIds, ...historicosIds]
  let fixersActuales: FixerRow[]   = []
  let fixersHistoricos: FixerRow[] = []
  if (allIds.length > 0) {
    const { data: profilesData } = await admin
      .from('profiles')
      .select('id, nombre, alias, activo, created_at')
      .in('id', allIds)
      .order('created_at', { ascending: false })
    const actualesSet  = new Set(actualesIds)
    const historicosSet = new Set(historicosIds)
    for (const p of (profilesData ?? []) as FixerRow[]) {
      if (actualesSet.has(p.id))        fixersActuales.push(p)
      else if (historicosSet.has(p.id)) fixersHistoricos.push(p)
    }
  }

  const actualesIdSet = new Set(actualesIds)
  const fixers: FixerRow[] = [...fixersActuales, ...fixersHistoricos]

  // Stats de fotos
  const ids = fixers.map(f => f.id)
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

  const lista: FixerConStats[] = fixers.map(f => {
    const stats = statsMap[f.id] ?? { total: 0, aprobadas: 0 }
    const tasa = stats.total > 0 ? Math.round((stats.aprobadas / stats.total) * 100) : 0
    return {
      ...f,
      totalFotos: stats.total,
      fotosAprobadas: stats.aprobadas,
      tasaAprobacion: tasa,
      vinculadoActual: actualesIdSet.has(f.id),
    }
  })

  // Solicitudes pendientes
  let solicitudes: Array<{
    id: string
    fixer_id: string
    fixer_alias: string | null
    fixer_nombre: string | null
    created_at: string
  }> = []

  if (distriId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: solData } = await (admin as any)
        .from('fixer_distri_solicitudes')
        .select('id, fixer_id, created_at, fixer:profiles!fixer_id(alias, nombre)')
        .eq('distri_id', distriId)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true })

      solicitudes = ((solData ?? []) as unknown[]).map((s: unknown) => {
        const row = s as {
          id: string; fixer_id: string; created_at: string
          fixer: { alias: string | null; nombre: string | null } | Array<{ alias: string | null; nombre: string | null }> | null
        }
        const f = Array.isArray(row.fixer) ? row.fixer[0] : row.fixer
        return {
          id: row.id,
          fixer_id: row.fixer_id,
          fixer_alias: f?.alias ?? null,
          fixer_nombre: f?.nombre ?? null,
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
          <h2 className="text-xl font-bold text-gray-900">Fixers</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {fixersActuales.length} vinculado{fixersActuales.length !== 1 ? 's' : ''}
            {fixersHistoricos.length > 0 && ` · ${fixersHistoricos.length} histórico${fixersHistoricos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Panel de invitación — siempre visible */}
      <div className="mb-6">
        <InvitarFixerPanel distriId={distriId ?? ''} distriNombre={distriNombre} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <a
          href="/distribuidora/fixers?tab=vinculados"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'vinculados'
              ? 'bg-[#BA7517] text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          Fixers ({lista.length})
        </a>
        <a
          href="/distribuidora/fixers?tab=solicitudes"
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
        <SolicitudesFixerTab
          solicitudes={solicitudes}
          distriId={distriId ?? ''}
          distriNombre={distriNombre}
        />
      ) : (
        lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Users size={28} className="text-gray-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">Sin fixers aún</h3>
            <p className="text-sm text-gray-400">Cuando haya fixers vinculados, aparecerán acá.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Fixer</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Fotos enviadas</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Tasa aprobación</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${f.vinculadoActual ? 'bg-gondo-amber-50' : 'bg-gray-100'}`}>
                          <span className={`font-bold text-xs ${f.vinculadoActual ? 'text-gondo-amber-400' : 'text-gray-400'}`}>
                            {(f.alias ?? f.nombre ?? '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900 truncate">{f.alias ?? f.nombre ?? 'Sin nombre'}</p>
                            {!f.vinculadoActual && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                                Desvinculado
                              </span>
                            )}
                          </div>
                          {f.alias && f.nombre && (
                            <p className="text-xs text-gray-400 truncate">{f.nombre}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Star size={13} className="text-gondo-amber-400" />
                        <span className="font-semibold text-gray-900">{f.totalFotos}</span>
                        {f.fotosAprobadas > 0 && (
                          <span className="text-xs text-gray-400">({f.fotosAprobadas} aprobadas)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {f.totalFotos > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gondo-verde-400 rounded-full" style={{ width: `${f.tasaAprobacion}%` }} />
                          </div>
                          <span className="font-medium text-gray-700 text-xs w-10 text-right">{f.tasaAprobacion}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {f.activo ? (
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
                    <td className="px-4 py-3.5 text-right">
                      {f.vinculadoActual && distriId && (
                        <FixerDesvincularBtn
                          fixerId={f.id}
                          distriId={distriId}
                          distriNombre={distriNombre}
                          fixerAlias={f.alias ?? f.nombre ?? 'El fixer'}
                        />
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
