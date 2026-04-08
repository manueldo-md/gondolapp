import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Bell, Info } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'

const POR_PAGINA = 20

export default async function RepoNotificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('repositora_id')
    .eq('id', user.id)
    .single()

  if (!profile?.repositora_id) redirect('/repositora/dashboard')
  const repoId = profile.repositora_id as string

  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const desde = (pagina - 1) * POR_PAGINA

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notificaciones, count } = await (admin as any)
    .from('notificaciones')
    .select('id, tipo, titulo, mensaje, leida, link_destino, created_at', { count: 'exact' })
    .eq('actor_id', repoId)
    .eq('actor_tipo', 'repositora')
    .order('created_at', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1)

  const lista = (notificaciones ?? []) as {
    id: string; tipo: string; titulo: string
    mensaje: string | null; leida: boolean
    link_destino: string | null; created_at: string
  }[]
  const total = count ?? 0
  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div className="max-w-2xl mx-auto">
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
          <p className="text-sm text-gray-400 mt-1">Acá aparecerán las novedades de tus fixers y campañas.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
          {lista.map(n => {
            const inner = (
              <div className={`flex items-start gap-3 px-5 py-4 ${!n.leida ? 'bg-blue-50 border-l-4 border-blue-600' : ''}`}>
                <Info size={18} className={`shrink-0 mt-0.5 ${!n.leida ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${!n.leida ? 'text-blue-900' : 'text-gray-800'}`}>
                    {n.titulo}
                  </p>
                  {n.mensaje && (
                    <p className={`text-xs mt-0.5 ${!n.leida ? 'text-blue-700' : 'text-gray-400'}`}>
                      {n.mensaje}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</p>
                </div>
                {!n.leida && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-blue-600 mt-1.5" />
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
            <Link href={`/repositora/notificaciones?pagina=${pagina - 1}`}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white">
              ← Anterior
            </Link>
          )}
          <span className="text-sm text-gray-400">{pagina} / {totalPaginas}</span>
          {pagina < totalPaginas && (
            <Link href={`/repositora/notificaciones?pagina=${pagina + 1}`}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white">
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
