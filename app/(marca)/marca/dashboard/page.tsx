import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Megaphone, Store, TrendingUp, MapPin,
  Camera, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react'
import type { DashboardVisualizacionesProps } from './dashboard-visualizaciones'

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
  zona_id: string | null
}

type ZonaRow = {
  id: string
  nombre: string
  lat: number | null
  lng: number | null
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

  // ── 2. Campañas ──────────────────────────────────────────────────────────────
  const { data: campanasRaw } = await admin
    .from('campanas')
    .select('id, nombre, estado, fecha_fin, fecha_inicio')
    .eq('marca_id', marcaId)

  const campanas: CampanaRow[] = campanasRaw ?? []
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
      .from('comercios').select('id, tipo, zona_id').in('id', comercioIds)
    comercios = (data ?? []) as ComercioRow[]
  }

  // ── 5. Zonas ─────────────────────────────────────────────────────────────────
  const zonaIdsSet = new Set(comercios.map(c => c.zona_id).filter(Boolean) as string[])
  const zonaIds    = [...zonaIdsSet]

  let zonas: ZonaRow[] = []
  if (zonaIds.length > 0) {
    const { data } = await admin
      .from('zonas').select('id, nombre, lat, lng').in('id', zonaIds)
    zonas = (data ?? []) as ZonaRow[]
  }

  // ── 6. Índices ───────────────────────────────────────────────────────────────
  const comercioMap = new Map(comercios.map(c => [c.id, c]))
  const zonaMap     = new Map(zonas.map(z => [z.id, z]))

  // ── 7. KPIs globales ──────────────────────────────────────────────────────────
  const totalFotos      = fotos.length
  const totalPdv        = comercioIds.length
  const totalCiudades   = zonaIds.length
  const campanasActivas = campanas.filter(c => c.estado === 'activa').length

  const conPresenciaGlobal = fotos.filter(f => f.declaracion === 'producto_presente').length
  const presenciaPctGlobal = totalFotos > 0
    ? Math.round((conPresenciaGlobal / totalFotos) * 100) : 0

  // ── 8. Stats por zona ────────────────────────────────────────────────────────
  type ZonaStat = {
    pdvSet: Set<string>
    pdvConPresenciaSet: Set<string>
    fotosCount: number
    ultimaFecha: string | null
  }
  const zonaStats = new Map<string, ZonaStat>()

  for (const f of fotos) {
    if (!f.comercio_id) continue
    const comercio = comercioMap.get(f.comercio_id)
    if (!comercio?.zona_id) continue
    const zid = comercio.zona_id
    if (!zonaStats.has(zid)) zonaStats.set(zid, { pdvSet: new Set(), pdvConPresenciaSet: new Set(), fotosCount: 0, ultimaFecha: null })
    const stat = zonaStats.get(zid)!
    stat.pdvSet.add(f.comercio_id)
    stat.fotosCount++
    if (f.declaracion === 'producto_presente') stat.pdvConPresenciaSet.add(f.comercio_id)
    if (!stat.ultimaFecha || f.created_at > stat.ultimaFecha) stat.ultimaFecha = f.created_at
  }

  const mkZonaStat = (zid: string) => {
    const zona = zonaMap.get(zid)!
    const stat = zonaStats.get(zid) ?? { pdvSet: new Set(), pdvConPresenciaSet: new Set(), fotosCount: 0, ultimaFecha: null }
    const pdvRelevados = stat.pdvSet.size
    const conPresencia = stat.pdvConPresenciaSet.size
    const pct = pdvRelevados > 0 ? Math.round((conPresencia / pdvRelevados) * 100) : 0
    return { zona, stat, pdvRelevados, conPresencia, pct }
  }

  const zonaMapData: DashboardVisualizacionesProps['zonaMapData'] = zonaIds.map(zid => {
    const { zona, stat, pdvRelevados, conPresencia, pct } = mkZonaStat(zid)
    return { id: zid, nombre: zona.nombre, lat: zona.lat ?? 0, lng: zona.lng ?? 0, pdvRelevados, conPresencia, presenciaPct: pct, fotosRecibidas: stat.fotosCount }
  })

  const ciudadRows: DashboardVisualizacionesProps['ciudadRows'] = zonaIds.map(zid => {
    const { zona, stat, pdvRelevados, conPresencia, pct } = mkZonaStat(zid)
    return { id: zid, nombre: zona.nombre, pdvRelevados, conPresencia, sinPresencia: pdvRelevados - conPresencia, fotosRecibidas: stat.fotosCount, ultimaVisita: stat.ultimaFecha, presenciaPct: pct }
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
    semanas.push({ label: start.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }), fotos: count })
  }

  // ── 12. Alertas ───────────────────────────────────────────────────────────────
  type Alerta = { tipo: 'warning' | 'error'; mensaje: string }
  const alertas: Alerta[] = []
  const hace30 = new Date(ahora); hace30.setDate(hace30.getDate() - 30)

  const ciudadesSinActividad = zonaIds.filter(zid => {
    const stat = zonaStats.get(zid)
    return !stat?.ultimaFecha || new Date(stat.ultimaFecha) < hace30
  })
  if (ciudadesSinActividad.length > 0) {
    const nombres = ciudadesSinActividad.map(zid => zonaMap.get(zid)?.nombre ?? 'Ciudad').slice(0, 3).join(', ')
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
        <KpiCard label="Presencia"         valor={totalFotos > 0 ? `${presenciaPctGlobal}%` : '—'} icon={TrendingUp} color="bg-green-50 text-green-600"  sub={totalFotos > 0 ? `${conPresenciaGlobal} de ${totalFotos} fotos` : 'sin datos'} />
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
        totalFotos={totalFotos}
        conPresenciaGlobal={conPresenciaGlobal}
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
              const stat  = campanaStatMap.get(c.id)
              const total = stat ? stat.presente + stat.noEncontrado + stat.soloCompetencia : 0
              const pct   = total > 0 && stat ? Math.round((stat.presente / total) * 100) : null
              const diasRestantes = c.fecha_fin
                ? Math.ceil((new Date(c.fecha_fin).getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24))
                : null
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
                    {diasRestantes !== null && (
                      <span className={`flex items-center gap-1 text-xs font-medium ${diasRestantes <= 7 ? 'text-red-600' : 'text-gray-400'}`}>
                        <Clock size={12} />
                        {diasRestantes > 0 ? `${diasRestantes}d` : 'Hoy'}
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
