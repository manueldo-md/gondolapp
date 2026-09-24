'use server'

/**
 * Las fotos de la lista del mapa, firmadas AL ABRIR y no antes.
 *
 * ── POR QUÉ UNA SERVER ACTION Y NO DATOS DE LA PÁGINA ───────────────────────
 * Los buckets son privados, así que una foto se muestra con una URL firmada y
 * firmar necesita service role, o sea servidor. La lista, en cambio, vive en
 * `MapaCliente`, que es un Client Component porque el mapa tiene zoom.
 *
 * Firmar en el render de la página sería firmar los 58 PDV de una para que el
 * usuario abra un grupo de tres. Son 58 tokens de una hora emitidos al pedo, y
 * 58 URLs viajando en el HTML de cada carga.
 *
 * ── Y LA ACCIÓN NO LE CREE AL CLIENTE ───────────────────────────────────────
 * Recibe ids de comercio y la selección de la URL, pero **vuelve a resolver el
 * permiso desde la sesión**: lee el perfil, arma las campañas con
 * `campanasDe` y filtra las fotos contra ESA lista. Un `comercio_id` de otro
 * actor no devuelve nada, porque la consulta nunca sale del alcance propio.
 *
 * Desde que el scope de `panel_pdv` es una lista de campañas, la lista ES el
 * permiso. Una acción que aceptara los ids de campaña del cliente sería la
 * puerta de atrás de todo el tramo.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { campanasDe, idsDe, type Alcance } from '@/lib/campanas-de'
import { opcionesDeDistri, alcanceDesde } from '@/lib/panel-distri'
import { firmarFotosEnLote } from '@/lib/storage-fotos'
import { ultimaFotoPorComercio, fotosCandidatas, type FilaFotoMapa } from '@/lib/fotos-mapa'

export type FotoDeLista = {
  comercioId: string
  url: string
  /** Cuándo se sacó. La lista la muestra para que el thumb no parezca de hoy. */
  instante: string
}

export async function fotosDeLaLista(params: {
  comercioIds: string[]
  /** La clave del selector de alcance, solo para la distribuidora. */
  alcanceClave?: string | null
  /** La campaña elegida en el control "qué se muestra", si hay una. */
  campanaId?: string | null
}): Promise<FotoDeLista[]> {
  const { comercioIds, alcanceClave, campanaId } = params
  if (comercioIds.length === 0) return []

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: perfil } = await admin
    .from('profiles').select('marca_id, distri_id').eq('id', user.id).single()
  if (!perfil) return []

  // ── El alcance se deriva de la sesión, nunca del cliente ──────────────────
  let alcance: Alcance | null = null
  if (perfil.marca_id) {
    alcance = { tipo: 'marca', marcaId: perfil.marca_id }
  } else if (perfil.distri_id) {
    // Mismo camino que la pantalla: la clave se valida contra las opciones de
    // ESTA distri. Una clave ajena no se convierte en alcance.
    const opciones = await opcionesDeDistri(perfil.distri_id, admin)
    alcance = alcanceDesde(alcanceClave, perfil.distri_id, opciones)
  }
  if (!alcance) return []

  const campanas = await campanasDe(alcance, admin)
  const campanaIds = idsDe(campanas, campanaId)
  if (campanaIds.length === 0) return []

  // La consulta vive en lib/fotos-mapa.ts y no acá: es donde está la regla de
  // "la foto es DE ESA CAMPAÑA", y adentro de una server action no se podía
  // probar sin replicarla. Ver el encabezado de esa función.
  const filas: FilaFotoMapa[] = await fotosCandidatas(comercioIds, campanaIds, admin)
  const elegidas = ultimaFotoPorComercio(filas)
  if (elegidas.size === 0) return []

  const porId = new Map(filas.map(f => [f.id, f]))
  const aFirmar = [...elegidas.values()]
    .map(e => porId.get(e.fotoId))
    .filter((f): f is FilaFotoMapa => !!f)

  // Una sola llamada a Storage para todas. Ver firmarFotosEnLote.
  const urls = await firmarFotosEnLote(aFirmar, admin)

  const salida: FotoDeLista[] = []
  for (const [comercioId, e] of elegidas) {
    const url = urls[e.fotoId]
    // Una foto que no se pudo firmar y no tiene fallback queda fuera: la lista
    // muestra ese comercio sin thumb, que es mejor que un ícono roto.
    if (url) salida.push({ comercioId, url, instante: e.instante })
  }
  return salida
}
