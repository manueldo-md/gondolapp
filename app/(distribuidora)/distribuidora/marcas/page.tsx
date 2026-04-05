import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { InvitarMarcaPanel } from './invitar-panel'
import { TerminarRelacionBtn } from './terminar-relacion-btn'
import { ReiniciarRelacionBtnDistri } from './reiniciar-btn'
import { SolicitudReinicioCardDistri } from './solicitud-reinicio-card'

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

  const relacionIds = lista.map(r => r.id)

  // Solicitudes de reinicio pendientes (iniciadas por marca → distri debe responder)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let solicitudesPendientes: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let solicitudesEnviadas: any[] = []
  if (relacionIds.length > 0) {
    const { data: solsData } = await admin
      .from('relacion_reinicio_solicitudes')
      .select('id, relacion_id, solicitado_por, estado, created_at')
      .in('relacion_id', relacionIds)
      .eq('estado', 'pendiente')

    solicitudesPendientes = ((solsData ?? []) as any[]).filter(s => s.solicitado_por === 'marca')
    solicitudesEnviadas   = ((solsData ?? []) as any[]).filter(s => s.solicitado_por === 'distri')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let solicitudesRechazadas: any[] = []
  if (relacionIds.length > 0) {
    const { data: rechData } = await admin
      .from('relacion_reinicio_solicitudes')
      .select('relacion_id, solicitado_por, estado')
      .in('relacion_id', relacionIds)
      .eq('estado', 'rechazada')
      .eq('solicitado_por', 'distri')
    solicitudesRechazadas = rechData ?? []
  }

  const activas   = lista.filter(r => r.estado !== 'terminada')
  const historial = lista.filter(r => r.estado === 'terminada')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const solPendMap = new Map<string, any>()
  for (const s of solicitudesPendientes) solPendMap.set(s.relacion_id, s)

  const solEnviadaSet   = new Set(solicitudesEnviadas.map((s: any) => s.relacion_id))
  const solRechazadaSet = new Set(solicitudesRechazadas.map((s: any) => s.relacion_id))

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

      {/* Banners de solicitudes de reinicio (la marca quiere reiniciar) */}
      {solicitudesPendientes.length > 0 && (
        <div className="space-y-3">
          {solicitudesPendientes.map(sol => {
            const rel = lista.find(r => r.id === sol.relacion_id)
            if (!rel) return null
            return (
              <SolicitudReinicioCardDistri
                key={sol.id}
                solicitudId={sol.id}
                relacionId={rel.id}
                marcaNombre={rel.marcaNombre ?? 'La marca'}
                relacionFechaInicio={rel.createdAt}
              />
            )
          })}
        </div>
      )}

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
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/distribuidora/marcas/${r.id}`} className="hover:text-[#BA7517] hover:underline">
                          {r.marcaNombre ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={r.estado} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 capitalize">{r.iniciadoPor ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {r.estado === 'activa' && (
                            <TerminarRelacionBtn
                              relacionId={r.id}
                              nombreMarca={r.marcaNombre ?? 'la marca'}
                              nombreDistri={distriData?.razon_social ?? 'la distribuidora'}
                            />
                          )}
                          <Link href={`/distribuidora/marcas/${r.id}`} className="text-xs text-gray-400 hover:text-gray-700">
                            Ver →
                          </Link>
                        </div>
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
                      {['Marca', 'Estado', 'Iniciado por', 'Fecha', 'Acciones'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historial.map(r => {
                      const tieneEnviada   = solEnviadaSet.has(r.id)
                      const tieneRechazada = solRechazadaSet.has(r.id)
                      const btnEstado = tieneEnviada ? 'pendiente' as const
                        : tieneRechazada ? 'rechazada' as const
                        : null
                      return (
                        <tr key={r.id} className="opacity-70 hover:opacity-100 transition-opacity">
                          <td className="px-4 py-3 font-medium text-gray-500">
                            <Link href={`/distribuidora/marcas/${r.id}`} className="hover:text-[#BA7517] hover:underline">
                              {r.marcaNombre ?? '—'}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <EstadoBadge estado={r.estado} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 capitalize">{r.iniciadoPor ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {new Date(r.createdAt).toLocaleDateString('es-AR')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ReiniciarRelacionBtnDistri
                                relacionId={r.id}
                                marcaNombre={r.marcaNombre ?? 'la marca'}
                                solicitudEstado={btnEstado}
                              />
                              <Link href={`/distribuidora/marcas/${r.id}`} className="text-xs text-gray-400 hover:text-gray-700">
                                Ver →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
