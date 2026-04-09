import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { InvitarRepoPanel } from './invitar-panel'
import { TerminarRelacionRepoBtn } from './terminar-relacion-btn'

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

export default async function MarcaRepositorasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id, nombre')
    .eq('id', user.id)
    .single()

  if (!profile?.marca_id) redirect('/marca/perfil')

  const { data: marcaData } = await admin
    .from('marcas')
    .select('razon_social')
    .eq('id', profile.marca_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: relaciones } = await (admin as any)
    .from('marca_repo_relaciones')
    .select(`
      id, estado, created_at,
      repo:repositoras(id, razon_social)
    `)
    .eq('marca_id', profile.marca_id)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lista = ((relaciones ?? []) as any[]).map(r => ({
    id: r.id,
    estado: r.estado,
    createdAt: r.created_at,
    repoId: Array.isArray(r.repo) ? r.repo[0]?.id : r.repo?.id,
    repoNombre: Array.isArray(r.repo) ? r.repo[0]?.razon_social : r.repo?.razon_social,
  }))

  const activas   = lista.filter(r => r.estado === 'activa')
  const historial = lista.filter(r => r.estado !== 'activa')

  const marcaNombre = marcaData?.razon_social ?? profile.nombre ?? 'Mi marca'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Repositoras</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activas.length} relaciones activas
            {historial.length > 0 && ` · ${historial.length} en historial`}
          </p>
        </div>
      </div>

      <InvitarRepoPanel
        marcaId={profile.marca_id}
        marcaNombre={marcaNombre}
      />

      {lista.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-3xl mb-3">📦</p>
          <p className="text-sm font-medium text-gray-700">Sin repositoras vinculadas</p>
          <p className="text-xs text-gray-400 mt-1">Invitá una repositora para comenzar a colaborar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activas.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Repositora', 'Estado', 'Fecha', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activas.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.repoNombre ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={r.estado} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <TerminarRelacionRepoBtn
                          relacionId={r.id}
                          nombreMarca={marcaNombre}
                          nombreRepo={r.repoNombre ?? 'la repositora'}
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
                      {['Repositora', 'Estado', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historial.map(r => (
                      <tr key={r.id} className="opacity-70">
                        <td className="px-4 py-3 font-medium text-gray-500">{r.repoNombre ?? '—'}</td>
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
