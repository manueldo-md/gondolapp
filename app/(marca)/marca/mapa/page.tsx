/**
 * SPIKE — /marca/mapa. Solo para medir el bundle. Ver mapa-pdv.tsx.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { PuntoMapa } from './mapa-pdv'

const MapaPdv = dynamic(() => import('./mapa-pdv').then(m => m.MapaPdv), {
  ssr: false,
  loading: () => <div className="h-[520px] rounded-xl bg-gray-100 animate-pulse" />,
})

export default async function MapaPage() {
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

  // El spike lee comercios directo: el RPC todavía no devuelve lat/lng.
  const { data } = await admin.rpc('panel_marca_pdv', { _marca_id: marcaId })
  const filas = (data ?? []) as { comercio_id: string; comercio_nombre: string | null
                                  comercio_tipo: string | null; con_valor: number
                                  verdaderos: number }[]

  const { data: coords } = await admin
    .from('comercios')
    .select('id, lat, lng')
    .in('id', filas.length ? filas.map(f => f.comercio_id) : ['00000000-0000-0000-0000-000000000000'])

  const porId = new Map((coords ?? []).map(c => [c.id as string, c]))
  const puntos: PuntoMapa[] = filas.flatMap(f => {
    const c = porId.get(f.comercio_id)
    if (!c?.lat || !c?.lng) return []
    return [{
      id: f.comercio_id,
      nombre: f.comercio_nombre ?? 'Comercio',
      lat: Number(c.lat), lng: Number(c.lng),
      presente: Number(f.con_valor) === 0 ? null : Number(f.verdaderos) > 0,
      tipo: f.comercio_tipo,
    }]
  })

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">Mapa (spike)</h3>
      <p className="text-xs text-gray-400">{puntos.length} PDV con coordenadas</p>
      <MapaPdv puntos={puntos} />
    </div>
  )
}
