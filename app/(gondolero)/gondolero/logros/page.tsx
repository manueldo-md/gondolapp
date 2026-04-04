import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { calcularPorcentaje } from '@/lib/utils'
import type { NivelGondolero } from '@/types'
import { getConfig } from '@/lib/config'
import { CanjeCatalogo } from '../perfil/canje-catalogo'
import { LogrosYRanking, type LogroUI, type RankingEntry } from '../actividad/logros-y-ranking'
import { MarcarLogrosVistos } from './marcar-vistos'

// ── Helpers de nivel ──────────────────────────────────────────────────────────

const NIVEL_EMOJI: Record<NivelGondolero, string> = {
  casual: '🌱',
  activo: '⚡',
  pro:    '🏆',
}
const NIVEL_LABEL: Record<NivelGondolero, string> = {
  casual: 'Casual',
  activo: 'Activo',
  pro:    'Pro',
}
const NIVEL_COLOR_BG: Record<NivelGondolero, string> = {
  casual: 'bg-gray-100 text-gray-600 border-gray-200',
  activo: 'bg-gondo-indigo-50 text-gondo-indigo-600 border-gondo-indigo-100',
  pro:    'bg-amber-50 text-amber-600 border-amber-200',
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

export default async function LogrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const mesLabel = `${MESES_ES[ahora.getMonth()]} ${ahora.getFullYear()}`

  // ── FASE 1: queries independientes ────────────────────────────────────────
  const [
    profileRes,
    fotosRes,
    campanasRes,
    comerciosRes,
    config,
    fotosEsteMesRes,
    misZonasRes,
    todosLogrosRes,
    gondoleroLogrosRes,
  ] = await Promise.all([
    admin.from('profiles')
      .select('nivel, puntos_disponibles, puntos_totales_ganados, tasa_aprobacion, distri_id, alias, nombre')
      .eq('id', user.id)
      .single(),
    admin.from('fotos')
      .select('*', { count: 'exact', head: true })
      .eq('gondolero_id', user.id)
      .eq('estado', 'aprobada'),
    admin.from('participaciones')
      .select('*', { count: 'exact', head: true })
      .eq('gondolero_id', user.id)
      .eq('estado', 'completada'),
    admin.from('fotos')
      .select('comercio_id')
      .eq('gondolero_id', user.id)
      .eq('estado', 'aprobada'),
    getConfig(),
    admin.from('fotos')
      .select('gondolero_id')
      .eq('estado', 'aprobada')
      .gte('created_at', inicioMes.toISOString()),
    admin.from('gondolero_zonas')
      .select('zona_id')
      .eq('gondolero_id', user.id),
    admin.from('logros')
      .select('clave, nombre, descripcion, emoji')
      .order('created_at', { ascending: true }),
    admin.from('gondolero_logros')
      .select('logro_clave, frase_mostrada, desbloqueado_at, visto')
      .eq('gondolero_id', user.id),
  ])

  const profile = profileRes.data as {
    nivel: NivelGondolero
    puntos_disponibles: number
    puntos_totales_ganados: number
    tasa_aprobacion: number
    distri_id: string | null
    alias: string | null
    nombre: string | null
  } | null

  const fotosAprobadas    = fotosRes.count ?? 0
  const campanasCompletadas = campanasRes.count ?? 0
  const comerciosVisitados  = new Set(
    (comerciosRes.data ?? []).map((f: { comercio_id: string | null }) => f.comercio_id).filter(Boolean)
  ).size

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

  const inicial = (profile?.alias ?? profile?.nombre ?? 'G').charAt(0).toUpperCase()
  const nombreMostrar = profile?.alias ?? profile?.nombre ?? 'Gondolero'

  // ── FASE 2: Ranking ───────────────────────────────────────────────────────
  const misZonaIds = (misZonasRes.data ?? []).map((z: { zona_id: string }) => z.zona_id)
  const miDistriId = profile?.distri_id ?? null

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
      ? admin.from('gondolero_zonas').select('gondolero_id').in('zona_id', misZonaIds)
      : Promise.resolve({ data: [] }),
    misZonaIds.length > 0
      ? admin.from('zonas').select('id, tipo').in('id', misZonaIds)
      : Promise.resolve({ data: [] }),
  ])

  const misProvincias = (zonasDataRes.data ?? [])
    .filter((z: { tipo: string }) => z.tipo === 'provincia')
    .map((z: { id: string }) => z.id)

  const provColegasRes = misProvincias.length > 0
    ? await admin.from('gondolero_zonas').select('gondolero_id').in('zona_id', misProvincias)
    : { data: [] }

  type PerfilRanking = { id: string; alias: string | null; nivel: NivelGondolero; distri_id: string | null }
  const perfiles = (perfilesRankingRes.data ?? []) as PerfilRanking[]

  const buildRanking = (lista: PerfilRanking[]): RankingEntry[] =>
    lista
      .map(p => ({
        gondolero_id:   p.id,
        alias:          p.alias ?? 'Gondolero',
        nivel:          p.nivel,
        fotos_este_mes: conteoPorGondolero.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.fotos_este_mes - a.fotos_este_mes)
      .slice(0, 10)
      .map((e, i) => ({ ...e, posicion: i + 1 }))

  const getPosicion = (lista: PerfilRanking[]): number | null => {
    const sorted = lista
      .map(p => ({ id: p.id, fotos: conteoPorGondolero.get(p.id) ?? 0 }))
      .sort((a, b) => b.fotos - a.fotos)
    const idx = sorted.findIndex(e => e.id === user.id)
    return idx >= 0 ? idx + 1 : null
  }

  const perfilesDistri = miDistriId ? perfiles.filter(p => p.distri_id === miDistriId) : []
  const zonaIds2       = new Set((zonaColegasRes.data ?? []).map((z: { gondolero_id: string }) => z.gondolero_id))
  const perfilesZona   = perfiles.filter(p => zonaIds2.has(p.id))
  const provIds        = new Set((provColegasRes.data ?? []).map((z: { gondolero_id: string }) => z.gondolero_id))
  const perfilesProv   = perfiles.filter(p => provIds.has(p.id))

  const rankings = {
    nacional:  buildRanking(perfiles),
    distri:    buildRanking(perfilesDistri),
    zona:      buildRanking(perfilesZona),
    provincia: buildRanking(perfilesProv),
  }
  const misPosiciones = {
    nacional:  getPosicion(perfiles),
    distri:    miDistriId ? getPosicion(perfilesDistri) : null,
    zona:      misZonaIds.length > 0 ? getPosicion(perfilesZona) : null,
    provincia: misProvincias.length > 0 ? getPosicion(perfilesProv) : null,
  }

  // ── Logros UI ─────────────────────────────────────────────────────────────
  const logrosDesbloqueados = new Map(
    (gondoleroLogrosRes.data ?? []).map((l: {
      logro_clave: string; frase_mostrada: string | null; desbloqueado_at: string | null; visto: boolean
    }) => [l.logro_clave, { frase: l.frase_mostrada, at: l.desbloqueado_at, visto: l.visto }])
  )

  const logrosUI: LogroUI[] = (todosLogrosRes.data ?? []).map((l: {
    clave: string; nombre: string; descripcion: string; emoji: string
  }) => {
    const d = logrosDesbloqueados.get(l.clave)
    return {
      clave:           l.clave,
      nombre:          l.nombre,
      descripcion:     l.descripcion,
      emoji:           l.emoji,
      desbloqueado:    !!d,
      frase:           d?.frase ?? null,
      desbloqueado_at: d?.at ?? null,
    }
  })

  const hayNoVistos = [...logrosDesbloqueados.values()].some(d => !d.visto)

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Marcar logros como vistos al entrar */}
      <MarcarLogrosVistos gondoleroId={user.id} hayNoVistos={hayNoVistos} />

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Logros</h1>
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">

        {/* ── SECCIÓN 1 — Perfil + Nivel + Puntos ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-4 mb-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gondo-verde-400 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-white">{inicial}</span>
            </div>
            {/* Nombre + nivel */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-base truncate">{nombreMostrar}</p>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border mt-1 ${NIVEL_COLOR_BG[nivel]}`}>
                {NIVEL_EMOJI[nivel]} {NIVEL_LABEL[nivel]}
              </span>
            </div>
          </div>

          {/* Puntos */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
              Puntos disponibles
            </p>
            <p className="text-4xl font-bold text-gondo-verde-400">
              {puntosDisponibles.toLocaleString('es-AR')}
            </p>
          </div>

          {/* Barra de progreso */}
          {umbralSiguiente ? (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span className="font-medium">{NIVEL_LABEL[nivel]}</span>
                <span>
                  {NIVEL_SIGUIENTE[nivel]} —{' '}
                  {fotasParaSiguiente > 0
                    ? `${fotasParaSiguiente} fotos para el siguiente nivel`
                    : '¡Nivel alcanzado!'
                  }
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gondo-verde-400 rounded-full transition-all"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>{base}</span>
                <span>{umbralSiguiente} fotos</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-600 font-semibold">⭐ Nivel máximo alcanzado</p>
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

        {/* ── SECCIONES 3 + 4 — Logros + Ranking ── */}
        <LogrosYRanking
          logros={logrosUI}
          rankings={rankings}
          misPosiciones={misPosiciones}
          gondoleroId={user.id}
          mesLabel={mesLabel}
          hayDistri={!!miDistriId}
          hayZona={misZonaIds.length > 0}
          hayProvincia={misProvincias.length > 0}
        />

        {/* ── SECCIÓN 5 — Canjear puntos ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Canjear puntos</h2>
          <CanjeCatalogo puntosDisponibles={puntosDisponibles} nivel={nivel} />
        </div>

      </div>
    </div>
  )
}
