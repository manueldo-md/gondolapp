import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { etiquetaVigencia } from '@/lib/campana-vigencia'
import {
  Megaphone, Store, TrendingUp, MapPin,
  Camera, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react'
import { SerieMensual } from '@/components/panel/serie-mensual'
import { formatearInstante } from '@/lib/fecha-ar'
import {
  armarPanel, resumenDe, formatearValor, textoPeriodo, agruparCobertura,
  type FilaSerie, type FilaVisitas, type FilaPdv,
} from '@/lib/panel-metricas'
import { etiquetaTipo } from '@/lib/tipos-comercio'
import { hrefMapa } from '@/lib/mapa-pdv'
import {
  provinciasDesde, serializarProvincias, provinciasDisponibles,
  aplicarFiltroProvincia, resumenProvincias,
} from '@/lib/filtro-provincia'
import {
  SelectorProvincia, AvisoExcluidos, KpiProvincias,
} from '@/components/panel/filtro-provincia'

const RUTA_DASHBOARD = '/marca/dashboard'
import { campanasDe, idsDe, type CampanaDelPanel } from '@/lib/campanas-de'

// ── Único dynamic import ─────────────────────────────────────────────────────
// Sin ssr a propósito, aunque el componente NO usa ninguna librería de browser:
// el comentario viejo decía "recharts + leaflet" y hace rato que no hay ni una
// ni la otra (ver la primera línea de components/panel/cobertura.tsx).
const Cobertura = dynamic(
  () => import('@/components/panel/cobertura'),
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

export default async function DashboardPage({
  searchParams,
}: {
  /**
   * El punto abierto del desglose. Vive acá y no en un useState para que el
   * bloque de la serie siga siendo Server Component y para que el link se
   * pueda mandar. Ver el encabezado de serie-mensual.tsx.
   */
  searchParams: { metrica?: string; mes?: string; prov?: string }
}) {
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
  // Las campañas van PRIMERO y solas: desde que el scope de los RPC es una
  // lista de campañas y no un marca_id, los tres dependen de esta consulta. Es
  // un viaje secuencial más, y es el precio de que el panel de marca y el de
  // distribuidora corran exactamente el mismo SQL.
  const campanas: CampanaDelPanel[] = await campanasDe({ tipo: 'marca', marcaId }, admin)
  const _campanas = idsDe(campanas)

  const [serieRes, visitasRes, pdvRes, metricasRes] = await Promise.all([
    admin.rpc('panel_series',  { _campanas }),
    admin.rpc('panel_visitas', { _campanas }),
    admin.rpc('panel_pdv',     { _campanas }),
    // El catálogo es lo único que permite NOMBRAR lo que no se está midiendo:
    // los RPC solo devuelven métricas con observaciones, así que sin esto el
    // panel puede decir qué hay pero no qué falta.
    admin.from('metricas').select('slug, nombre').eq('activa', true).order('orden'),
  ])

  // supabase-js NO lanza ante un error de Postgres: lo devuelve en .error. Sin
  // este chequeo, un RPC caído daría `data: null` → panel vacío → "—", que es
  // indistinguible de "esta marca no mide nada". Prefiero el "—" igual, pero
  // con el error en el log de alguien.
  if (serieRes.error)  console.error('[dashboard marca] panel_series:', serieRes.error.message)
  if (visitasRes.error) console.error('[dashboard marca] panel_visitas:', visitasRes.error.message)
  // Si falla el catálogo, `noMedidas` queda vacío y el panel igual funciona —
  // pierde la línea de "no se está midiendo X", no los datos.
  if (metricasRes.error) console.error('[dashboard marca] metricas:', metricasRes.error.message)

  const panel = armarPanel({
    series:  (serieRes.data  ?? []) as FilaSerie[],
    visitas: (visitasRes.data ?? []) as FilaVisitas[],
    metricas: metricasRes.data ?? [],
  })
  const presencia = resumenDe(panel.series.find(s => s.slug === 'presencia'))

  // ── LA SELECCIÓN PASA DERECHO, SIN VALIDAR ACÁ ─────────────────────────────
  // Hubo una guarda que además chequeaba que la métrica y el mes existieran en
  // el panel, y se sacó: era REDUNDANTE y por eso peligrosa. Quien decide si
  // algo se abre es `TarjetaSerie`, que busca el punto con un `find` y no
  // dibuja nada si no está. Una segunda validación no agregaba seguridad —el
  // `find` ya la da— pero sí agregaba un lugar donde una selección válida
  // podía perderse en silencio, que es exactamente lo que pasó el 24/9/2026.
  //
  // La regla general: un guard que no puede rechazar nada que el consumidor no
  // rechace igual no es un guard, es una copia de la condición.
  const seleccion = searchParams.metrica && searchParams.mes
    ? { metrica: searchParams.metrica, mes: searchParams.mes }
    : undefined

  // Si llegó una selección y no hay punto para ella, queda la traza. Un link
  // viejo o tipeado a mano no rompe nada —no se abre y listo— pero enterarse
  // es la diferencia entre "no abre" y "no abre y no sabemos por qué".
  if (seleccion && !panel.series.some(s =>
        s.slug === seleccion.metrica && s.puntos.some(pt => pt.mes === seleccion.mes))) {
    console.warn('[dashboard marca] selección sin punto:', JSON.stringify(seleccion),
      '— métricas:', panel.series.map(s => `${s.slug}:[${s.puntos.map(pt => pt.mes).join(',')}]`).join(' '))
  }
  const campanaIds = campanas.map(c => c.id)
  const NULL_UUID  = '00000000-0000-0000-0000-000000000000'
  const safeIds    = campanaIds.length > 0 ? campanaIds : [NULL_UUID]

  // ── 3. Fotos aprobadas ───────────────────────────────────────────────────────
  const { data: fotosRaw } = await admin
    .from('fotos')
    .select('id, campana_id, comercio_id, created_at')
    .in('campana_id', safeIds)
    .eq('estado', 'aprobada')

  const fotos: FotoRow[] = (fotosRaw ?? []) as FotoRow[]

  // ── 4. Cobertura por PDV ─────────────────────────────────────────────────────
  // Reemplaza la cascada fotos → comercios → localidades, que eran tres
  // consultas encadenadas para terminar contando presencia con una sola fuente.
  // El RPC devuelve un comercio por fila con su localidad y su tipo pegados, y
  // agrupar por uno u otro eje es una suma del lado de acá.
  const pdvsTodos = (pdvRes.data ?? []) as FilaPdv[]
  if (pdvRes.error) console.error('[dashboard marca] panel_pdv:', pdvRes.error.message)

  // ── El filtro de provincia ────────────────────────────────────────────────
  // Una vez, acá, y todo lo de abajo trabaja sobre `pdvs`. Filtrar en cada
  // consumidor sería la forma de que uno se olvide y la pantalla se contradiga.
  const provincias = provinciasDisponibles(pdvsTodos)
  const filtro = aplicarFiltroProvincia(pdvsTodos, provinciasDesde(searchParams.prov))
  const pdvs = filtro.filas
  const provResumen = resumenProvincias(pdvs)
  const hrefConProvincias = (sel: number[]) =>
    hrefMapa(RUTA_DASHBOARD, { prov: serializarProvincias(sel) })

  // Presencia por campaña, para la lista de campañas activas. Sale del
  // DESGLOSE del panel —que ya suma las dos fuentes— y no de contar
  // declaraciones de foto, que era la fuente única que dejaba a Suprante en 0%.
  const presenciaPorCampana = new Map<string, { verdaderos: number; conValor: number }>()
  for (const s of panel.series) {
    if (s.slug !== 'presencia') continue
    for (const pt of s.puntos) {
      for (const d of pt.desglose) {
        const acc = presenciaPorCampana.get(d.campanaId) ?? { verdaderos: 0, conValor: 0 }
        // Numerador y denominador CRUDOS, no reconstruidos desde el porcentaje:
        // un round-trip por un % redondeado pierde exactamente lo que este
        // panel promete no perder.
        acc.conValor   += d.conValor
        acc.verdaderos += d.verdaderos
        presenciaPorCampana.set(d.campanaId, acc)
      }
    }
  }

  const ciudades = agruparCobertura(pdvs, 'localidad')
  const tipos    = agruparCobertura(pdvs, 'tipo').map(g => ({ ...g, nombre: etiquetaTipo(g.clave) }))

  // ── 5. KPIs globales ─────────────────────────────────────────────────────────
  const totalFotos      = fotos.length
  const totalPdv        = pdvs.length
  const totalCiudades   = ciudades.filter(c => c.clave !== 'sin-localidad').length
  const campanasActivas = campanas.filter(c => c.estado === 'activa').length

  // ── 6. Alertas ───────────────────────────────────────────────────────────────
  type Alerta = { tipo: 'warning' | 'error'; mensaje: string }
  const alertas: Alerta[] = []
  const ahora  = new Date()
  const hace30 = new Date(ahora); hace30.setDate(hace30.getDate() - 30)

  // La alerta decía "sin FOTOS" y medía la última foto. Ahora mide la última
  // VISITA, que es lo que la marca quiere saber y lo que el RPC ya trae: una
  // campaña de solo preguntas no produce fotos, y su ciudad aparecía
  // abandonada aunque se hubiera relevado ayer.
  const ciudadesSinActividad = ciudades.filter(c =>
    !c.ultimaVisita || new Date(c.ultimaVisita) < hace30)
  if (ciudadesSinActividad.length > 0) {
    const nombres = ciudadesSinActividad.map(c => c.nombre).slice(0, 3).join(', ')
    const extra   = ciudadesSinActividad.length > 3 ? ` y ${ciudadesSinActividad.length - 3} más` : ''
    alertas.push({ tipo: 'warning', mensaje: `Sin visitas en los últimos 30 días: ${nombres}${extra}.` })
  }

  // `presenciaPct === null` NO entra, y es la corrección que más importa: una
  // ciudad donde no se midió presencia no tiene presencia baja, tiene
  // presencia DESCONOCIDA. Antes entraba con 0% y mandaba a la marca a
  // resolver un problema que no sabemos si existe.
  const ciudadesBajaPres = ciudades.filter(c => c.presenciaPct !== null && c.presenciaPct < 5)
  if (ciudadesBajaPres.length > 0) {
    const nombres = ciudadesBajaPres.map(c => `${c.nombre} (${c.presenciaPct}%)`).slice(0, 3).join(', ')
    const extra   = ciudadesBajaPres.length > 3 ? ` y ${ciudadesBajaPres.length - 3} más` : ''
    alertas.push({ tipo: 'error', mensaje: `Presencia baja (<5%): ${nombres}${extra}.` })
  }

  // Y la que no existía: visitas que no midieron nada. Es el dato accionable
  // que el 0% escondía, y dice qué hacer con él.
  const pdvSinMedir = ciudades.reduce((n, c) => n + (c.pdv - c.pdvMidieron), 0)
  if (pdvSinMedir > 0) {
    alertas.push({ tipo: 'warning', mensaje:
      `${pdvSinMedir} punto${pdvSinMedir === 1 ? '' : 's'} de venta se visitaron sin medir presencia. ` +
      `Para que cuenten, la campaña necesita una pregunta tipificada con esa métrica.` })
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

  // Count de fotos aprobadas por campaña
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
        {/* Devuelve null con cero provincias: "0 de 0" no es un dato. */}
        <KpiProvincias relevando={provResumen.relevando} conProducto={provResumen.conProducto} />
      </div>

      <SelectorProvincia
        provincias={provincias}
        seleccion={filtro.seleccion}
        href={hrefConProvincias}
      />
      <AvisoExcluidos filtro={filtro} totalSinFiltrar={pdvsTodos.length} />

      {/* Evolución mensual — server-rendered, SVG a mano, cero JS al cliente.
          Va acá arriba a propósito: es la pregunta que el panel vino a
          responder, y el resto son cortes de un momento. */}
      <SerieMensual panel={panel} seleccion={seleccion}
        // Con las provincias adentro: `SerieMensual` mergea `metrica` y `mes`
        // sobre esta ruta, así que una base pelada borraría el filtro en cada
        // clic del desglose.
        rutaBase={hrefMapa(RUTA_DASHBOARD, { prov: serializarProvincias(filtro.seleccion) })} />

      {/* Visualizaciones — todo en un solo chunk cliente */}
      <Cobertura
        ciudades={ciudades}
        tipos={tipos}
        // Con el filtro: cruzar al mapa no tiene que ensanchar la vista sin avisar.
        rutaMapa={hrefMapa('/marca/mapa', { prov: serializarProvincias(filtro.seleccion) })}
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
              const pres  = presenciaPorCampana.get(c.id)
              const pct   = pres && pres.conValor > 0
                ? Math.round((pres.verdaderos / pres.conValor) * 100)
                : null
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
