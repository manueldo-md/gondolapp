import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { TerminarRelacionRepoDistriBtn } from './terminar-relacion-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    activa:    'bg-green-50 text-green-700',
    inactiva:  'bg-gray-100 text-gray-500',
    terminada: 'bg-red-50 text-red-500',
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors[estado] ?? 'bg-gray-100 text-gray-500'}`}>
      {estado}
    </span>
  )
}

export default async function RepoDistribuidorasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('repositora_id')
    .eq('id', user.id)
    .single()

  if (!profile?.repositora_id) redirect('/repositora/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: repoData } = await (admin as any)
    .from('repositoras')
    .select('razon_social')
    .eq('id', profile.repositora_id)
    .single()

  const repoNombre = repoData?.razon_social ?? 'Mi repositora'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: relaciones } = await (admin as any)
    .from('distri_repo_relaciones')
    .select(`
      id, estado, created_at,
      distri:distribuidoras(id, razon_social)
    `)
    .eq('repositora_id', profile.repositora_id)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lista = ((relaciones ?? []) as any[]).map(r => ({
    id: r.id,
    estado: r.estado,
    createdAt: r.created_at,
    distriId: Array.isArray(r.distri) ? r.distri[0]?.id : r.distri?.id,
    distriNombre: Array.isArray(r.distri) ? r.distri[0]?.razon_social : r.distri?.razon_social,
  }))

  const activas   = lista.filter(r => r.estado === 'activa')
  const historial = lista.filter(r => r.estado !== 'activa')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Distribuidoras</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {activas.length} relaciones activas
          {historial.length > 0 && ` · ${historial.length} en historial`}
        </p>
      </div>

      {lista.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-3xl mb-3">🏢</p>
          <p className="text-sm font-medium text-gray-700">Sin distribuidoras vinculadas</p>
          <p className="text-xs text-gray-400 mt-1">
            Las distribuidoras pueden invitarte desde su panel en GondolApp
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activas.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Distribuidora', 'Estado', 'Fecha', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activas.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.distriNombre ?? '—'}</td>
                      <td className="px-4 py-3"><EstadoBadge estado={r.estado} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <TerminarRelacionRepoDistriBtn
                          relacionId={r.id}
                          nombreDistri={r.distriNombre ?? 'la distribuidora'}
                          nombreRepo={repoNombre}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {historial.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">Historial</p>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Distribuidora', 'Estado', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historial.map(r => (
                      <tr key={r.id} className="opacity-70">
                        <td className="px-4 py-3 font-medium text-gray-500">{r.distriNombre ?? '—'}</td>
                        <td className="px-4 py-3"><EstadoBadge estado={r.estado} /></td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(r.createdAt).toLocaleDateString('es-AR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
