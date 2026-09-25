import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Bell, Megaphone, Store, AlertTriangle, Info } from 'lucide-react'
import { NotificacionesLista } from '@/components/shared/notificaciones-lista'
import { MarcarTodasLeidas } from './marcar-leidas'
import { marcarUnaNotificacionAdminLeida } from './actions'
import type { TipoNotificacion } from '@/lib/notificaciones'

const POR_PAGINA = 20

const ICONO_TIPO: Record<string, React.ElementType> = {
  admin_campana_pendiente: Megaphone,
  admin_comercio_pendiente: Store,
  admin_error_reportado: AlertTriangle,
}

const COLOR_TIPO: Record<string, string> = {
  admin_campana_pendiente: 'text-gondo-indigo-600',
  admin_comercio_pendiente: 'text-orange-500',
  admin_error_reportado: 'text-red-500',
}

export default async function AdminNotificacionesPage({
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
    .select('tipo_actor')
    .eq('id', user.id)
    .single()

  if (profile?.tipo_actor !== 'admin') redirect('/auth')

  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10))
  const desde = (pagina - 1) * POR_PAGINA

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notificaciones, count } = await (admin as any)
    .from('notificaciones')
    .select('id, tipo, titulo, mensaje, leida, link_destino, created_at', { count: 'exact' })
    .eq('actor_tipo', 'admin')
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Notificaciones del sistema</h1>
          {total > 0 && <p className="text-sm text-white/40 mt-0.5">{total} en total</p>}
        </div>
        <div className="flex items-center gap-3">
          {/* Marcar todas es una ACCIÓN EXPLÍCITA y no el efecto de entrar.
              Ver el comentario de marcar-leidas.tsx. */}
          {hayNoLeidas && <MarcarTodasLeidas />}
          <Bell size={20} className="text-white/40" />
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white/10 rounded-2xl border border-white/10">
          <Bell size={40} className="text-white/20 mb-4" />
          <p className="font-semibold text-white/60">Sin notificaciones</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <NotificacionesLista
            tema="admin"
            marcarLeida={marcarUnaNotificacionAdminLeida}
            items={lista.map(n => {
              const Icon = ICONO_TIPO[n.tipo] ?? Info
              const colorIcon = COLOR_TIPO[n.tipo] ?? 'text-gray-400'
              return {
                id: n.id, titulo: n.titulo, mensaje: n.mensaje,
                leida: n.leida, created_at: n.created_at,
                href: n.link_destino,
                icono: <Icon size={18} className={`shrink-0 mt-0.5 ${colorIcon}`} />,
              }
            })}
          />
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          {pagina > 1 && (
            <Link href={`/admin/notificaciones?pagina=${pagina - 1}`}
              className="px-4 py-2 rounded-xl border border-white/20 text-sm font-medium text-white/60 bg-white/10">
              ← Anterior
            </Link>
          )}
          <span className="text-sm text-white/40">{pagina} / {totalPaginas}</span>
          {pagina < totalPaginas && (
            <Link href={`/admin/notificaciones?pagina=${pagina + 1}`}
              className="px-4 py-2 rounded-xl border border-white/20 text-sm font-medium text-white/60 bg-white/10">
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
