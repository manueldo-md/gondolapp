import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Users, Star, TrendingUp, CheckCircle2, XCircle } from 'lucide-react'
import type { NivelGondolero } from '@/types'

// ── Tipos ─────────────────────────────────────────────────────────────────────

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
}

// ── Helpers visuales ──────────────────────────────────────────────────────────

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

// ── Página ────────────────────────────────────────────────────────────────────

export default async function GondolerosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener distri_id del usuario actual
  const { data: perfil } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = perfil?.distri_id ?? null

  // Gondoleros vinculados a esta distribuidora
  const query = admin
    .from('profiles')
    .select('id, nombre, alias, nivel, activo, created_at')
    .eq('tipo_actor', 'gondolero')
    .order('created_at', { ascending: false })

  if (distriId) query.eq('distri_id', distriId)

  const { data: gondolerosData, error } = await query
  if (error) console.error('Error fetching gondoleros:', error.message)

  const gondoleros = (gondolerosData as GondoleroRow[] | null) ?? []

  // Stats de fotos por gondolero
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
      },
      {}
    )
  }

  const lista: GondoleroConStats[] = gondoleros.map(g => {
    const stats = statsMap[g.id] ?? { total: 0, aprobadas: 0 }
    const tasa = stats.total > 0 ? Math.round((stats.aprobadas / stats.total) * 100) : 0
    return { ...g, totalFotos: stats.total, fotosAprobadas: stats.aprobadas, tasaAprobacion: tasa }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Gondoleros</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {lista.length} gondolero{lista.length !== 1 ? 's' : ''} vinculado{lista.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {lista.length === 0 ? (
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
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Gondolero
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Nivel
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Fotos enviadas
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Tasa aprobación
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(g => (
                <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                  {/* Nombre */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gondo-amber-50 flex items-center justify-center shrink-0">
                        <span className="text-gondo-amber-400 font-bold text-xs">
                          {(g.alias ?? g.nombre ?? '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {g.alias ?? g.nombre ?? 'Sin nombre'}
                        </p>
                        {g.alias && g.nombre && (
                          <p className="text-xs text-gray-400 truncate">{g.nombre}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Nivel */}
                  <td className="px-4 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${NIVEL_COLOR[g.nivel]}`}>
                      {NIVEL_LABEL[g.nivel]}
                    </span>
                  </td>

                  {/* Fotos */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Star size={13} className="text-gondo-amber-400" />
                      <span className="font-semibold text-gray-900">{g.totalFotos}</span>
                      {g.fotosAprobadas > 0 && (
                        <span className="text-xs text-gray-400">
                          ({g.fotosAprobadas} aprobadas)
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Tasa */}
                  <td className="px-4 py-3.5 text-right">
                    {g.totalFotos > 0 ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gondo-verde-400 rounded-full"
                            style={{ width: `${g.tasaAprobacion}%` }}
                          />
                        </div>
                        <span className="font-medium text-gray-700 text-xs w-10 text-right">
                          {g.tasaAprobacion}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>

                  {/* Estado */}
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
      )}
    </div>
  )
}
