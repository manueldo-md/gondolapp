import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Megaphone } from 'lucide-react'
import { CampanasFiltro, type CampanaFiltroRow } from './campanas-filtro'

type CampanaRow = CampanaFiltroRow

export default async function CampanasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  const marcaId = profile?.marca_id ?? null

  const { data, error } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, financiada_por, fecha_inicio, fecha_fin,
      objetivo_comercios, comercios_relevados, puntos_por_foto, created_at,
      actor_campana, motivo_rechazo
    `)
    .eq('marca_id', marcaId ?? '')
    .order('created_at', { ascending: false })

  if (error) console.error('Error fetching campanas:', error.message)
  const campanasSinCount = (data ?? []) as Omit<CampanaRow, 'gondoleroCount'>[]

  const campanaIds = campanasSinCount.map(c => c.id)
  let partCounts: Record<string, number> = {}
  if (campanaIds.length > 0) {
    const { data: partsData } = await admin
      .from('participaciones')
      .select('campana_id')
      .in('campana_id', campanaIds)
    partCounts = ((partsData ?? []) as { campana_id: string }[]).reduce(
      (acc, p) => { acc[p.campana_id] = (acc[p.campana_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
  }

  const campanas: CampanaRow[] = campanasSinCount.map(c => ({
    ...c,
    gondoleroCount: partCounts[c.id] ?? 0,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Campañas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {campanas.length} campaña{campanas.length !== 1 ? 's' : ''} en total
          </p>
        </div>
        <Link
          href="/marca/campanas/nueva"
          className="flex items-center gap-2 px-4 py-2.5 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-gondo-indigo-400 transition-colors"
        >
          <Plus size={16} />
          Nueva campaña
        </Link>
      </div>

      {campanas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <Megaphone size={32} className="text-gray-300 mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">Sin campañas todavía</h3>
          <p className="text-sm text-gray-400 mb-6">
            Creá tu primera campaña para empezar a relevar góndolas.
          </p>
          <Link
            href="/marca/campanas/nueva"
            className="px-5 py-2.5 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-gondo-indigo-400 transition-colors"
          >
            Crear primera campaña
          </Link>
        </div>
      ) : (
        <CampanasFiltro campanas={campanas} />
      )}
    </div>
  )
}
