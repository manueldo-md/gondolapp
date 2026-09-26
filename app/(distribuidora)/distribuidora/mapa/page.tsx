/**
 * /distribuidora/mapa — dónde relevó, y cómo le fue a cada punto.
 *
 * Es el MISMO mapa que el de marca: `components/panel/pantalla-mapa.tsx`, con
 * las mismas filas de `panel_pdv`. Lo único propio es el alcance, por la misma
 * razón que en el panel: una distri ejecuta campañas de varias marcas y esos
 * números no se suman.
 *
 * ── EL CASO QUE JUSTIFICA TODO EL TRAMO TERMINA ACÁ ─────────────────────────
 * Una distri arma una campaña para relevar competencia —"hay marca X", "hay
 * producto X", foto— y con este mapa define precios por zona. Sube en Colón
 * donde no hay competencia, baja en Concordia donde está a full. El panel dice
 * CUÁNTO; el mapa dice DÓNDE, y el dónde es lo que se convierte en una
 * decisión de plata.
 *
 * ── TRES CONTROLES, Y EL PRIMERO MANDA ──────────────────────────────────────
 * Alcance (obligatorio, sin default) → qué se muestra → cómo se pinta. Cambiar
 * de alcance resetea los otros dos a propósito: una campaña de Georgalos no
 * existe dentro de Suprante, y arrastrarla daría un mapa vacío sin explicación.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { PantallaMapa, type FilaPdvMapa } from '@/components/panel/pantalla-mapa'
import { modoDesde } from '@/lib/mapa-pdv'
import { provinciasDesde, aplicarFiltroProvincia } from '@/lib/filtro-provincia'
import {
  SelectorAlcance, SinAlcanceElegido, SinCampanas,
} from '@/components/panel/selector-alcance'
import { campanasDe, idsDe } from '@/lib/campanas-de'
import { coberturaDeCampana } from '@/lib/cobertura-mapa'
import { opcionesDeDistri, alcanceDesde } from '@/lib/panel-distri'

const RUTA = '/distribuidora/mapa'

export default async function MapaDistriPage({
  searchParams,
}: {
  searchParams: { alcance?: string; campana?: string; pintar?: string; prov?: string }
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
  // Valida la clave contra las opciones de ESTA distri: un `marca_id` puesto a
  // mano en la URL no se convierte en un alcance y no produce ninguna consulta.
  const alcance = alcanceDesde(searchParams.alcance, distriId, opciones)

  const encabezado = (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mapa de puntos de venta</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Dónde relevaste y cómo le fue a cada punto. El último estado conocido de cada uno.
        </p>
      </div>
      {opciones.length > 0 && (
        <SelectorAlcance opciones={opciones} activo={alcance ? (searchParams.alcance ?? null) : null} ruta={RUTA} />
      )}
    </div>
  )

  if (opciones.length === 0) {
    return <div className="space-y-6 max-w-5xl">{encabezado}<SinCampanas /></div>
  }
  if (!alcance) {
    return <div className="space-y-6 max-w-5xl">{encabezado}<SinAlcanceElegido /></div>
  }

  const campanaId = searchParams.campana || null
  const pintar = modoDesde(searchParams.pintar)
  const provElegidas = provinciasDesde(searchParams.prov)

  const campanas = await campanasDe(alcance, admin)
  const pdvRes = await admin.rpc('panel_pdv', { _campanas: idsDe(campanas, campanaId) })

  // ── La cobertura de la semana, solo si la campaña elegida la mide ────────
  // Es una consulta a `misiones` y el mismo `calcularCobertura` del dashboard.
  // No se amplió `panel_pdv` a propósito: la semana argentina vive en
  // `lib/fecha-ar.ts`, y calcularla en SQL sería una segunda definición de la
  // semana — la trampa que este proyecto ya pagó tres veces.
  const laElegida = campanaId ? campanas.find(c => c.id === campanaId) : null
  const cobertura = await coberturaDeCampana(laElegida, admin)

  if (pdvRes.error) console.error('[mapa distri] panel_pdv:', pdvRes.error.message)

  return (
    <div className="space-y-6 max-w-5xl">
      {encabezado}
      <PantallaMapa
        filas={aplicarFiltroProvincia((pdvRes.data ?? []) as FilaPdvMapa[], provElegidas).filas}
      // El filtro viene del panel por la URL: cruzar al mapa no tiene que
      // ensanchar la vista sin avisar.
      prov={provElegidas}
        campanas={campanas.map(c => ({ id: c.id, nombre: c.nombre }))}
        campanaId={campanaId}
        pintar={pintar}
        // La ruta va PELADA: el estado lo arma la pantalla con `hrefDelMapa`
        // a partir del alcance, la campaña y el modo. Antes acá se armaba una
        // "ruta base" con el alcance y sin la campaña, y el control de pintado
        // —que mergeaba sobre ella— borraba el `?campana=` en cada click.
        ruta={RUTA}
        alcanceClave={searchParams.alcance}
        cobertura={cobertura}
        visitasPorSemana={laElegida?.visitas_por_semana ?? null}
        panel="distri"
        apiKey={process.env.NEXT_PUBLIC_GEOAPIFY_KEY ?? ''}
      />
    </div>
  )
}
