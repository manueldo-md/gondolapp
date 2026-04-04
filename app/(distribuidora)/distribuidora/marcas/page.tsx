import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { InvitarMarcaPanel } from './invitar-panel'
import { TerminarRelacionBtn } from './terminar-relacion-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function DistriMarcasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id, nombre')
    .eq('id', user.id)
    .single()

  if (!profile?.distri_id) redirect('/distribuidora/perfil')

  const { data: relaciones } = await admin
    .from('marca_distri_relaciones')
    .select(`
      id, estado, iniciado_por, created_at,
      marca:marcas(id, razon_social)
    `)
    .eq('distri_id', profile.distri_id)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lista = ((relaciones ?? []) as any[]).map(r => ({
    id: r.id,
    estado: r.estado,
    iniciadoPor: r.iniciado_por,
    createdAt: r.created_at,
    marcaId: Array.isArray(r.marca) ? r.marca[0]?.id : r.marca?.id,
    marcaNombre: Array.isArray(r.marca) ? r.marca[0]?.razon_social : r.marca?.razon_social,
  }))

  const { data: distriData } = await admin
    .from('distribuidoras')
    .select('razon_social')
    .eq('id', profile.distri_id)
    .single()

  const activas   = lista.filter(r => r.estado !== 'terminada')
  const historial = lista.filter(r => r.estado === 'terminada')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marcas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lista.filter(r => r.estado === 'activa').length} relaciones activas
            {historial.length > 0 && ` · ${historial.length} en historial`}
          </p>
        </div>
      </div>

      <InvitarMarcaPanel
        distriId={profile.distri_id}
        distriNombre={distriData?.razon_social ?? profile.nombre ?? 'Mi distribuidora'}
      />

      {lista.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-3xl mb-3">🏷️</p>
          <p className="text-sm font-medium text-gray-700">Sin marcas vinculadas</p>
          <p className="text-xs text-gray-400 mt-1">Invitá una marca para comenzar a colaborar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activas.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Marca', 'Estado', 'Iniciado por', 'Fecha', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activas.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.marcaNombre ?? '—'}</td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={r.estado} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 capitalize">{r.iniciadoPor ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        {r.estado === 'activa' && (
                          <TerminarRelacionBtn relacionId={r.id} />
                        )}
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
                      {['Marca', 'Estado', 'Iniciado por', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historial.map(r => (
                      <tr key={r.id} className="opacity-60">
                        <td className="px-4 py-3 font-medium text-gray-500">{r.marcaNombre ?? '—'}</td>
                        <td className="px-4 py-3">
                          <EstadoBadge estado={r.estado} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 capitalize">{r.iniciadoPor ?? '—'}</td>
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

function EstadoBadge({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    pendiente: 'bg-amber-50 text-amber-700',
    activa: 'bg-green-50 text-green-700',
    pausada: 'bg-gray-100 text-gray-500',
    terminada: 'bg-red-50 text-red-500',
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors[estado] ?? 'bg-gray-100 text-gray-500'}`}>
      {estado}
    </span>
  )
}
