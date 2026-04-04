import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BarChart2, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { MarcarNotificacionesLeidas } from '../perfil/marcar-leidas'

export default async function ActividadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [
    notificacionesRes,
    fotosPendientesRes,
    movimientosRes,
    canjesRes,
  ] = await Promise.all([
    admin.from('notificaciones')
      .select('id, tipo, titulo, mensaje, leida, created_at')
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3),
    admin.from('fotos')
      .select('id, created_at, comercio:comercios(nombre), campana:campanas(nombre)', { count: 'exact' })
      .eq('gondolero_id', user.id)
      .in('estado', ['pendiente', 'en_revision'])
      .order('created_at', { ascending: false })
      .limit(3),
    admin.from('movimientos_puntos')
      .select('id, tipo, monto, concepto, created_at')
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    admin.from('canjes')
      .select('id, premio, puntos, estado, created_at')
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const notificaciones    = notificacionesRes.data ?? []
  const hayNoLeidas       = notificaciones.some((n: { leida: boolean }) => !n.leida)
  const fotosPendientesTotal   = fotosPendientesRes.count ?? 0
  const fotosPendientesPreview = (fotosPendientesRes.data ?? []) as unknown as {
    id: string; created_at: string
    comercio: { nombre: string } | null; campana: { nombre: string } | null
  }[]
  const movimientos = movimientosRes.data ?? []
  const canjes      = canjesRes.data ?? []

  const PREMIO_LABEL: Record<string, string> = {
    credito_celular: '🔋 Crédito celular',
    nafta_ypf:       '⛽ Nafta YPF',
    giftcard_ml:     '🎁 Gift Card ML',
    transferencia:   '🏦 Transferencia bancaria',
  }
  const ESTADO_CANJE: Record<string, { label: string; color: string }> = {
    pendiente:  { label: 'En proceso',  color: 'text-amber-600' },
    procesado:  { label: 'Procesado',   color: 'text-blue-600'  },
    entregado:  { label: 'Entregado ✓', color: 'text-green-600' },
    fallido:    { label: 'Fallido',     color: 'text-red-500'   },
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <BarChart2 size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Actividad</h1>
        </div>
      </div>

      {hayNoLeidas && <MarcarNotificacionesLeidas gondoleroId={user.id} />}

      <div className="px-4 space-y-4 pt-4">

        {/* ── Notificaciones ── */}
        {notificaciones.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Notificaciones</h2>
              <Link
                href="/gondolero/actividad/notificaciones"
                className="flex items-center gap-0.5 text-xs text-gondo-verde-400 font-medium"
              >
                Ver todas <ChevronRight size={13} />
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden divide-y divide-gray-100 border border-gray-100 shadow-sm">
              {notificaciones.map((n: {
                id: string; titulo: string; mensaje: string | null; leida: boolean; created_at: string
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
          </div>
        )}

        {notificaciones.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <p className="text-2xl mb-2">🔔</p>
            <p className="text-sm font-semibold text-gray-600">Sin notificaciones nuevas</p>
            <p className="text-xs text-gray-400 mt-1">Acá aparecen las novedades de tus fotos y campañas.</p>
          </div>
        )}

        {/* ── Fotos en revisión ── */}
        {fotosPendientesTotal > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-amber-800">
                ⏳ {fotosPendientesTotal} {fotosPendientesTotal === 1 ? 'foto en revisión' : 'fotos en revisión'}
              </p>
              <Link
                href="/gondolero/actividad/pendientes"
                className="flex items-center gap-0.5 text-xs text-amber-700 font-medium"
              >
                Ver todas <ChevronRight size={13} />
              </Link>
            </div>
            <p className="text-xs text-amber-600 mb-3">Te avisamos cuando sean aprobadas.</p>
            <div className="space-y-1.5">
              {fotosPendientesPreview.map(f => (
                <div key={f.id} className="flex items-center justify-between text-xs">
                  <span className="text-amber-800 font-medium truncate mr-2">
                    {f.comercio?.nombre ?? 'Comercio'}
                  </span>
                  <span className="text-amber-600 shrink-0">{f.campana?.nombre ?? ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Movimientos de puntos ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Movimientos de puntos</h2>
            {movimientos.length > 0 && (
              <Link
                href="/gondolero/actividad/movimientos"
                className="flex items-center gap-0.5 text-xs text-gondo-verde-400 font-medium"
              >
                Ver todos <ChevronRight size={13} />
              </Link>
            )}
          </div>
          {movimientos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <p className="text-sm text-gray-400">Todavía no hay movimientos.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50 overflow-hidden shadow-sm">
              {movimientos.map((m: {
                id: string; tipo: string; monto: number; concepto: string | null; created_at: string
              }) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    m.tipo === 'credito' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {m.tipo === 'credito'
                      ? <ArrowUp size={14} className="text-gondo-verde-400" />
                      : <ArrowDown size={14} className="text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{m.concepto ?? 'Movimiento'}</p>
                    <p className="text-xs text-gray-400">{tiempoRelativo(m.created_at)}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${
                    m.tipo === 'credito' ? 'text-gondo-verde-400' : 'text-red-500'
                  }`}>
                    {m.tipo === 'credito' ? '+' : '−'}{m.monto.toLocaleString('es-AR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Historial de canjes ── */}
        {canjes.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Mis canjes</h2>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50 overflow-hidden shadow-sm">
              {canjes.map((c: { id: string; premio: unknown; puntos: number; estado: string; created_at: string }) => {
                const estadoInfo = ESTADO_CANJE[c.estado] ?? { label: c.estado, color: 'text-gray-500' }
                return (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 font-medium truncate">
                        {PREMIO_LABEL[String(c.premio)] ?? String(c.premio).replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-400">{tiempoRelativo(c.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-700">
                        {c.puntos.toLocaleString('es-AR')} pts
                      </p>
                      <p className={`text-[11px] font-semibold ${estadoInfo.color}`}>
                        {estadoInfo.label}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
