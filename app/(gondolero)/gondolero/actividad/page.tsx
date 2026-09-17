import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BarChart2, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { obtenerPuntosRetenidos } from '@/lib/puntos-retenidos'
import { PuntosEnCamino } from '@/components/gondolero/puntos-en-camino'

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
    movimientosRes,
    canjesRes,
    retenidos,
  ] = await Promise.all([
    admin.from('notificaciones')
      .select('id, tipo, titulo, mensaje, leida, created_at')
      .eq('gondolero_id', user.id)
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
    obtenerPuntosRetenidos(user.id, admin),
  ])

  const notificaciones    = notificacionesRes.data ?? []
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

        {/* ── Puntos en camino ──────────────────────────────────────────────
            Reemplaza al bloque de "N fotos en revisión" que estaba acá.

            Los dos hablaban del mismo hecho en unidades distintas y podían no
            cuadrar: una misión de tres fotos con dos aprobadas y una en revisión
            suma 1 foto pendiente pero retiene los puntos de la misión ENTERA. El
            gondolero veía "1 foto en revisión" y, dos centímetros más abajo, un
            saldo que no se movía, sin forma de relacionarlos.

            Y lo que le importa no es cuántas fotos están en revisión sino cuánta
            plata depende de eso. Va arriba de los movimientos a propósito: el
            bloque explica el saldo que la lista de abajo detalla. */}
        {retenidos.total > 0 && (
          <div>
            <PuntosEnCamino resumen={retenidos} />
            {/* El link a la lista de fotos en revisión venía en el bloque viejo
                y es la única entrada a esa página desde acá: se conserva. */}
            {retenidos.totalEsperandoAprobacion > 0 && (
              <Link
                href="/gondolero/actividad/pendientes"
                className="flex items-center justify-end gap-0.5 text-xs text-amber-700 font-medium mt-1.5 px-1"
              >
                Ver fotos en revisión <ChevronRight size={13} />
              </Link>
            )}
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
