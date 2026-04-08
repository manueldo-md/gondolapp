import { createClient as createAdminClient } from '@supabase/supabase-js'
import { tiempoRelativo } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FixersAdminPage() {
  const admin = adminClient()

  const { data: fixersRaw } = await admin
    .from('profiles')
    .select('id, alias, nombre, activo, fotos_aprobadas, repositora_id, created_at')
    .eq('tipo_actor', 'fixer')
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixers = (fixersRaw ?? []) as any[]

  // Obtener nombre de repositoras
  const repoIds = [...new Set(fixers.map(f => f.repositora_id).filter(Boolean))] as string[]
  let repoMap: Record<string, string> = {}
  if (repoIds.length > 0) {
    const { data: reposData } = await admin
      .from('repositoras')
      .select('id, razon_social')
      .in('id', repoIds)
    repoMap = ((reposData ?? []) as { id: string; razon_social: string }[]).reduce(
      (acc, r) => { acc[r.id] = r.razon_social; return acc },
      {} as Record<string, string>
    )
  }

  // Conteo de fotos por fixer
  const fixerIds = fixers.map(f => f.id)
  let fotosMap: Record<string, number> = {}
  if (fixerIds.length > 0) {
    const { data: fotosData } = await admin
      .from('fotos')
      .select('gondolero_id')
      .in('gondolero_id', fixerIds)
    fotosMap = ((fotosData ?? []) as { gondolero_id: string }[]).reduce(
      (acc, f) => { acc[f.gondolero_id] = (acc[f.gondolero_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Fixers</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {fixers.length} fixer{fixers.length !== 1 ? 's' : ''} registrado{fixers.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Fixer', 'Nombre', 'Repositora', 'Fotos totales', 'Aprobadas', 'Estado', 'Registro'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {fixers.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-gray-900">{f.alias ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">
                    {f.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">
                    {f.repositora_id ? (repoMap[f.repositora_id] ?? 'Sin nombre') : (
                      <span className="text-gray-400 italic">Sin repositora</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">
                    {fotosMap[f.id] ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">
                    {f.fotos_aprobadas ?? 0}
                  </td>
                  <td className="px-4 py-3.5">
                    {f.activo ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={11} /> Activo
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                    {tiempoRelativo(f.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fixers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin fixers registrados</p>
          )}
        </div>
      </div>
    </div>
  )
}
