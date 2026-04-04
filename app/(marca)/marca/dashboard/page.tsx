import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Megaphone, Camera, Store, Coins, CheckCircle2, XCircle, Clock, TrendingUp, DollarSign } from 'lucide-react'
import { formatearFechaHora } from '@/lib/utils'
import type { EstadoCampana, DeclaracionFoto } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({
  label, valor, icon: Icon, color, sub,
}: {
  label: string
  valor: number | string
  icon: React.ElementType
  color: string
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{valor}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
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

  // ── Campañas de esta marca ─────────────────────────────────────────────────
  // Query: SELECT id, estado FROM campanas WHERE marca_id = $marcaId
  const { data: campanas } = await admin
    .from('campanas')
    .select('id, estado')
    .eq('marca_id', marcaId ?? '')

  const campanaIds = (campanas ?? []).map((c: { id: string; estado: EstadoCampana }) => c.id)
  const campanasActivas = (campanas ?? []).filter(
    (c: { id: string; estado: EstadoCampana }) => c.estado === 'activa'
  ).length

  // ── Tokens ────────────────────────────────────────────────────────────────
  // Query: SELECT tokens_disponibles FROM marcas WHERE id = $marcaId
  let tokens = 0
  if (marcaId) {
    const { data: marca } = await admin
      .from('marcas')
      .select('tokens_disponibles')
      .eq('id', marcaId)
      .single()
    tokens = marca?.tokens_disponibles ?? 0
  }

  // ── Métricas de fotos — conteos directos en DB ────────────────────────────
  // Se ejecutan en paralelo. Si no hay campañas, devuelven 0 / null sin crashear.
  const NULL_UUID = '00000000-0000-0000-0000-000000000000'
  const safeIds = campanaIds.length > 0 ? campanaIds : [NULL_UUID]

  const [aprobadas, pendientes, rechazadas, comerciosRes, precioRes, ultimasFotosRes] =
    await Promise.all([
      // SELECT COUNT(*) FROM fotos WHERE campana_id IN (...) AND estado = 'aprobada'
      admin.from('fotos').select('*', { count: 'exact', head: true })
        .in('campana_id', safeIds).eq('estado', 'aprobada'),

      // SELECT COUNT(*) FROM fotos WHERE campana_id IN (...) AND estado = 'pendiente'
      admin.from('fotos').select('*', { count: 'exact', head: true })
        .in('campana_id', safeIds).eq('estado', 'pendiente'),

      // SELECT COUNT(*) FROM fotos WHERE campana_id IN (...) AND estado = 'rechazada'
      admin.from('fotos').select('*', { count: 'exact', head: true })
        .in('campana_id', safeIds).eq('estado', 'rechazada'),

      // SELECT comercio_id FROM fotos WHERE campana_id IN (...) AND estado = 'aprobada'
      // (distinct se computa en JS sobre el array de IDs)
      admin.from('fotos').select('comercio_id')
        .in('campana_id', safeIds).eq('estado', 'aprobada'),

      // SELECT ROUND(AVG(precio_confirmado)::numeric, 2) FROM fotos
      // WHERE campana_id = ANY($campana_ids) AND estado = 'aprobada' AND precio_confirmado IS NOT NULL
      admin.rpc('avg_precio_confirmado', { campana_ids: safeIds }),

      // Últimas 5 fotos para el feed visual
      // SELECT id, storage_path, created_at, declaracion, comercios(nombre)
      // FROM fotos WHERE campana_id IN (...) ORDER BY created_at DESC LIMIT 5
      admin.from('fotos')
        .select('id, storage_path, created_at, declaracion, comercio:comercios(nombre)')
        .in('campana_id', safeIds)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

  const fotosAprobadas  = aprobadas.count  ?? 0
  const fotosPendientes = pendientes.count ?? 0
  const fotosRechazadas = rechazadas.count ?? 0
  const comerciosRelevados = new Set(
    ((comerciosRes.data ?? []) as { comercio_id: string }[])
      .map(f => f.comercio_id)
      .filter(Boolean)
  ).size
  const precioPromedio: number | null = precioRes.data ?? null

  // Tasa de aprobación: aprobadas / (aprobadas + rechazadas) * 100
  const totalRevisadas = fotosAprobadas + fotosRechazadas
  const tasaAprobacion = totalRevisadas > 0
    ? Math.round((fotosAprobadas / totalRevisadas) * 100)
    : null

  // Feed visual — últimas 5 con URLs firmadas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primeras5 = (ultimasFotosRes.data ?? []) as any[]
  const ultimasFotos: Array<{
    id: string
    storage_path: string | null
    created_at: string
    declaracion: DeclaracionFoto
    comercio: { nombre: string } | null
    signedUrl: string | null
  }> = await Promise.all(
    primeras5.map(async (f) => {
      let signedUrl: string | null = null
      if (f.storage_path) {
        const { data: signed } = await admin.storage
          .from('fotos-gondola')
          .createSignedUrl(f.storage_path, 3600)
        signedUrl = signed?.signedUrl ?? null
      }
      return {
        ...f,
        comercio: Array.isArray(f.comercio) ? (f.comercio[0] ?? null) : f.comercio,
        signedUrl,
      }
    })
  )

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

      {/* Stats — fila 1: estado de fotos */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Fotos aprobadas"
          valor={fotosAprobadas}
          icon={CheckCircle2}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          label="Fotos pendientes"
          valor={fotosPendientes}
          icon={Clock}
          color="bg-amber-50 text-amber-500"
        />
        <StatCard
          label="Fotos rechazadas"
          valor={fotosRechazadas}
          icon={XCircle}
          color="bg-red-50 text-red-500"
        />
        <StatCard
          label="Tasa de aprobación"
          valor={tasaAprobacion !== null ? `${tasaAprobacion}%` : '—'}
          icon={TrendingUp}
          color="bg-gondo-indigo-50 text-gondo-indigo-600"
          sub={totalRevisadas > 0 ? `${totalRevisadas} fotos revisadas` : undefined}
        />
      </div>

      {/* Stats — fila 2: cobertura y economía */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          label="Comercios relevados"
          valor={comerciosRelevados}
          icon={Store}
          color="bg-gondo-verde-50 text-gondo-verde-400"
          sub="con fotos aprobadas"
        />
        <StatCard
          label="Campañas activas"
          valor={campanasActivas}
          icon={Megaphone}
          color="bg-gondo-indigo-50 text-gondo-indigo-600"
        />
        <StatCard
          label="Precio prom. detectado"
          valor={precioPromedio !== null ? `$${precioPromedio.toFixed(2)}` : '—'}
          icon={DollarSign}
          color="bg-gondo-blue-50 text-gondo-blue-400"
          sub={precioPromedio !== null ? 'fotos con precio confirmado' : 'sin datos de precio'}
        />
      </div>

      {/* Tokens — separado */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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
