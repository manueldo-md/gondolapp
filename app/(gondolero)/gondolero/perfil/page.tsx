import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { tiempoRelativo, formatearPuntos, calcularPorcentaje } from '@/lib/utils'
import type { NivelGondolero } from '@/types'
import { CanjeCatalogo } from './canje-catalogo'
import { LogoutButton } from './logout-button'

// ── Constantes de nivel ───────────────────────────────────────────────────────

const NIVEL_UMBRAL: Record<NivelGondolero, number | null> = {
  casual: 50,
  activo: 150,
  pro:    null,
}

const NIVEL_COLOR: Record<NivelGondolero, string> = {
  casual: 'bg-gray-100 text-gray-600',
  activo: 'bg-blue-100 text-blue-700',
  pro:    'bg-amber-100 text-amber-700',
}

const NIVEL_LABEL: Record<NivelGondolero, string> = {
  casual: 'Casual',
  activo: 'Activo',
  pro:    'Pro',
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Perfil completo
  const { data: profile } = await admin
    .from('profiles')
    .select('nombre, alias, nivel, puntos_disponibles, puntos_totales_ganados, tasa_aprobacion, distri_id')
    .eq('id', user.id)
    .single()

  // 2. Últimos 20 movimientos
  const { data: movimientos } = await admin
    .from('movimientos_puntos')
    .select('id, tipo, monto, concepto, created_at')
    .eq('gondolero_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  // 3. Canjes pendientes con fecha
  const { data: canjesPendientes } = await admin
    .from('canjes')
    .select('id, premio, puntos, estado, created_at')
    .eq('gondolero_id', user.id)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })

  // 4. Fotos aprobadas (live, no cache en profile)
  const { count: fotosAprobadasCount } = await admin
    .from('fotos')
    .select('*', { count: 'exact', head: true })
    .eq('gondolero_id', user.id)
    .eq('estado', 'aprobada')

  // 5. Campañas completadas (live)
  const { count: campanasCompletadas } = await admin
    .from('participaciones')
    .select('*', { count: 'exact', head: true })
    .eq('gondolero_id', user.id)
    .eq('estado', 'completada')

  // 6. Comercios visitados (distinct comercio_id en fotos aprobadas)
  const { data: comerciosData } = await admin
    .from('fotos')
    .select('comercio_id')
    .eq('gondolero_id', user.id)
    .eq('estado', 'aprobada')

  const comerciosVisitados = new Set(
    (comerciosData ?? []).map((f: { comercio_id: string | null }) => f.comercio_id).filter(Boolean)
  ).size

  // 7. Nombre de distribuidora si está vinculado
  let distriNombre: string | null = null
  if (profile?.distri_id) {
    const { data: distri } = await admin
      .from('distribuidoras')
      .select('razon_social')
      .eq('id', profile.distri_id)
      .single()
    distriNombre = distri?.razon_social ?? null
  }

  const nivel = (profile?.nivel ?? 'casual') as NivelGondolero
  const fotosAprobadas = fotosAprobadasCount ?? 0
  const puntosDisponibles = profile?.puntos_disponibles ?? 0
  const nombre = profile?.nombre ?? 'Gondolero'
  const inicial = nombre.charAt(0).toUpperCase()

  // Progreso hacia el siguiente nivel
  const umbralSiguiente = NIVEL_UMBRAL[nivel]
  const umbralAnterior: Record<NivelGondolero, number> = { casual: 0, activo: 50, pro: 150 }
  const base = umbralAnterior[nivel]
  const progreso = umbralSiguiente
    ? calcularPorcentaje(fotosAprobadas - base, umbralSiguiente - base)
    : 100
  const fotasParaSiguiente = umbralSiguiente ? Math.max(0, umbralSiguiente - fotosAprobadas) : 0

  const PREMIO_LABEL: Record<string, string> = {
    credito_celular: '🔋 Crédito celular',
    nafta_ypf:       '⛽ Nafta YPF',
    giftcard_ml:     '🎁 Gift Card ML',
    transferencia:   '🏦 Transferencia bancaria',
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* ── SECCIÓN 1 — Header / Avatar ──────────────────────────────────── */}
      <div className="bg-white px-4 pt-12 pb-6 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gondo-verde-400 flex items-center justify-center shrink-0">
            <span className="text-white text-2xl font-bold">{inicial}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900 truncate">{nombre}</h1>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${NIVEL_COLOR[nivel]}`}>
                {NIVEL_LABEL[nivel]}
              </span>
            </div>
            {profile?.alias && (
              <p className="text-sm text-gray-400">@{profile.alias}</p>
            )}
            {distriNombre && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">🚛 {distriNombre}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4 mt-4">

        {/* ── SECCIÓN 2 — Puntos destacados ────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Puntos disponibles</p>
          <p className="text-4xl font-bold text-gondo-verde-400 mb-0.5">
            {formatearPuntos(puntosDisponibles)}
          </p>
          <p className="text-sm text-gray-400">
            {formatearPuntos(profile?.puntos_totales_ganados ?? 0)} puntos ganados en total
          </p>

          {/* Barra de progreso */}
          {umbralSiguiente ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>{NIVEL_LABEL[nivel]}</span>
                <span>
                  {nivel === 'casual' ? 'Activo' : 'Pro'} —{' '}
                  {fotasParaSiguiente > 0
                    ? `${fotasParaSiguiente} fotos para el siguiente nivel`
                    : '¡Nivel alcanzado!'
                  }
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gondo-verde-400 rounded-full transition-all"
                  style={{ width: `${progreso}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-600 font-medium mt-3">
              ⭐ Nivel máximo alcanzado
            </p>
          )}
        </div>

        {/* ── SECCIÓN 3 — Estadísticas 2×2 ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{fotosAprobadas}</p>
            <p className="text-[11px] text-gray-500 mt-1 leading-tight">Fotos aprobadas</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">
              {Math.round(profile?.tasa_aprobacion ?? 0)}%
            </p>
            <p className="text-[11px] text-gray-500 mt-1 leading-tight">Tasa de aprobación</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{campanasCompletadas ?? 0}</p>
            <p className="text-[11px] text-gray-500 mt-1 leading-tight">Campañas completadas</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{comerciosVisitados}</p>
            <p className="text-[11px] text-gray-500 mt-1 leading-tight">Comercios visitados</p>
          </div>
        </div>

        {/* ── SECCIÓN 4 — Catálogo de canjes ───────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Canjear puntos</h2>
          <CanjeCatalogo puntosDisponibles={puntosDisponibles} nivel={nivel} />
        </div>

        {/* ── SECCIÓN 5 — Historial de movimientos ─────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Últimos movimientos</h2>
          {(movimientos?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Todavía no hay movimientos.
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">
              {(movimientos ?? []).map((m: {
                id: string
                tipo: string
                monto: number
                concepto: string | null
                created_at: string
              }) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Ícono dirección */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    m.tipo === 'credito' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {m.tipo === 'credito'
                      ? <ArrowUp size={14} className="text-gondo-verde-400" />
                      : <ArrowDown size={14} className="text-red-500" />
                    }
                  </div>
                  {/* Concepto y fecha */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{m.concepto ?? 'Movimiento'}</p>
                    <p className="text-xs text-gray-400">{tiempoRelativo(m.created_at)}</p>
                  </div>
                  {/* Monto */}
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

        {/* ── SECCIÓN 6 — Canjes pendientes ────────────────────────────────── */}
        {(canjesPendientes?.length ?? 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              Tenés {canjesPendientes!.length} canje{canjesPendientes!.length !== 1 ? 's' : ''} en proceso
            </p>
            <p className="text-xs text-amber-600 mb-3">El equipo lo procesa en 48hs hábiles.</p>
            <div className="space-y-2">
              {canjesPendientes!.map(c => (
                <div key={c.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-800 font-medium">
                      {PREMIO_LABEL[String(c.premio)] ?? String(c.premio).replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-400">{tiempoRelativo(c.created_at)}</p>
                  </div>
                  <span className="text-sm text-amber-700 font-bold shrink-0">
                    {(c.puntos as number).toLocaleString('es-AR')} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECCIÓN 7 — Footer ───────────────────────────────────────────── */}
        <div className="space-y-3 pt-2">
          <LogoutButton />
          <p className="text-center text-[11px] text-gray-300">GondolApp v1.0</p>
        </div>

      </div>
    </div>
  )
}
