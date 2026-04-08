import { createClient as createAdminClient } from '@supabase/supabase-js'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { tiempoRelativo } from '@/lib/utils'
import { ValidarRepoBtn } from './validar-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function RepositorasAdminPage() {
  const admin = adminClient()

  const { data: reposRaw } = await admin
    .from('repositoras')
    .select('id, razon_social, cuit, validada, created_at')
    .order('created_at', { ascending: false })

  const repos = (reposRaw ?? []) as {
    id: string; razon_social: string; cuit: string | null; validada: boolean; created_at: string
  }[]

  const repoIds = repos.map(r => r.id)

  let fixerMap: Record<string, number> = {}
  let campanasMap: Record<string, number> = {}

  if (repoIds.length > 0) {
    const [{ data: fixersData }, { data: campanasData }] = await Promise.all([
      admin.from('profiles').select('repositora_id').in('repositora_id', repoIds).eq('tipo_actor', 'fixer'),
      admin.from('campanas').select('id, campana_zonas(zona_id)').eq('estado', 'activa').eq('actor_campana', 'fixer'),
    ])
    fixerMap = ((fixersData ?? []) as { repositora_id: string }[]).reduce(
      (acc, p) => { acc[p.repositora_id] = (acc[p.repositora_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
    // Campañas con actor_campana='fixer' activas — contamos por repositora via fixers vinculados
    // Como campañas no tienen repositora_id directamente, mostramos total de campañas fixer activas
    const totalCampanasFixer = (campanasData ?? []).length
    // Distribuimos el total como indicador global (no hay FK directa campana→repositora)
    repoIds.forEach(id => { campanasMap[id] = totalCampanasFixer })
  }

  const validadas  = repos.filter(r => r.validada).length
  const pendientes = repos.length - validadas

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Repositoras</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {repos.length} repositoras · {validadas} validadas · {pendientes} pendientes
          </p>
        </div>
        <Link
          href="/admin/repositoras/nueva"
          className="px-4 py-2 bg-[#1E1B4B] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2a6e] transition-colors"
        >
          + Nueva repositora
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Repositora', 'CUIT', 'Estado', 'Fixers', 'Camp. fixer activas', 'Registro', 'Acción'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {repos.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <Link href={`/admin/repositoras/${r.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                      {r.razon_social}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 font-mono">
                    {r.cuit ?? '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    {r.validada ? (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 size={14} />
                        <span className="text-xs font-semibold">Validada</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <AlertCircle size={14} />
                        <span className="text-xs font-semibold">Pendiente</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">
                    {fixerMap[r.id] ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">
                    {campanasMap[r.id] ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                    {tiempoRelativo(r.created_at)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {!r.validada && <ValidarRepoBtn repoId={r.id} />}
                      <Link
                        href={`/admin/repositoras/${r.id}`}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Ver
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {repos.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin repositoras registradas</p>
          )}
        </div>
      </div>
    </div>
  )
}
