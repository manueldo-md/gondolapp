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
import { modoDesde } from '@/lib/mapa-pdv'
import { provinciasDesde, aplicarFiltroProvincia } from '@/lib/filtro-provincia'
import { campanasDe, idsDe } from '@/lib/campanas-de'
import { coberturaDeCampana } from '@/lib/cobertura-mapa'

const RUTA = '/marca/mapa'

export default async function MapaPage({
  searchParams,
}: {
  searchParams: { campana?: string; pintar?: string; prov?: string }
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
  const pintar = modoDesde(searchParams.pintar)
  const provElegidas = provinciasDesde(searchParams.prov)

  // El arreglo NO se arma con lo que viene en la URL: `idsDe` intersecta el
  // pedido contra las campañas de esta marca y devuelve vacío si no es suya.
  // Desde que el scope es una lista, la lista ES el permiso.
  const campanas = await campanasDe({ tipo: 'marca', marcaId }, admin)
  const pdvRes = await admin.rpc('panel_pdv', { _campanas: idsDe(campanas, campanaId) })

  // ── La cobertura de la semana, solo si la campaña elegida la mide ────────
  // Es una consulta a `misiones` y el mismo `calcularCobertura` del dashboard.
  // No se amplió `panel_pdv` a propósito: la semana argentina vive en
  // `lib/fecha-ar.ts`, y calcularla en SQL sería una segunda definición de la
  // semana — la trampa que este proyecto ya pagó tres veces.
  const laElegida = campanaId ? campanas.find(c => c.id === campanaId) : null
  const cobertura = await coberturaDeCampana(laElegida, admin)


  // supabase-js devuelve el error en .error, no lo lanza. Sin esto, un RPC
  // caído sería un mapa vacío, que se lee como "no tenés PDV".
  if (pdvRes.error) console.error('[mapa marca] panel_pdv:', pdvRes.error.message)

  return (
    <PantallaMapa
      filas={aplicarFiltroProvincia((pdvRes.data ?? []) as FilaPdvMapa[], provElegidas).filas}
      // El filtro viene del panel por la URL: cruzar al mapa no tiene que
      // ensanchar la vista sin avisar.
      prov={provElegidas}
      campanas={campanas.map(c => ({ id: c.id, nombre: c.nombre }))}
      campanaId={campanaId}
      pintar={pintar}
      ruta={RUTA}
      cobertura={cobertura}
      visitasPorSemana={laElegida?.visitas_por_semana ?? null}
      panel="marca"
      apiKey={process.env.NEXT_PUBLIC_GEOAPIFY_KEY ?? ''}
    />
  )
}
