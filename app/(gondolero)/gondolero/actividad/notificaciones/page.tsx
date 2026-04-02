import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { MarcarNotificacionesLeidas } from '../../perfil/marcar-leidas'

const POR_PAGINA = 20

export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams: { pagina?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10))
  const desde = (pagina - 1) * POR_PAGINA

  const { data: notificaciones, count } = await admin
    .from('notificaciones')
    .select('id, tipo, titulo, mensaje, leida, created_at', { count: 'exact' })
    .eq('gondolero_id', user.id)
    .order('created_at', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1)

  const lista = notificaciones ?? []
  const total = count ?? 0
  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const hayNoLeidas = lista.some((n: { leida: boolean }) => !n.leida)

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {hayNoLeidas && <MarcarNotificacionesLeidas gondoleroId={user.id} />}

      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <Link
          href="/gondolero/actividad"
          className="inline-flex items-center gap-1.5 text-gray-500 text-sm mb-3 -ml-1"
        >
          <ArrowLeft size={16} />
          Actividad
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Notificaciones</h1>
        {total > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">{total} en total</p>
        )}
      </div>

      <div className="px-4 py-4">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🔔</div>
            <p className="text-base font-semibold text-gray-700">Sin notificaciones</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden divide-y divide-gray-100">
            {lista.map((n: {
              id: string
              titulo: string
              mensaje: string | null
              leida: boolean
              created_at: string
            }) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 ${
                  !n.leida ? 'bg-red-50 border-l-2 border-red-400' : 'bg-white'
                }`}
              >
                <div className="shrink-0 mt-1.5">
                  {!n.leida ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full h-2 w-2 bg-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${!n.leida ? 'text-red-800' : 'text-gray-700'}`}>
                    {n.titulo}
                  </p>
                  {n.mensaje && (
                    <p className={`text-xs mt-0.5 ${!n.leida ? 'text-red-700' : 'text-gray-400'}`}>
                      {n.mensaje}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            {pagina > 1 && (
              <Link
                href={`/gondolero/actividad/notificaciones?pagina=${pagina - 1}`}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white"
              >
                ← Anterior
              </Link>
            )}
            <span className="text-sm text-gray-400">{pagina} / {totalPaginas}</span>
            {pagina < totalPaginas && (
              <Link
                href={`/gondolero/actividad/notificaciones?pagina=${pagina + 1}`}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white"
              >
                Siguiente →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
