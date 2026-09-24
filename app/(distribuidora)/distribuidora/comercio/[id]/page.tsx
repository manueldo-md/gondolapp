/**
 * /distribuidora/comercio/[id] — la evidencia de un comercio, en el tiempo.
 *
 * ── SINGULAR CONTRA PLURAL, Y LAS DOS EXISTEN EN ESTE PANEL ─────────────────
 * `/distribuidora/comercios/[id]` —plural— ya existe y es EL PADRÓN: ubicación,
 * validación, reportes de ubicación, historial de correcciones. Esta, en
 * singular, es LA EVIDENCIA: cómo viene la góndola de ese comercio.
 *
 * Dos pantallas del mismo sustantivo en el mismo panel es exactamente lo que la
 * etapa 6 del tramo anterior tuvo que desarmar —dos bloques que decían
 * "cobertura" midiendo cosas distintas—, así que acá la distinción va puesta en
 * la URL desde el primer día y el padrón linkea a la evidencia.
 *
 * ── EL ALCANCE SIGUE SIENDO OBLIGATORIO ─────────────────────────────────────
 * Una distri ejecuta campañas de varias marcas, y el mismo local puede tener
 * evidencia de dos: **35 comercios en dev y 21 en producción están en campañas
 * de más de un alcance**. Sin elegir, la línea mezclaría la góndola de Georgalos
 * con la de Suprante, que es la violación más directa del Walled Garden que
 * puede haber. Por eso no hay default: es el mismo control del panel y del mapa.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { PantallaLineaComercio } from '@/components/panel/linea-comercio'
import {
  SelectorAlcance, SinAlcanceElegido, SinCampanas,
} from '@/components/panel/selector-alcance'
import { campanasDe, idsDe } from '@/lib/campanas-de'
import { opcionesDeDistri, alcanceDesde } from '@/lib/panel-distri'
import { cabeceraSiPertenece, filasDeLaLinea } from '@/lib/visitas-comercio'
import { armarLinea } from '@/lib/linea-comercio'
import { firmarFotosEnLote } from '@/lib/storage-fotos'
import { hrefMapa } from '@/lib/mapa-pdv'

export default async function ComercioDistriPage({
  params, searchParams,
}: {
  params: { id: string }
  searchParams: { alcance?: string; campana?: string; a?: string; b?: string }
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

  const RUTA = `/distribuidora/comercio/${params.id}`

  const opciones = await opcionesDeDistri(distriId, admin)
  // La clave se valida contra las opciones de ESTA distri: un `marca_id` puesto
  // a mano en la URL no se convierte en alcance y no produce ninguna consulta.
  const alcance = alcanceDesde(searchParams.alcance, distriId, opciones)

  if (opciones.length === 0) {
    return <div className="space-y-6 max-w-5xl"><SinCampanas /></div>
  }
  if (!alcance) {
    return (
      <div className="space-y-6 max-w-5xl">
        <SelectorAlcance opciones={opciones} activo={null} ruta={RUTA} />
        <SinAlcanceElegido />
      </div>
    )
  }

  const campanaId = searchParams.campana || null
  const campanas = await campanasDe(alcance, admin)
  const campanaIds = idsDe(campanas, campanaId)

  const comercio = await cabeceraSiPertenece(params.id, campanaIds, admin)
  // Un comercio que no está en este alcance no existe para esta pantalla, y no
  // se distingue de uno que no existe en absoluto: un 404 distinto le diría al
  // que prueba ids que ese comercio está en otra marca.
  if (!comercio) notFound()

  const filas = await filasDeLaLinea(params.id, campanaIds, admin)
  const linea = armarLinea(filas)

  const urls = await firmarFotosEnLote(
    linea.visitas.flatMap(v => v.fotos).map(f => ({ id: f.id, storage_path: f.storagePath, url: f.url })),
    admin,
  )

  return (
    <div className="space-y-6 max-w-6xl">
      <SelectorAlcance opciones={opciones} activo={searchParams.alcance ?? null} ruta={RUTA} />
      <PantallaLineaComercio
        comercio={comercio}
        linea={linea}
        urls={urls}
        // El mapa con el alcance y la campaña puestos: volver no puede perder
        // el contexto desde el que se entró. Es el bug que se comió el alcance
        // en el desglose de la serie, y por eso los links se arman con hrefMapa.
        volverA={hrefMapa('/distribuidora/mapa', { alcance: searchParams.alcance, campana: campanaId })}
        volverTexto="Volver al mapa"
        campanaFiltrada={campanaId ? campanas.find(c => c.id === campanaId)?.nombre ?? null : null}
        hrefSinFiltro={hrefMapa(RUTA, { alcance: searchParams.alcance })}
        rutaBase={hrefMapa(RUTA, { alcance: searchParams.alcance, campana: campanaId })}
        seleccion={{ a: searchParams.a, b: searchParams.b }}
      />
    </div>
  )
}
