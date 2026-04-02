import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Megaphone, Camera, Store, Coins } from 'lucide-react'
import { formatearFechaHora } from '@/lib/utils'
import type { EstadoCampana, DeclaracionFoto } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({
  label, valor, icon: Icon, color,
}: {
  label: string
  valor: number | string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{valor}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // marca_id del usuario
  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  const marcaId: string | null = profile?.marca_id ?? null

  // Campañas de esta marca
  const { data: campanas } = await admin
    .from('campanas')
    .select('id, estado')
    .eq('marca_id', marcaId ?? '')

  const campanaIds = (campanas ?? []).map((c: { id: string; estado: EstadoCampana }) => c.id)
  const campanasActivas = (campanas ?? []).filter(
    (c: { id: string; estado: EstadoCampana }) => c.estado === 'activa'
  ).length

  // Fotos de la última semana
  let fotosEstaSemana = 0
  let totalComerciosSet: Set<string> = new Set()
  let ultimasFotos: Array<{
    id: string
    storage_path: string | null
    created_at: string
    declaracion: DeclaracionFoto
    comercio: { nombre: string } | null
    signedUrl: string | null
  }> = []

  if (campanaIds.length > 0) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: fotasData } = await admin
      .from('fotos')
      .select('id, storage_path, created_at, declaracion, comercio_id, comercio:comercios(nombre)')
      .in('campana_id', campanaIds)
      .order('created_at', { ascending: false })
      .limit(200)

    const todas = fotasData ?? []
    fotosEstaSemana = todas.filter(
      (f: { created_at: string }) => f.created_at >= sevenDaysAgo
    ).length

    todas.forEach((f: { comercio_id: string }) => totalComerciosSet.add(f.comercio_id))

    // Últimas 5 con URLs firmadas
    const primeras5 = todas.slice(0, 5)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ultimasFotos = await Promise.all(
      primeras5.map(async (f: any) => {
        let signedUrl: string | null = null
        if (f.storage_path) {
          const { data: signed } = await admin.storage
            .from('fotos-gondola')
            .createSignedUrl(f.storage_path, 3600)
          signedUrl = signed?.signedUrl ?? null
        }
        return { ...f, signedUrl }
      })
    )
  }

  // Tokens
  let tokens = 0
  if (marcaId) {
    const { data: marca } = await admin
      .from('marcas')
      .select('tokens_disponibles')
      .eq('id', marcaId)
      .single()
    tokens = marca?.tokens_disponibles ?? 0
  }

  const DECL_LABEL: Record<DeclaracionFoto, string> = {
    producto_presente:      'Presente',
    producto_no_encontrado: 'No encontrado',
    solo_competencia:       'Solo competencia',
  }
  const DECL_COLOR: Record<DeclaracionFoto, string> = {
    producto_presente:      'bg-green-100 text-green-700',
    producto_no_encontrado: 'bg-red-100 text-red-700',
    solo_competencia:       'bg-amber-100 text-amber-700',
  }

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Campañas activas"
          valor={campanasActivas}
          icon={Megaphone}
          color="bg-gondo-indigo-50 text-gondo-indigo-600"
        />
        <StatCard
          label="Fotos esta semana"
          valor={fotosEstaSemana}
          icon={Camera}
          color="bg-gondo-blue-50 text-gondo-blue-400"
        />
        <StatCard
          label="Comercios relevados"
          valor={totalComerciosSet.size}
          icon={Store}
          color="bg-gondo-verde-50 text-gondo-verde-400"
        />
        <StatCard
          label="Tokens disponibles"
          valor={tokens}
          icon={Coins}
          color="bg-gondo-amber-50 text-gondo-amber-400"
        />
      </div>

      {/* Últimas fotos */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Últimas fotos recibidas</h3>
        </div>
        {ultimasFotos.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Todavía no hay fotos en tus campañas.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {ultimasFotos.map(f => (
              <div key={f.id} className="flex items-center gap-4 px-5 py-3">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  {f.signedUrl ? (
                    <Image
                      src={f.signedUrl}
                      alt="Foto"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <Camera size={20} className="absolute inset-0 m-auto text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {(f.comercio as { nombre: string } | null)?.nombre ?? 'Comercio'}
                  </p>
                  <p className="text-xs text-gray-400">{formatearFechaHora(f.created_at)}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${DECL_COLOR[f.declaracion]}`}>
                  {DECL_LABEL[f.declaracion]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
