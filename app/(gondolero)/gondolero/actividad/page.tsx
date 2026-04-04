import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BarChart2, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { tiempoRelativo, formatearPuntos, calcularPorcentaje } from '@/lib/utils'
import type { NivelGondolero } from '@/types'
import { CanjeCatalogo } from '../perfil/canje-catalogo'
import { MarcarNotificacionesLeidas } from '../perfil/marcar-leidas'
import { getConfig } from '@/lib/config'
import { LogrosYRanking, type LogroUI, type RankingEntry } from './logros-y-ranking'

const NIVEL_LABEL: Record<NivelGondolero, string> = {
  casual: 'Casual',
  activo: 'Activo',
  pro:    'Pro',
}
const NIVEL_SIGUIENTE: Record<NivelGondolero, string> = {
  casual: 'Activo',
  activo: 'Pro',
  pro:    '',
}

const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export default async function ActividadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Inicio del mes actual para ranking
  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const mesLabel = `${MESES_ES[ahora.getMonth()]} ${ahora.getFullYear()}`

  // ── FASE 1: todas las queries independientes en paralelo ──────────────────
  const [
    profileRes,
    movimientosRes,
    canjesPendientesRes,
    fotosRes,
    campanasRes,
    comerciosRes,
    notificacionesRes,
    fotosPendientesRes,
    config,
    fotosEsteMesRes,
    misZonasRes,
    todosLogrosRes,
    gondoleroLogrosRes,
  ] = await Promise.all([
    admin.from('profiles')
      .select('nivel, puntos_disponibles, puntos_totales_ganados, tasa_aprobacion, distri_id')
      .eq('id', user.id).single(),
    admin.from('movimientos_puntos')
      .select('id, tipo, monto, concepto, created_at')
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false }).limit(5),
    admin.from('canjes')
      .select('id, premio, puntos, estado, created_at')
      .eq('gondolero_id', user.id).eq('estado', 'pendiente')
      .order('created_at', { ascending: false }),
    admin.from('fotos')
      .select('*', { count: 'exact', head: true })
      .eq('gondolero_id', user.id).eq('estado', 'aprobada'),
    admin.from('participaciones')
      .select('*', { count: 'exact', head: true })
      .eq('gondolero_id', user.id).eq('estado', 'completada'),
    admin.from('fotos')
      .select('comercio_id')
      .eq('gondolero_id', user.id).eq('estado', 'aprobada'),
    admin.from('notificaciones')
      .select('id, tipo, titulo, mensaje, leida, created_at')
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false }).limit(3),
    admin.from('fotos')
      .select('id, created_at, comercio:comercios(nombre), campana:campanas(nombre)', { count: 'exact' })
      .eq('gondolero_id', user.id)
      .in('estado', ['pendiente', 'en_revision'])
      .order('created_at', { ascending: false })
      .limit(3),
    getConfig(),
    // Fotos aprobadas este mes (gondolero_id only — para ranking)
    admin.from('fotos')
      .select('gondolero_id')
      .eq('estado', 'aprobada')
      .gte('created_at', inicioMes.toISOString()),
    // Mis zonas
    admin.from('gondolero_zonas')
      .select('zona_id')
      .eq('gondolero_id', user.id),
    // Catálogo de logros
    admin.from('logros')
      .select('clave, nombre, descripcion, emoji')
      .order('created_at', { ascending: true }),
    // Logros desbloqueados por el gondolero
    admin.from('gondolero_logros')
      .select('logro_clave, frase_mostrada, desbloqueado_at')
      .eq('gondolero_id', user.id),
  ])

  const profile = profileRes.data as {
    nivel: NivelGondolero
    puntos_disponibles: number
    puntos_totales_ganados: number
    tasa_aprobacion: number
    distri_id: string | null
  } | null

  const movimientos = movimientosRes.data ?? []
  const canjesPendientes = canjesPendientesRes.data ?? []
  const fotosAprobadas = fotosRes.count ?? 0
  const fotosPendientesTotal = fotosPendientesRes.count ?? 0
  const fotosPendientesPreview = (fotosPendientesRes.data ?? []) as unknown as {
    id: string; created_at: string
    comercio: { nombre: string } | null; campana: { nombre: string } | null
  }[]
  const campanasCompletadas = campanasRes.count ?? 0
  const comerciosVisitados = new Set(
    (comerciosRes.data ?? []).map((f: { comercio_id: string | null }) => f.comercio_id).filter(Boolean)
  ).size
  const notificaciones = notificacionesRes.data ?? []
  const hayNoLeidas = notificaciones.some((n: { leida: boolean }) => !n.leida)

  // ── Nivel y progreso ──────────────────────────────────────────────────────
  const nivel = (profile?.nivel ?? 'casual') as NivelGondolero
  const puntosDisponibles = profile?.puntos_disponibles ?? 0

  const fotosCasualAActivo = config.niveles.fotosCasualAActivo
  const fotosActivoAPro    = config.niveles.fotosActivoAPro

  const NIVEL_UMBRAL: Record<NivelGondolero, number | null> = {
    casual: fotosCasualAActivo,
    activo: fotosActivoAPro,
    pro:    null,
  }
  const umbralAnterior: Record<NivelGondolero, number> = {
    casual: 0,
    activo: fotosCasualAActivo,
    pro:    fotosActivoAPro,
  }

  const umbralSiguiente = NIVEL_UMBRAL[nivel]
  const base = umbralAnterior[nivel]
  const progreso = umbralSiguiente
    ? calcularPorcentaje(fotosAprobadas - base, umbralSiguiente - base)
    : 100
  const fotasParaSiguiente = umbralSiguiente ? Math.max(0, umbralSiguiente - fotosAprobadas) : 0

  // ── FASE 2: Ranking — queries dependientes de fase 1 ─────────────────────
  const misZonaIds = (misZonasRes.data ?? []).map((z: { zona_id: string }) => z.zona_id)
  const miDistriId = profile?.distri_id ?? null

  // Agrupar fotos este mes por gondolero
  const conteoPorGondolero = new Map<string, number>()
  for (const f of fotosEsteMesRes.data ?? []) {
    const id = (f as { gondolero_id: string }).gondolero_id
    conteoPorGondolero.set(id, (conteoPorGondolero.get(id) ?? 0) + 1)
  }
  const todosIds = [...conteoPorGondolero.keys()]

  const [perfilesRankingRes, zonaColegasRes, zonasDataRes] = await Promise.all([
    todosIds.length > 0
      ? admin.from('profiles')
          .select('id, alias, nivel, distri_id')
          .in('id', todosIds)
          .eq('tipo_actor', 'gondolero')
      : Promise.resolve({ data: [] }),
    misZonaIds.length > 0
      ? admin.from('gondolero_zonas')
          .select('gondolero_id')
          .in('zona_id', misZonaIds)
      : Promise.resolve({ data: [] }),
    misZonaIds.length > 0
      ? admin.from('zonas').select('id, tipo').in('id', misZonaIds)
      : Promise.resolve({ data: [] }),
  ])

  // FASE 3: colegas por provincia (si el usuario tiene zonas tipo='provincia')
  const misProvincias = (zonasDataRes.data ?? [])
    .filter((z: { tipo: string }) => z.tipo === 'provincia')
    .map((z: { id: string }) => z.id)

  const provColegasRes = misProvincias.length > 0
    ? await admin.from('gondolero_zonas')
        .select('gondolero_id')
        .in('zona_id', misProvincias)
    : { data: [] }

  // ── Construir rankings ──────────────────────────────────────────────────
  type PerfilRanking = { id: string; alias: string | null; nivel: NivelGondolero; distri_id: string | null }

  const perfiles = (perfilesRankingRes.data ?? []) as PerfilRanking[]

  const buildRanking = (lista: PerfilRanking[], limit = 10): RankingEntry[] =>
    lista
      .map(p => ({
        gondolero_id:  p.id,
        alias:         p.alias ?? 'Gondolero',
        nivel:         p.nivel,
        fotos_este_mes: conteoPorGondolero.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.fotos_este_mes - a.fotos_este_mes)
      .slice(0, limit)
      .map((e, i) => ({ ...e, posicion: i + 1 }))

  const getPosicion = (lista: PerfilRanking[]): number | null => {
    const sorted = lista
      .map(p => ({ id: p.id, fotos: conteoPorGondolero.get(p.id) ?? 0 }))
      .sort((a, b) => b.fotos - a.fotos)
    const idx = sorted.findIndex(e => e.id === user.id)
    return idx >= 0 ? idx + 1 : null
  }

  // Nacional
  const rankingNacional  = buildRanking(perfiles)
  const posNacional      = getPosicion(perfiles)

  // Mi Distri
  const perfilesDistri   = miDistriId ? perfiles.filter(p => p.distri_id === miDistriId) : []
  const rankingDistri    = buildRanking(perfilesDistri)
  const posDistri        = miDistriId ? getPosicion(perfilesDistri) : null

  // Mi Zona
  const zonaGondoleroIds = new Set(
    (zonaColegasRes.data ?? []).map((z: { gondolero_id: string }) => z.gondolero_id)
  )
  const perfilesZona     = perfiles.filter(p => zonaGondoleroIds.has(p.id))
  const rankingZona      = buildRanking(perfilesZona)
  const posZona          = misZonaIds.length ? getPosicion(perfilesZona) : null

  // Mi Provincia
  const provGondoleroIds = new Set(
    (provColegasRes.data ?? []).map((z: { gondolero_id: string }) => z.gondolero_id)
  )
  const perfilesProv     = perfiles.filter(p => provGondoleroIds.has(p.id))
  const rankingProvincia = buildRanking(perfilesProv)
  const posProvincia     = misProvincias.length ? getPosicion(perfilesProv) : null

  // ── Construir logros UI ───────────────────────────────────────────────────
  const logrosDesbloqueados = new Map<string, { frase: string | null; at: string | null }>(
    (gondoleroLogrosRes.data ?? []).map((l: {
      logro_clave: string; frase_mostrada: string | null; desbloqueado_at: string | null
    }) => [l.logro_clave, { frase: l.frase_mostrada, at: l.desbloqueado_at }])
  )

  const logrosUI: LogroUI[] = (todosLogrosRes.data ?? []).map((l: {
    clave: string; nombre: string; descripcion: string; emoji: string
  }) => {
    const desbloqueado = logrosDesbloqueados.get(l.clave)
    return {
      clave:           l.clave,
      nombre:          l.nombre,
      descripcion:     l.descripcion,
      emoji:           l.emoji,
      desbloqueado:    !!desbloqueado,
      frase:           desbloqueado?.frase ?? null,
      desbloqueado_at: desbloqueado?.at ?? null,
    }
  })

  const PREMIO_LABEL: Record<string, string> = {
    credito_celular: '🔋 Crédito celular',
    nafta_ypf:       '⛽ Nafta YPF',
    giftcard_ml:     '🎁 Gift Card ML',
    transferencia:   '🏦 Transferencia bancaria',
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Actividad</h1>
        </div>
      </div>

      {hayNoLeidas && <MarcarNotificacionesLeidas gondoleroId={user.id} />}

      <div className="px-4 space-y-4 pt-4">

        {/* ── SECCIÓN 1 — Puntos ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Puntos disponibles
          </p>
          <p className="text-4xl font-bold text-gondo-verde-400 mb-0.5">
            {formatearPuntos(puntosDisponibles)}
          </p>
          <p className="text-sm text-gray-400">
            {formatearPuntos(profile?.puntos_totales_ganados ?? 0)} puntos ganados en total
          </p>

          {umbralSiguiente ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>{NIVEL_LABEL[nivel]}</span>
                <span>
                  {NIVEL_SIGUIENTE[nivel]} —{' '}
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
            <p className="text-xs text-amber-600 font-medium mt-3">⭐ Nivel máximo alcanzado</p>
          )}
        </div>

        {/* ── SECCIÓN 2 — Estadísticas 2×2 ── */}
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
            <p className="text-3xl font-bold text-gray-900">{campanasCompletadas}</p>
            <p className="text-[11px] text-gray-500 mt-1 leading-tight">Campañas completadas</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{comerciosVisitados}</p>
            <p className="text-[11px] text-gray-500 mt-1 leading-tight">Comercios visitados</p>
          </div>
        </div>

        {/* ── SECCIÓN 3 — Logros + Ranking ── */}
        <LogrosYRanking
          logros={logrosUI}
          rankings={{
            nacional:  rankingNacional,
            distri:    rankingDistri,
            zona:      rankingZona,
            provincia: rankingProvincia,
          }}
          misPosiciones={{
            nacional:  posNacional,
            distri:    posDistri,
            zona:      posZona,
            provincia: posProvincia,
          }}
          gondoleroId={user.id}
          mesLabel={mesLabel}
          hayDistri={!!miDistriId}
          hayZona={misZonaIds.length > 0}
          hayProvincia={misProvincias.length > 0}
        />

        {/* ── SECCIÓN 4 — Canjear puntos ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Canjear puntos</h2>
          <CanjeCatalogo puntosDisponibles={puntosDisponibles} nivel={nivel} />
        </div>

        {/* Canjes pendientes */}
        {canjesPendientes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              Tenés {canjesPendientes.length} canje{canjesPendientes.length !== 1 ? 's' : ''} en proceso
            </p>
            <p className="text-xs text-amber-600 mb-3">El equipo lo procesa en 48hs hábiles.</p>
            <div className="space-y-2">
              {canjesPendientes.map((c: { id: string; premio: unknown; puntos: number; created_at: string }) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-800 font-medium">
                      {PREMIO_LABEL[String(c.premio)] ?? String(c.premio).replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-400">{tiempoRelativo(c.created_at)}</p>
                  </div>
                  <span className="text-sm text-amber-700 font-bold shrink-0">
                    {c.puntos.toLocaleString('es-AR')} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECCIÓN 5 — Notificaciones ── */}
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
            <div className="rounded-2xl overflow-hidden divide-y divide-gray-100">
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

        {/* ── SECCIÓN 5.5 — Fotos pendientes ── */}
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
                  <span className="text-amber-800 font-medium truncate mr-2">{f.comercio?.nombre ?? 'Comercio'}</span>
                  <span className="text-amber-600 shrink-0">{f.campana?.nombre ?? ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECCIÓN 6 — Últimos movimientos ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Últimos movimientos</h2>
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
            <p className="text-sm text-gray-400 text-center py-6">
              Todavía no hay movimientos.
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">
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

      </div>
    </div>
  )
}
