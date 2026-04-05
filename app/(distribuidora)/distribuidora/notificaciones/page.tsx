import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Bell, Users, Megaphone, Store, Clock, Tag, Info } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { MarcarDistriLeidas } from './marcar-leidas'
import type { TipoNotificacion } from '@/lib/notificaciones'

const POR_PAGINA = 20

const ICONO_TIPO: Record<string, React.ElementType> = {
  campana_marca_pendiente:        Megaphone,
  gondolero_solicitud_vinculacion: Users,
  gondolero_completo_mision:      Users,
  comercio_pendiente_validacion:  Store,
  marca_solicitud_reinicio_relacion: Tag,
  campana_por_vencer_distri:      Clock,
}

const COLOR_TIPO: Record<string, string> = {
  campana_marca_pendiente:        'text-gondo-amber-400',
  gondolero_solicitud_vinculacion: 'text-blue-500',
  gondolero_completo_mision:      'text-green-500',
  comercio_pendiente_validacion:  'text-orange-500',
  marca_solicitud_reinicio_relacion: 'text-purple-500',
  campana_por_vencer_distri:      'text-amber-500',
}

export default async function DistriNotificacionesPage({
  searchParams,
}: {
  searchParams: { pagina?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  if (!profile?.distri_id) redirect('/distribuidora/dashboard')
  const distriId = profile.distri_id

  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10))
  const desde = (pagina - 1) * POR_PAGINA

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notificaciones, count } = await (admin as any)
    .from('notificaciones')
    .select('id, tipo, titulo, mensaje, leida, link_destino, created_at', { count: 'exact' })
    .eq('actor_id', distriId)
    .eq('actor_tipo', 'distribuidora')
    .order('created_at', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1)

  const lista = (notificaciones ?? []) as {
    id: string; tipo: TipoNotificacion; titulo: string
    mensaje: string | null; leida: boolean
    link_destino: string | null; created_at: string
  }[]
  const total = count ?? 0
  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const hayNoLeidas = lista.some(n => !n.leida)

  return (
    <div className="max-w-2xl mx-auto">
      {hayNoLeidas && <MarcarDistriLeidas distriId={distriId} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Notificaciones</h1>
          {total > 0 && <p className="text-sm text-gray-400 mt-0.5">{total} en total</p>}
        </div>
        <Bell size={20} className="text-gray-400" />
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-100">
          <Bell size={40} className="text-gray-200 mb-4" />
          <p className="font-semibold text-gray-700">Sin notificaciones</p>
          <p className="text-sm text-gray-400 mt-1">Acá aparecerán las novedades de tus campañas y gondoleros.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
          {lista.map(n => {
            const Icon = ICONO_TIPO[n.tipo] ?? Info
            const colorIcon = COLOR_TIPO[n.tipo] ?? 'text-gray-400'
            const inner = (
              <div className={`flex items-start gap-3 px-5 py-4 ${!n.leida ? 'bg-amber-50 border-l-4 border-gondo-amber-400' : ''}`}>
                <Icon size={18} className={`shrink-0 mt-0.5 ${colorIcon}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${!n.leida ? 'text-amber-900' : 'text-gray-800'}`}>
                    {n.titulo}
                  </p>
                  {n.mensaje && (
                    <p className={`text-xs mt-0.5 ${!n.leida ? 'text-amber-700' : 'text-gray-400'}`}>
                      {n.mensaje}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</p>
                </div>
                {!n.leida && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-gondo-amber-400 mt-1.5" />
                )}
              </div>
            )
            return n.link_destino ? (
              <Link key={n.id} href={n.link_destino} className="block hover:bg-gray-50 transition-colors">
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            )
          })}
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          {pagina > 1 && (
            <Link href={`/distribuidora/notificaciones?pagina=${pagina - 1}`}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white">
              ← Anterior
            </Link>
          )}
          <span className="text-sm text-gray-400">{pagina} / {totalPaginas}</span>
          {pagina < totalPaginas && (
            <Link href={`/distribuidora/notificaciones?pagina=${pagina + 1}`}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white">
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
