/**
 * /marca/mapa — dónde está el producto y dónde no, geográficamente.
 *
 * El cuerpo vive en `components/panel/pantalla-mapa.tsx`, compartido con el
 * mapa de la distribuidora. Acá queda lo único propio de la marca: resolver de
 * quién son las campañas y traer las filas.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { PantallaMapa, type FilaPdvMapa } from '@/components/panel/pantalla-mapa'
import type { Pintado } from '@/components/panel/mapa'
import { campanasDe, idsDe } from '@/lib/campanas-de'

const RUTA = '/marca/mapa'

export default async function MapaPage({
  searchParams,
}: {
  searchParams: { campana?: string; pintar?: string }
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
  const pintar: Pintado = searchParams.pintar === 'tipo' ? 'tipo' : 'presencia'

  // El arreglo NO se arma con lo que viene en la URL: `idsDe` intersecta el
  // pedido contra las campañas de esta marca y devuelve vacío si no es suya.
  // Desde que el scope es una lista, la lista ES el permiso.
  const campanas = await campanasDe({ tipo: 'marca', marcaId }, admin)
  const pdvRes = await admin.rpc('panel_pdv', { _campanas: idsDe(campanas, campanaId) })

  // supabase-js devuelve el error en .error, no lo lanza. Sin esto, un RPC
  // caído sería un mapa vacío, que se lee como "no tenés PDV".
  if (pdvRes.error) console.error('[mapa marca] panel_pdv:', pdvRes.error.message)

  return (
    <PantallaMapa
      filas={(pdvRes.data ?? []) as FilaPdvMapa[]}
      campanas={campanas.map(c => ({ id: c.id, nombre: c.nombre }))}
      campanaId={campanaId}
      pintar={pintar}
      rutaBase={RUTA}
      panel="marca"
      apiKey={process.env.NEXT_PUBLIC_GEOAPIFY_KEY ?? ''}
    />
  )
}
