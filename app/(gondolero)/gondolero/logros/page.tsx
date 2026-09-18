import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import type { NivelGondolero } from '@/types'
import { getConfig } from '@/lib/config'
import { aliasAnonimo } from '@/lib/aliases'
import { obtenerPuntosRetenidos } from '@/lib/puntos-retenidos'
import { PuntosEnCamino } from '@/components/gondolero/puntos-en-camino'
import {
  contarMisionesAprobadasDelMes,
  nivelPorMisiones,
  misionesParaSiguienteNivel,
} from '@/lib/nivel-mensual'
import { mejorMesDeMisiones, nivelDeMejorMes } from '@/lib/nivel-maximo'
import { getDistrisDeGondolero } from '@/lib/utils-distri'
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
const NIVEL_SIGUIENTE_LABEL: Record<NivelGondolero, string> = {
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
    misionesDelMes,
    misZonasRes,
    todosLogrosRes,
    gondoleroLogrosRes,
    retenidos,
    mejorMes,
  ] = await Promise.all([
    admin.from('profiles')
      // `distri_id` salió de acá el 18/9/2026: el ranking de la distri ahora se
      // arma con getDistrisDeGondolero. Una columna que queda en un select y no
      // usa nadie es exactamente lo que dejó el perfil del gondolero sin datos
      // cuando se dropeó `nivel`.
      // `codigo_gondolero` lo usa el vacío del ranking: sin distribuidora, pasar
      // el código es lo único que el gondolero puede hacer para conseguir una.
      .select('puntos_disponibles, puntos_totales_ganados, tasa_aprobacion, alias, nombre, codigo_gondolero')
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
    // El nivel y el ranking cuentan MISIONES aprobadas del mes, no fotos: una
    // campaña de solo preguntas también es trabajo. Ver lib/nivel-mensual.ts.
    contarMisionesAprobadasDelMes(admin, ahora),
    admin.from('gondolero_zonas')
      .select('zona_id')
      .eq('gondolero_id', user.id),
    admin.from('logros')
      .select('clave, nombre, descripcion, emoji')
      .order('created_at', { ascending: true }),
    admin.from('gondolero_logros')
      .select('logro_clave, frase_mostrada, desbloqueado_at, visto')
      .eq('gondolero_id', user.id),
    // Entra en el Promise.all y no en un await aparte: es una consulta más, no
    // un round-trip más.
    obtenerPuntosRetenidos(user.id, admin),
    // El catálogo de canjes es un GATE, no una insignia: la transferencia la
    // habilita el MÁXIMO alcanzado, no el nivel del mes. Ver lib/nivel-maximo.ts.
    mejorMesDeMisiones(user.id, admin),
  ])

  const profile = profileRes.data as {
    puntos_disponibles: number
    puntos_totales_ganados: number
    tasa_aprobacion: number
    alias: string | null
    nombre: string | null
    codigo_gondolero: string | null
  } | null

  const fotosAprobadas    = fotosRes.count ?? 0
  const campanasCompletadas = campanasRes.count ?? 0
  const comerciosVisitados  = new Set(
    (comerciosRes.data ?? []).map((f: { comercio_id: string | null }) => f.comercio_id).filter(Boolean)
  ).size

  // ── Nivel dinámico (fotos aprobadas del mes en curso — fuente de verdad única) ──
  const puntosDisponibles  = profile?.puntos_disponibles ?? 0
  const fotosCasualAActivo = config.niveles.fotosCasualAActivo
  const fotosActivoAPro    = config.niveles.fotosActivoAPro

  // El nivel cuenta MISIONES aprobadas del mes, no fotos.
  //
  // Con fotos, una campaña de solo preguntas pagaba puntos y no sumaba nada a la
  // progresión — un efecto de dónde había quedado el gancho, no una decisión.
  // Una misión cumplida es una misión cumplida.
  const misionesEsteMes = misionesDelMes.get(user.id) ?? 0

  const nivel: NivelGondolero = nivelPorMisiones(
    misionesEsteMes,
    fotosCasualAActivo,
    fotosActivoAPro,
  )

  // El nivel que habilita el canje de transferencia NO es este: es el máximo
  // alcanzado. Si el catálogo escondiera la transferencia según el mes, un Pro
  // que aflojó vería bloqueado un premio que la action sí le concede — la
  // pantalla y el gate diciendo cosas distintas. Ver lib/nivel-maximo.ts.
  const nivelParaCanje = nivelDeMejorMes(mejorMes, {
    activo: fotosCasualAActivo,
    pro:    fotosActivoAPro,
  })

  // ── Progreso de 3 nodos ───────────────────────────────────────────────────
  const faltanParaSiguiente = misionesParaSiguienteNivel(
    misionesEsteMes, nivel, fotosCasualAActivo, fotosActivoAPro,
  )

  // Porcentaje de cada segmento de la barra lineal
  const linea1Pct = nivel === 'casual'
    ? Math.min(100, Math.round((misionesEsteMes / fotosCasualAActivo) * 100))
    : 100

  const linea2Pct = nivel === 'casual'
    ? 0
    : nivel === 'activo'
      ? Math.min(100, Math.round(
          ((misionesEsteMes - fotosCasualAActivo) / (fotosActivoAPro - fotosCasualAActivo)) * 100
        ))
      : 100

  // Label debajo de cada línea
  const linea1Label = nivel === 'casual'
    ? `${misionesEsteMes}/${fotosCasualAActivo}`
    : '✓'
  const linea2Label = nivel === 'activo'
    ? `${misionesEsteMes - fotosCasualAActivo}/${fotosActivoAPro - fotosCasualAActivo}`
    : nivel === 'pro'
      ? '✓'
      : `0/${fotosActivoAPro - fotosCasualAActivo}`

  const inicial = (profile?.alias ?? profile?.nombre ?? 'G').charAt(0).toUpperCase()
  const nombreMostrar = profile?.alias ?? profile?.nombre ?? 'Gondolero'

  // ── FASE 2: Ranking ───────────────────────────────────────────────────────
  const misZonaIds = (misZonasRes.data ?? []).map((z: { zona_id: string }) => z.zona_id)

  // El ranking usa el mismo conteo que el nivel: si ordenara por fotos y la
  // insignia saliera de misiones, la fila mostraría dos medidas que no cuadran.
  const todosIds = [...misionesDelMes.keys()]

  // Las distribuidoras del gondolero salen de los vínculos, no de
  // profiles.distri_id: esa columna guarda UNA sola, así que al que trabaja para
  // dos le escondía el ranking de la segunda. Ver lib/utils-distri.ts.
  const misDistriIds = await getDistrisDeGondolero(user.id, admin)

  const [perfilesRankingRes, zonaColegasRes, zonasDataRes, vinculosRes, distrisRes] = await Promise.all([
    todosIds.length > 0
      ? admin.from('profiles')
          .select('id, alias')
          .in('id', todosIds)
          .eq('tipo_actor', 'gondolero')
      : Promise.resolve({ data: [] }),
    misZonaIds.length > 0
      ? admin.from('gondolero_zonas').select('gondolero_id').in('zona_id', misZonaIds)
      : Promise.resolve({ data: [] }),
    misZonaIds.length > 0
      ? admin.from('zonas').select('id, tipo').in('id', misZonaIds)
      : Promise.resolve({ data: [] }),
    // A qué distribuidoras pertenece cada gondolero del ranking. Antes salía de
    // `profiles.distri_id`, que traía una sola: un colega vinculado a dos
    // aparecía en el ranking de una y faltaba en el de la otra.
    todosIds.length > 0 && misDistriIds.length > 0
      ? admin.from('gondolero_distri_solicitudes')
          .select('gondolero_id, distri_id')
          .in('gondolero_id', todosIds)
          .in('distri_id', misDistriIds)
          .eq('estado', 'aprobada')
      : Promise.resolve({ data: [] }),
    misDistriIds.length > 0
      ? admin.from('distribuidoras').select('id, razon_social').in('id', misDistriIds)
      : Promise.resolve({ data: [] }),
  ])

  const misProvincias = (zonasDataRes.data ?? [])
    .filter((z: { tipo: string }) => z.tipo === 'provincia')
    .map((z: { id: string }) => z.id)

  const provColegasRes = misProvincias.length > 0
    ? await admin.from('gondolero_zonas').select('gondolero_id').in('zona_id', misProvincias)
    : { data: [] }

  type PerfilRanking = { id: string; alias: string | null }
  const perfiles = (perfilesRankingRes.data ?? []) as PerfilRanking[]

  const buildRanking = (lista: PerfilRanking[]): RankingEntry[] =>
    lista
      .map(p => {
        const misionesMes = misionesDelMes.get(p.id) ?? 0
        return {
          gondolero_id:   p.id,
          // Sin alias NO se cae al nombre real: esta pantalla la ven otros
          // gondoleros y el alias existe justamente para eso. Ver aliasAnonimo.
          alias:          p.alias ?? aliasAnonimo(p.id),
          nivel:             nivelPorMisiones(misionesMes, fotosCasualAActivo, fotosActivoAPro),
          misiones_este_mes: misionesMes,
        }
      })
      .sort((a, b) => b.misiones_este_mes - a.misiones_este_mes)
      .slice(0, 10)
      .map((e, i) => ({ ...e, posicion: i + 1 }))

  const getPosicion = (lista: PerfilRanking[]): number | null => {
    const sorted = lista
      .map(p => ({ id: p.id, misiones: misionesDelMes.get(p.id) ?? 0 }))
      .sort((a, b) => b.misiones - a.misiones)
    const idx = sorted.findIndex(e => e.id === user.id)
    return idx >= 0 ? idx + 1 : null
  }

  // Un ranking por cada distribuidora del gondolero. Los colegas de cada una
  // salen de los vínculos aprobados, así que alguien que trabaja para dos
  // aparece en los dos rankings — que es exactamente lo que corresponde.
  const colegasPorDistri = new Map<string, Set<string>>()
  for (const v of (vinculosRes.data ?? []) as { gondolero_id: string; distri_id: string }[]) {
    if (!colegasPorDistri.has(v.distri_id)) colegasPorDistri.set(v.distri_id, new Set())
    colegasPorDistri.get(v.distri_id)!.add(v.gondolero_id)
  }
  const nombreDistri = new Map(
    ((distrisRes.data ?? []) as { id: string; razon_social: string | null }[])
      .map(d => [d.id, d.razon_social ?? 'Mi distribuidora'])
  )

  const rankingsDistri = misDistriIds.map(distriId => {
    const colegas = colegasPorDistri.get(distriId) ?? new Set<string>()
    const lista   = perfiles.filter(p => colegas.has(p.id))
    return {
      distriId,
      nombre:     nombreDistri.get(distriId) ?? 'Mi distribuidora',
      entries:    buildRanking(lista),
      miPosicion: getPosicion(lista),
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const zonaIds2       = new Set((zonaColegasRes.data ?? []).map((z: { gondolero_id: string }) => z.gondolero_id))
  const perfilesZona   = perfiles.filter(p => zonaIds2.has(p.id))
  const provIds        = new Set((provColegasRes.data ?? []).map((z: { gondolero_id: string }) => z.gondolero_id))
  const perfilesProv   = perfiles.filter(p => provIds.has(p.id))

  const rankings = {
    nacional:  buildRanking(perfiles),
    distris:   rankingsDistri,
    zona:      buildRanking(perfilesZona),
    provincia: buildRanking(perfilesProv),
  }
  const misPosiciones = {
    nacional:  getPosicion(perfiles),
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
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
              Puntos disponibles
            </p>
            <p className="text-4xl font-bold text-gondo-verde-400">
              {puntosDisponibles.toLocaleString('es-AR')}
            </p>

            {/* Lo que ganó y todavía no puede canjear, justo debajo del saldo:
                es la pregunta que sigue a "cuántos tengo". No se renderiza nada
                si no hay puntos en camino. */}
            <div className="mt-3">
              <PuntosEnCamino resumen={retenidos} />
            </div>
          </div>

          {/* ── Barra de progreso lineal con 3 nodos ── */}
          <div>
            <div className="flex items-start">

              {/* Nodo 1: Casual */}
              <div className="flex flex-col items-center shrink-0 w-10">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base border-2 ${
                  nivel === 'casual'
                    ? 'bg-gondo-verde-400 border-gondo-verde-400 text-white animate-pulse'
                    : 'bg-gondo-verde-400 border-gondo-verde-400 text-white'
                }`}>
                  {nivel === 'casual' ? '🌱' : '✓'}
                </div>
                <span className="text-[10px] font-semibold text-gray-500 mt-1 text-center leading-tight">Casual</span>
              </div>

              {/* Línea 1 */}
              <div className="flex-1 flex flex-col justify-start pt-[17px] px-1">
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gondo-verde-400 rounded-full transition-all duration-500"
                    style={{ width: `${linea1Pct}%` }}
                  />
                </div>
                <span className={`text-[10px] mt-0.5 text-center font-medium ${linea1Pct === 100 ? 'text-gondo-verde-600' : 'text-gray-400'}`}>
                  {linea1Label}
                </span>
              </div>

              {/* Nodo 2: Activo */}
              <div className="flex flex-col items-center shrink-0 w-10">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base border-2 ${
                  nivel === 'activo'
                    ? 'bg-gondo-verde-400 border-gondo-verde-400 text-white animate-pulse'
                    : nivel === 'pro'
                      ? 'bg-gondo-verde-400 border-gondo-verde-400 text-white'
                      : 'bg-gray-100 border-gray-200 text-gray-400'
                }`}>
                  {nivel === 'activo' ? '⚡' : nivel === 'pro' ? '✓' : '⚡'}
                </div>
                <span className={`text-[10px] font-semibold mt-1 text-center leading-tight ${nivel !== 'casual' ? 'text-gray-700' : 'text-gray-400'}`}>
                  Activo
                </span>
              </div>

              {/* Línea 2 */}
              <div className="flex-1 flex flex-col justify-start pt-[17px] px-1">
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gondo-verde-400 rounded-full transition-all duration-500"
                    style={{ width: `${linea2Pct}%` }}
                  />
                </div>
                <span className={`text-[10px] mt-0.5 text-center font-medium ${linea2Pct === 100 ? 'text-gondo-verde-600' : 'text-gray-400'}`}>
                  {linea2Label}
                </span>
              </div>

              {/* Nodo 3: Pro */}
              <div className="flex flex-col items-center shrink-0 w-10">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base border-2 ${
                  nivel === 'pro'
                    ? 'bg-amber-400 border-amber-400 text-white animate-pulse'
                    : 'bg-gray-100 border-gray-200 text-gray-400'
                }`}>
                  🏆
                </div>
                <span className={`text-[10px] font-semibold mt-1 text-center leading-tight ${nivel === 'pro' ? 'text-amber-600' : 'text-gray-400'}`}>
                  Pro
                </span>
              </div>

            </div>

            {/* Mensaje debajo */}
            <p className="text-xs text-center mt-3 font-medium text-gray-600">
              {nivel === 'casual' && (
                faltanParaSiguiente > 0
                  ? `Te ${faltanParaSiguiente === 1 ? 'falta' : 'faltan'} ${faltanParaSiguiente} ${faltanParaSiguiente === 1 ? 'misión' : 'misiones'} para llegar a ${NIVEL_SIGUIENTE_LABEL[nivel]}`
                  : `¡Nivel ${NIVEL_SIGUIENTE_LABEL[nivel]} alcanzado!`
              )}
              {nivel === 'activo' && (
                faltanParaSiguiente > 0
                  ? `Te ${faltanParaSiguiente === 1 ? 'falta' : 'faltan'} ${faltanParaSiguiente} ${faltanParaSiguiente === 1 ? 'misión' : 'misiones'} para llegar a Pro`
                  : '¡Nivel Pro alcanzado!'
              )}
              {nivel === 'pro' && (
                <span className="text-amber-600">¡Nivel máximo alcanzado! Sos una leyenda del canal. 🌟</span>
              )}
            </p>
          </div>
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
          hayZona={misZonaIds.length > 0}
          hayProvincia={misProvincias.length > 0}
          codigoGondolero={profile?.codigo_gondolero ?? null}
        />

        {/* ── SECCIÓN 5 — Canjear puntos ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Canjear puntos</h2>
          <CanjeCatalogo puntosDisponibles={puntosDisponibles} nivelParaCanje={nivelParaCanje} />
        </div>

      </div>
    </div>
  )
}
