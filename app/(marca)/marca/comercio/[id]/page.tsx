/**
 * /marca/comercio/[id] — la evidencia de un comercio, en el tiempo.
 *
 * ── SINGULAR, Y NO ES UN CAPRICHO ───────────────────────────────────────────
 * `comercios` en plural es EL PADRÓN —ubicación, validación, reportes— y ya
 * existe en el panel de distribuidora. `comercio` en singular es LA EVIDENCIA.
 * Son dos preguntas distintas sobre el mismo sustantivo, y la etapa 6 del tramo
 * anterior salió justamente de dos pantallas que decían "cobertura" midiendo
 * cosas distintas. Acá la distinción está puesta en la URL desde el primer día.
 *
 * El cuerpo vive en `components/panel/linea-comercio.tsx`, compartido con la
 * distribuidora. Acá queda lo único propio de la marca: de quién son las
 * campañas.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { PantallaLineaComercio } from '@/components/panel/linea-comercio'
import { campanasDe, idsDe } from '@/lib/campanas-de'
import { cabeceraSiPertenece, filasDeLaLinea } from '@/lib/visitas-comercio'
import { armarLinea } from '@/lib/linea-comercio'
import { firmarFotosEnLote } from '@/lib/storage-fotos'
import { hrefMapa } from '@/lib/mapa-pdv'

export default async function ComercioMarcaPage({
  params, searchParams,
}: {
  params: { id: string }
  searchParams: { campana?: string }
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
    .from('profiles').select('marca_id').eq('id', user.id).single()
  const marcaId: string | null = profile?.marca_id ?? null
  if (!marcaId) redirect('/auth')

  const campanaId = searchParams.campana || null
  const campanas = await campanasDe({ tipo: 'marca', marcaId }, admin)
  const campanaIds = idsDe(campanas, campanaId)

  // EL PERMISO, antes que nada. La URL trae un `comercio_id` que puede ser
  // cualquiera: se verifica contra `panel_pdv` del alcance, que es la misma
  // definición que usa el mapa para decidir qué puntos dibuja.
  const comercio = await cabeceraSiPertenece(params.id, campanaIds, admin)
  if (!comercio) notFound()

  const filas = await filasDeLaLinea(params.id, campanaIds, admin)
  const linea = armarLinea(filas)

  // Se firma en el RENDER y no en una server action, al revés que el thumb del
  // mapa. Allá se firmaban 58 para que alguien mirara tres; acá la pantalla ES
  // las fotos, así que se van a ver todas.
  const urls = await firmarFotosEnLote(
    linea.visitas.flatMap(v => v.fotos).map(f => ({ id: f.id, storage_path: f.storagePath, url: f.url })),
    admin,
  )

  return (
    <PantallaLineaComercio
      comercio={comercio}
      linea={linea}
      urls={urls}
      volverA={hrefMapa('/marca/mapa', { campana: campanaId })}
      volverTexto="Volver al mapa"
      campanaFiltrada={campanaId ? campanas.find(c => c.id === campanaId)?.nombre ?? null : null}
      hrefSinFiltro={`/marca/comercio/${params.id}`}
    />
  )
}
