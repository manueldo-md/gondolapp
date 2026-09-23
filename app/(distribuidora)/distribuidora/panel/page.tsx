/**
 * /distribuidora/panel — el panel de métricas de la distribuidora.
 *
 * Es el MISMO panel que el de marca: las mismas funciones de la base
 * (`panel_series` / `panel_visitas` / `panel_pdv`), el mismo rollup
 * (`lib/panel-metricas.ts`) y los mismos componentes (`components/panel/`).
 * Lo único propio de esta pantalla es el alcance, porque una distribuidora
 * ejecuta campañas de varias marcas y esos números no se suman.
 *
 * ── EL CASO QUE LO JUSTIFICA ────────────────────────────────────────────────
 * Una distri arma una campaña para relevar competencia —"hay marca X", "hay
 * producto X", foto— y con el mapa define precios por zona. Sube en Colón donde
 * no hay competencia, baja en Concordia donde está a full. Es una decisión de
 * plata, no un reporte.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Store, TrendingUp, MapPin, Layers, Info } from 'lucide-react'
import {
  armarPanel, resumenDe, formatearValor, textoPeriodo, agruparCobertura,
  type FilaSerie, type FilaVisitas, type FilaPdv,
} from '@/lib/panel-metricas'
import { etiquetaTipo } from '@/lib/tipos-comercio'
import { campanasDe, idsDe } from '@/lib/campanas-de'
import {
  opcionesDeDistri, alcanceDesde, desvioDeScope, textoDesvio,
  type OpcionAlcance,
} from '@/lib/panel-distri'
import { getGondolerosDeDistri } from '@/lib/utils-distri'
import { SerieMensual } from '@/components/panel/serie-mensual'

const RUTA = '/distribuidora/panel'

// Mismo criterio que el panel de marca: un solo dynamic import, sin ssr, para
// que el resto de la pantalla siga sin mandar JS al cliente.
const Cobertura = dynamic(
  () => import('@/components/panel/cobertura'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        {[420, 240, 240].map((h, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="bg-gray-100 animate-pulse rounded-lg" style={{ height: h }} />
          </div>
        ))}
      </div>
    ),
  }
)

function KpiCard({ label, valor, icon: Icon, color, sub }: {
  label: string
  valor: number | string
  icon: React.ElementType
  color: string
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{valor}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

/**
 * El selector de alcance. Es un control OBLIGATORIO y sin default: mientras no
 * haya elección no se dibuja un solo número.
 *
 * Son links y no un `<select>` a propósito, igual que el resto de este panel:
 * la selección vive en la URL, la pantalla sigue siendo Server Component y el
 * link se puede mandar por mensaje.
 */
function SelectorAlcance({ opciones, activo }: { opciones: OpcionAlcance[]; activo: string | null }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mr-1">
        Qué mirás
      </span>
      {opciones.map(o => (
        <a
          key={o.clave}
          href={`${RUTA}?alcance=${encodeURIComponent(o.clave)}`}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            o.clave === activo
              ? 'bg-gondo-amber-400 text-white border-gondo-amber-400'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
          }`}
        >
          {o.etiqueta}
          <span className={`ml-2 text-xs ${o.clave === activo ? 'text-white/70' : 'text-gray-400'}`}>
            {o.campanas}
          </span>
        </a>
      ))}
    </div>
  )
}

export default async function PanelDistriPage({
  searchParams,
}: {
  searchParams: { alcance?: string; metrica?: string; mes?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles').select('distri_id').eq('id', user.id).single()
  const distriId: string | null = profile?.distri_id ?? null
  if (!distriId) redirect('/auth')

  const opciones = await opcionesDeDistri(distriId, admin)
  // `alcanceDesde` valida la clave contra las opciones de ESTA distri, así que
  // un `marca_id` puesto a mano en la URL no produce ninguna consulta.
  const alcance = alcanceDesde(searchParams.alcance, distriId, opciones)

  // ── El aviso del cambio de criterio ────────────────────────────────────────
  // Se mide sobre TODAS sus campañas y no sobre el grupo elegido: contesta por
  // qué este panel no da lo mismo que su tablero, y el tablero no tiene grupos.
  const [gondoleroIds, todasSusCampanas] = await Promise.all([
    getGondolerosDeDistri(distriId, admin, false),
    campanasDe({ tipo: 'distri', distriId }, admin),
  ])
  const desvio = await desvioDeScope(gondoleroIds, idsDe(todasSusCampanas), admin)
  const avisoDesvio = textoDesvio(desvio)

  const encabezado = (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Panel de métricas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Presencia, precios y cobertura de las campañas que ejecutás, mes a mes.
        </p>
      </div>
      {opciones.length > 0 && <SelectorAlcance opciones={opciones} activo={alcance ? (searchParams.alcance ?? null) : null} />}
      {avisoDesvio && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm border bg-blue-50 border-blue-200 text-blue-900">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed">{avisoDesvio}</p>
        </div>
      )}
    </div>
  )

  // ── Sin campañas: no hay panel posible, y se dice ──────────────────────────
  if (opciones.length === 0) {
    return (
      <div className="space-y-6 max-w-5xl">
        {encabezado}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
          <p className="text-sm font-medium text-gray-600">Todavía no ejecutás ninguna campaña</p>
          <p className="text-xs text-gray-500 mt-1">
            Cuando crees una campaña propia o una marca te asigne la ejecución de la suya,
            las métricas aparecen acá.
          </p>
        </div>
      </div>
    )
  }

  // ── Sin elección: NO se elige por ella ─────────────────────────────────────
  // Un default escondido —"si no eligió, la primera"— haría que lea el número
  // de una marca creyendo que es de otra. Los porcentajes de dos marcas no se
  // suman, así que tampoco hay opción "todas" que poner como default.
  if (!alcance) {
    return (
      <div className="space-y-6 max-w-5xl">
        {encabezado}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
          <Layers size={20} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-600">Elegí qué querés mirar</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">
            No hay una vista de “todas” a propósito: la presencia de una marca y la de
            otra miden productos distintos, y el promedio de las dos no describe a
            ninguna. Son paneles separados porque son decisiones separadas.
          </p>
        </div>
      </div>
    )
  }

  // ── Los datos, con el mismo camino que el panel de marca ───────────────────
  const campanas = await campanasDe(alcance, admin)
  const _campanas = idsDe(campanas)

  const [serieRes, visitasRes, pdvRes, metricasRes] = await Promise.all([
    admin.rpc('panel_series',  { _campanas }),
    admin.rpc('panel_visitas', { _campanas }),
    admin.rpc('panel_pdv',     { _campanas }),
    // El catálogo es lo único que permite NOMBRAR lo que no se está midiendo:
    // los RPC solo devuelven métricas con observaciones.
    admin.from('metricas').select('slug, nombre').eq('activa', true).order('orden'),
  ])

  // supabase-js NO lanza ante un error de Postgres: lo devuelve en .error. Sin
  // esto, un RPC caído daría un panel vacío, indistinguible de "no medís nada".
  if (serieRes.error)   console.error('[panel distri] panel_series:', serieRes.error.message)
  if (visitasRes.error) console.error('[panel distri] panel_visitas:', visitasRes.error.message)
  if (pdvRes.error)     console.error('[panel distri] panel_pdv:', pdvRes.error.message)
  if (metricasRes.error) console.error('[panel distri] metricas:', metricasRes.error.message)

  const panel = armarPanel({
    series:   (serieRes.data ?? []) as FilaSerie[],
    visitas:  (visitasRes.data ?? []) as FilaVisitas[],
    metricas: metricasRes.data ?? [],
  })

  const pdvs = (pdvRes.data ?? []) as FilaPdv[]
  const ciudades = agruparCobertura(pdvs, 'localidad')
  const tipos    = agruparCobertura(pdvs, 'tipo').map(g => ({ ...g, nombre: etiquetaTipo(g.clave) }))

  // Presencia SÍ se puede resumir en un número: es el porcentaje de una
  // condición que significa lo mismo en cualquier campaña. Precio NO —cada
  // campaña mide un producto distinto— así que no tiene KPI y se muestra una
  // serie por campaña más abajo. Ver esAgregableEntreCampanas.
  const presencia = resumenDe(panel.series.find(s => s.slug === 'presencia'))
  const totalPdv      = pdvs.length
  const totalCiudades = ciudades.filter(c => c.clave !== 'sin-localidad').length
  const totalCampanas = campanas.length

  const seleccion = searchParams.metrica && searchParams.mes
    ? { metrica: searchParams.metrica, mes: searchParams.mes }
    : undefined

  // `searchParams.alcance` es seguro acá: `alcanceDesde` ya lo validó contra
  // las opciones de esta distri, y si no fuera válido la función habría cortado
  // mucho más arriba.
  const rutaConAlcance = `${RUTA}?alcance=${encodeURIComponent(searchParams.alcance!)}`

  return (
    <div className="space-y-6 max-w-5xl">
      {encabezado}

      {/* KPIs. El "—" con "no se está midiendo" es el mismo criterio que el
          panel de marca: un 0% le diría a la distri que el producto no está en
          ningún lado, que es otra cosa. */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="PDV relevados" valor={totalPdv} icon={Store}
          color="bg-gondo-amber-50 text-gondo-amber-400" sub="en este alcance" />
        <KpiCard
          label="Presencia"
          valor={presencia ? formatearValor(presencia.valor, presencia.unidad) : '—'}
          icon={TrendingUp}
          color="bg-green-50 text-green-600"
          sub={presencia
            ? `${presencia.verdaderos} de ${presencia.conValor} observaciones · ${textoPeriodo(presencia)}`
            : 'no se está midiendo'}
        />
        <KpiCard label="Campañas" valor={totalCampanas} icon={Layers}
          color="bg-blue-50 text-blue-600" sub="en este alcance" />
        <KpiCard label="Ciudades cubiertas" valor={totalCiudades} icon={MapPin}
          color="bg-purple-50 text-purple-600" />
      </div>

      {/* La ruta base lleva el alcance adentro: sin eso, tocar un punto lo
          perdía y la pantalla volvía al estado sin elegir. */}
      <SerieMensual panel={panel} seleccion={seleccion} rutaBase={rutaConAlcance} />

      <Cobertura
        ciudades={ciudades}
        tipos={tipos}
        // El mapa de la distribuidora todavía no existe: un link a una pantalla
        // que no está es peor que no ofrecerlo. Se enciende en su etapa.
        rutaMapa={null}
        presencia={presencia && {
          valor:      presencia.valor,
          verdaderos: presencia.verdaderos,
          conValor:   presencia.conValor,
          periodo:    textoPeriodo(presencia),
        }}
      />
    </div>
  )
}
