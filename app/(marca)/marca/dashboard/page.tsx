import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { etiquetaVigencia } from '@/lib/campana-vigencia'
import {
  Megaphone, Store, TrendingUp, MapPin,
  Camera, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react'
import type { DashboardVisualizacionesProps } from './dashboard-visualizaciones'
import { formatearInstante } from '@/lib/fecha-ar'
import {
  armarPanel, resumenDe, formatearValor, textoPeriodo,
  type FilaSerie, type FilaVisitas,
} from '@/lib/panel-marca'

// ── Único dynamic import — recharts + leaflet NUNCA tocan el servidor ─────────
const DashboardVisualizaciones = dynamic(
  () => import('./dashboard-visualizaciones'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        {[420, 240, 240, 240, 220].map((h, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`bg-gray-100 animate-pulse rounded-lg`} style={{ height: h }} />
          </div>
        ))}
      </div>
    ),
  }
)

// ── Types internos ────────────────────────────────────────────────────────────

type FotoRow = {
  id: string
  campana_id: string
  comercio_id: string | null
  declaracion: 'producto_presente' | 'producto_no_encontrado' | 'solo_competencia' | null
  created_at: string
}

type ComercioRow = {
  id: string
  tipo: string | null
  localidad_id: number | null
  lat: number | null
  lng: number | null
}

type LocalidadRow = {
  id: number
  nombre: string
}

type CampanaRow = {
  id: string
  nombre: string
  estado: string
  fecha_fin: string | null
  fecha_inicio: string | null
}

// ── Helpers server-rendered (sin librerías de browser) ────────────────────────

function KpiCard({
  label, valor, icon: Icon, color, sub,
}: {
  label: string
  valor: number | string
  icon: React.ElementType
  color: string
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{valor}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── 1. marca_id ─────────────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  const marcaId: string | null = profile?.marca_id ?? null
  if (!marcaId) redirect('/auth')

  // ── 2. Campañas + la serie de métricas ───────────────────────────────────────
  // Los dos RPC solo necesitan el marca_id, así que van EN PARALELO con las
  // campañas en vez de sumarse a la cascada de abajo. La cascada geográfica
  // —fotos → comercios → localidades— queda para su propio tramo.
  const [campanasRes, serieRes, visitasRes] = await Promise.all([
    admin.from('campanas')
      .select('id, nombre, estado, fecha_fin, fecha_inicio')
      .eq('marca_id', marcaId),
    admin.rpc('panel_marca_series',  { _marca_id: marcaId }),
    admin.rpc('panel_marca_visitas', { _marca_id: marcaId }),
  ])

  const campanas: CampanaRow[] = campanasRes.data ?? []

  // supabase-js NO lanza ante un error de Postgres: lo devuelve en .error. Sin
  // este chequeo, un RPC caído daría `data: null` → panel vacío → "—", que es
  // indistinguible de "esta marca no mide nada". Prefiero el "—" igual, pero
  // con el error en el log de alguien.
  if (serieRes.error)  console.error('[dashboard marca] panel_marca_series:', serieRes.error.message)
  if (visitasRes.error) console.error('[dashboard marca] panel_marca_visitas:', visitasRes.error.message)

  const panel = armarPanel({
    series:  (serieRes.data  ?? []) as FilaSerie[],
    visitas: (visitasRes.data ?? []) as FilaVisitas[],
  })
  const presencia = resumenDe(panel.series.find(s => s.slug === 'presencia'))
  const campanaIds = campanas.map(c => c.id)
  const NULL_UUID  = '00000000-0000-0000-0000-000000000000'
  const safeIds    = campanaIds.length > 0 ? campanaIds : [NULL_UUID]

  // ── 3. Fotos aprobadas ───────────────────────────────────────────────────────
  const { data: fotosRaw } = await admin
    .from('fotos')
    .select('id, campana_id, comercio_id, declaracion, created_at')
    .in('campana_id', safeIds)
    .eq('estado', 'aprobada')

  const fotos: FotoRow[] = (fotosRaw ?? []) as FotoRow[]

  // ── 4. Comercios ─────────────────────────────────────────────────────────────
  const comercioIdsSet = new Set(fotos.map(f => f.comercio_id).filter(Boolean) as string[])
  const comercioIds    = [...comercioIdsSet]

  let comercios: ComercioRow[] = []
  if (comercioIds.length > 0) {
    const { data } = await admin
      .from('comercios').select('id, tipo, localidad_id, lat, lng').in('id', comercioIds)
    comercios = (data ?? []) as ComercioRow[]
  }

  // ── 5. Localidades ────────────────────────────────────────────────────────────
  const localidadIdsSet = new Set(comercios.map(c => c.localidad_id).filter((v): v is number => v !== null))
  const localidadIds    = [...localidadIdsSet]

  let localidades: LocalidadRow[] = []
  if (localidadIds.length > 0) {
    const { data } = await admin
      .from('localidades').select('id, nombre').in('id', localidadIds)
    localidades = (data ?? []) as LocalidadRow[]
  }

  // Centroide lat/lng por localidad (calculado desde coords de comercios)
  const localidadCentroid = new Map<number, { lat: number; lng: number }>()
  for (const c of comercios) {
    if (!c.localidad_id || !c.lat || !c.lng) continue
    const prev = localidadCentroid.get(c.localidad_id)
    if (!prev) { localidadCentroid.set(c.localidad_id, { lat: c.lat, lng: c.lng }) }
    else { prev.lat = (prev.lat + c.lat) / 2; prev.lng = (prev.lng + c.lng) / 2 }
  }

  // ── 6. Índices ───────────────────────────────────────────────────────────────
  const comercioMap    = new Map(comercios.map(c => [c.id, c]))
  const localidadMap   = new Map(localidades.map(l => [l.id, l]))

  // ── 7. KPIs globales ──────────────────────────────────────────────────────────
  const totalFotos      = fotos.length
  const totalPdv        = comercioIds.length
  const totalCiudades   = localidadIds.length
  const campanasActivas = campanas.filter(c => c.estado === 'activa').length

  // ── La Presencia sale de `panel_marca_series`, no de contar fotos ────────────
  //
  // La cuenta que había acá era `producto_presente / TODAS las fotos aprobadas`,
  // y tenía los dos errores a la vez. Medido en prod el 23/9/2026:
  //
  //   · Suprante leía "0%". No tiene ni una foto con `declaracion` —la columna
  //     está congelada desde 20260407124015— pero sí 11 observaciones de
  //     presencia tipificadas, 7 afirmativas. El número real es 64%. Un 0% no
  //     es "no sabemos": le dice a la marca que su producto no está en ningún
  //     lado, que es lo contrario de lo que pasó.
  //
  //   · Georgalos leía "66%", de dividir 90 presentes por 137 fotos, 25 de las
  //     cuales no declararon nada. Sobre sus observaciones reales son 80%.
  //
  // El denominador ahora son OBSERVACIONES con valor usable, no fotos: una
  // misión, no una imagen. Y `null` cuando no hay ninguna, que se muestra como
  // "—" y no como cero.

  // ── 8. Stats por localidad ────────────────────────────────────────────────────
  type LocalidadStat = {
    pdvSet: Set<string>
    pdvConPresenciaSet: Set<string>
    fotosCount: number
    ultimaFecha: string | null
  }
  const localidadStats = new Map<number, LocalidadStat>()

  for (const f of fotos) {
    if (!f.comercio_id) continue
    const comercio = comercioMap.get(f.comercio_id)
    if (!comercio?.localidad_id) continue
    const lid = comercio.localidad_id
    if (!localidadStats.has(lid)) localidadStats.set(lid, { pdvSet: new Set(), pdvConPresenciaSet: new Set(), fotosCount: 0, ultimaFecha: null })
    const stat = localidadStats.get(lid)!
    stat.pdvSet.add(f.comercio_id)
    stat.fotosCount++
    if (f.declaracion === 'producto_presente') stat.pdvConPresenciaSet.add(f.comercio_id)
    if (!stat.ultimaFecha || f.created_at > stat.ultimaFecha) stat.ultimaFecha = f.created_at
  }

  const mkLocalidadStat = (lid: number) => {
    const localidad = localidadMap.get(lid)!
    const stat = localidadStats.get(lid) ?? { pdvSet: new Set(), pdvConPresenciaSet: new Set(), fotosCount: 0, ultimaFecha: null }
    const pdvRelevados = stat.pdvSet.size
    const conPresencia = stat.pdvConPresenciaSet.size
    const pct = pdvRelevados > 0 ? Math.round((conPresencia / pdvRelevados) * 100) : 0
    return { localidad, stat, pdvRelevados, conPresencia, pct }
  }

  const zonaMapData: DashboardVisualizacionesProps['zonaMapData'] = localidadIds.map(lid => {
    const { localidad, stat, pdvRelevados, conPresencia, pct } = mkLocalidadStat(lid)
    const centroid = localidadCentroid.get(lid)
    return { id: String(lid), nombre: localidad.nombre, lat: centroid?.lat ?? 0, lng: centroid?.lng ?? 0, pdvRelevados, conPresencia, presenciaPct: pct, fotosRecibidas: stat.fotosCount }
  })

  const ciudadRows: DashboardVisualizacionesProps['ciudadRows'] = localidadIds.map(lid => {
    const { localidad, stat, pdvRelevados, conPresencia, pct } = mkLocalidadStat(lid)
    return { id: String(lid), nombre: localidad.nombre, pdvRelevados, conPresencia, sinPresencia: pdvRelevados - conPresencia, fotosRecibidas: stat.fotosCount, ultimaVisita: stat.ultimaFecha, presenciaPct: pct }
  })

  // ── 9. Penetración por campaña ────────────────────────────────────────────────
  type CampanaStat = { presente: number; noEncontrado: number; soloCompetencia: number }
  const campanaStatMap = new Map<string, CampanaStat>()

  for (const f of fotos) {
    if (!campanaStatMap.has(f.campana_id)) campanaStatMap.set(f.campana_id, { presente: 0, noEncontrado: 0, soloCompetencia: 0 })
    const cs = campanaStatMap.get(f.campana_id)!
    if (f.declaracion === 'producto_presente')           cs.presente++
    else if (f.declaracion === 'producto_no_encontrado') cs.noEncontrado++
    else if (f.declaracion === 'solo_competencia')       cs.soloCompetencia++
  }

  const campanaNameMap = new Map(campanas.map(c => [c.id, c.nombre]))
  const penetracionData: DashboardVisualizacionesProps['penetracionData'] = [...campanaStatMap.entries()]
    .map(([cid, s]) => {
      const total = s.presente + s.noEncontrado + s.soloCompetencia
      return { nombre: campanaNameMap.get(cid) ?? 'Campaña', presente: s.presente, noEncontrado: s.noEncontrado, soloCompetencia: s.soloCompetencia, total, pct: total > 0 ? Math.round((s.presente / total) * 100) : 0 }
    })
    .sort((a, b) => b.total - a.total)

  // ── 10. Tipo de comercio ──────────────────────────────────────────────────────
  const TIPO_LABELS: Record<string, string> = { autoservicio: 'Autoservicio', almacen: 'Almacén', kiosco: 'Kiosco', mayorista: 'Mayorista' }
  type TipoStat = { pdvSet: Set<string>; pdvConPresenciaSet: Set<string> }
  const tipoStatsMap = new Map<string, TipoStat>()

  for (const f of fotos) {
    if (!f.comercio_id) continue
    const tipo = comercioMap.get(f.comercio_id)?.tipo ?? 'otro'
    if (!tipoStatsMap.has(tipo)) tipoStatsMap.set(tipo, { pdvSet: new Set(), pdvConPresenciaSet: new Set() })
    const ts = tipoStatsMap.get(tipo)!
    ts.pdvSet.add(f.comercio_id)
    if (f.declaracion === 'producto_presente') ts.pdvConPresenciaSet.add(f.comercio_id)
  }

  const tipoComercioData: DashboardVisualizacionesProps['tipoComercioData'] = [...tipoStatsMap.entries()]
    .map(([tipo, ts]) => ({ tipo, label: TIPO_LABELS[tipo] ?? tipo, relevados: ts.pdvSet.size, conPresencia: ts.pdvConPresenciaSet.size }))
    .sort((a, b) => b.relevados - a.relevados)

  // ── 11. Evolución semanal ─────────────────────────────────────────────────────
  const ahora  = new Date()
  const semanas: DashboardVisualizacionesProps['semanas'] = []
  for (let i = 11; i >= 0; i--) {
    const start = new Date(ahora); start.setDate(start.getDate() - (i + 1) * 7)
    const end   = new Date(ahora); end.setDate(end.getDate() - i * 7)
    const count = fotos.filter(f => { const t = new Date(f.created_at); return t >= start && t < end }).length
    semanas.push({ label: formatearInstante(start, { day: '2-digit', month: 'short' }), fotos: count })
  }

  // ── 12. Alertas ───────────────────────────────────────────────────────────────
  type Alerta = { tipo: 'warning' | 'error'; mensaje: string }
  const alertas: Alerta[] = []
  const hace30 = new Date(ahora); hace30.setDate(hace30.getDate() - 30)

  const ciudadesSinActividad = localidadIds.filter(lid => {
    const stat = localidadStats.get(lid)
    return !stat?.ultimaFecha || new Date(stat.ultimaFecha) < hace30
  })
  if (ciudadesSinActividad.length > 0) {
    const nombres = ciudadesSinActividad.map(lid => localidadMap.get(lid)?.nombre ?? 'Ciudad').slice(0, 3).join(', ')
    const extra   = ciudadesSinActividad.length > 3 ? ` y ${ciudadesSinActividad.length - 3} más` : ''
    alertas.push({ tipo: 'warning', mensaje: `Sin fotos en los últimos 30 días: ${nombres}${extra}.` })
  }

  const ciudadesBajaPres = ciudadRows.filter(c => c.pdvRelevados > 0 && c.presenciaPct < 5)
  if (ciudadesBajaPres.length > 0) {
    const nombres = ciudadesBajaPres.map(c => `${c.nombre} (${c.presenciaPct}%)`).slice(0, 3).join(', ')
    const extra   = ciudadesBajaPres.length > 3 ? ` y ${ciudadesBajaPres.length - 3} más` : ''
    alertas.push({ tipo: 'error', mensaje: `Presencia baja (<5%): ${nombres}${extra}.` })
  }

  const en7 = new Date(ahora); en7.setDate(en7.getDate() + 7)
  const campanasProxVencer = campanas.filter(c => {
    if (c.estado !== 'activa' || !c.fecha_fin) return false
    const fin = new Date(c.fecha_fin)
    return fin > ahora && fin <= en7
  })
  if (campanasProxVencer.length > 0) {
    const nombres = campanasProxVencer.map(c => c.nombre).slice(0, 3).join(', ')
    const extra   = campanasProxVencer.length > 3 ? ` y ${campanasProxVencer.length - 3} más` : ''
    alertas.push({ tipo: 'warning', mensaje: `Campañas que vencen en menos de 7 días: ${nombres}${extra}.` })
  }

  // ── 13. Campañas activas ──────────────────────────────────────────────────────
  const campanasActivasList = campanas
    .filter(c => c.estado === 'activa')
    .sort((a, b) => (a.fecha_fin ?? '').localeCompare(b.fecha_fin ?? ''))

  // Count de fotos aprobadas por campaña (todas, independientemente de declaracion)
  const fotosPorCampana = new Map<string, number>()
  for (const f of fotos) {
    fotosPorCampana.set(f.campana_id, (fotosPorCampana.get(f.campana_id) ?? 0) + 1)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
              a.tipo === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{a.mensaje}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard label="PDV relevados"     valor={totalPdv}        icon={Store}    color="bg-indigo-50 text-indigo-600"  sub="con fotos aprobadas" />
        <KpiCard
          label="Presencia"
          valor={presencia ? formatearValor(presencia.valor, 'porcentaje') : '—'}
          icon={TrendingUp}
          color="bg-green-50 text-green-600"
          sub={presencia
            ? `${presencia.verdaderos} de ${presencia.conValor} observaciones · ${textoPeriodo(presencia)}`
            : 'no se está midiendo'}
        />
        <KpiCard label="Ciudades cubiertas" valor={totalCiudades}  icon={MapPin}   color="bg-blue-50 text-blue-600" />
        <KpiCard label="Campañas activas"  valor={campanasActivas} icon={Megaphone} color="bg-purple-50 text-purple-600" />
        <KpiCard label="Fotos recibidas"   valor={totalFotos}      icon={Camera}   color="bg-gray-100 text-gray-600"     sub="aprobadas" />
      </div>

      {/* Visualizaciones — todo recharts + leaflet en un solo chunk cliente */}
      <DashboardVisualizaciones
        zonaMapData={zonaMapData}
        ciudadRows={ciudadRows}
        penetracionData={penetracionData}
        tipoComercioData={tipoComercioData}
        semanas={semanas}
        presencia={presencia && {
          valor:      presencia.valor,
          verdaderos: presencia.verdaderos,
          conValor:   presencia.conValor,
          periodo:    textoPeriodo(presencia),
        }}
      />

      {/* Campañas activas — server-rendered, sin librerías de browser */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Campañas activas</h3>
        </div>
        {campanasActivasList.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            No tenés campañas activas en este momento.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {campanasActivasList.map(c => {
              const total = fotosPorCampana.get(c.id) ?? 0
              const stat  = campanaStatMap.get(c.id)
              const totalDecl = stat ? stat.presente + stat.noEncontrado + stat.soloCompetencia : 0
              const pct   = totalDecl > 0 && stat ? Math.round((stat.presente / totalDecl) * 100) : null
              // Cuarta copia de la regla: esta calculaba los días a mano en vez
              // de usar el helper, y también decía "Hoy" para una campaña que
              // había terminado hace meses. Ver lib/campana-vigencia.ts.
              const vig = etiquetaVigencia(c.fecha_fin, { corto: true })
              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {total} foto{total !== 1 ? 's' : ''} aprobada{total !== 1 ? 's' : ''}
                      {pct !== null && ` · ${pct}% presencia`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {vig !== null && (
                      <span className={`flex items-center gap-1 text-xs font-medium ${!vig.vencida && vig.dias <= 7 ? 'text-red-600' : 'text-gray-400'}`}>
                        <Clock size={12} />
                        {vig.texto}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={11} />
                      Activa
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
