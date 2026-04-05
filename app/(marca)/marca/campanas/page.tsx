import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Clock, Target, Megaphone, Users, Camera, DollarSign } from 'lucide-react'
import {
  labelTipoCampana,
  labelEstadoCampana,
  colorEstadoCampana,
  diasRestantes,
  calcularPorcentaje,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'
import { SeccionColapsable } from '@/components/campanas/seccion-colapsable'

interface CampanaRow {
  id: string
  nombre: string
  tipo: TipoCampana
  estado: EstadoCampana
  fecha_inicio: string | null
  fecha_fin: string | null
  objetivo_comercios: number | null
  comercios_relevados: number
  puntos_por_foto: number
  financiada_por: string
  created_at: string
  gondoleroCount: number
  motivo_rechazo: string | null
}

const TIPO_COLOR: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-400',
  pop:          'bg-purple-100 text-purple-700',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-400',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-400',
  interna:      'bg-gray-100 text-gray-500',
}

function CampanaCard({ c }: { c: CampanaRow }) {
  const dias     = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const progreso = calcularPorcentaje(c.comercios_relevados, c.objetivo_comercios ?? 0)

  const estadoLabel = c.estado === 'borrador' && c.motivo_rechazo ? 'Rechazada' : labelEstadoCampana(c.estado)
  const estadoColor = c.estado === 'borrador' && c.motivo_rechazo
    ? 'bg-red-50 text-red-700 border-red-200'
    : colorEstadoCampana(c.estado)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gondo-indigo-200 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo]}`}>
              {labelTipoCampana(c.tipo)}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${estadoColor}`}>
              {estadoLabel}
            </span>
            {/* Content badges */}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              <Camera size={10} />
              Foto
            </span>
            {c.tipo === 'precio' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gondo-amber-50 text-gondo-amber-400">
                <DollarSign size={10} />
                Precio
              </span>
            )}
          </div>

          <h3 className="font-semibold text-gray-900 text-base mb-3">{c.nombre}</h3>

          {/* Stats row */}
          <div className="flex items-center gap-5 text-xs text-gray-500 flex-wrap">
            {dias !== null && (
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span className={dias <= 3 ? 'text-red-500 font-medium' : ''}>
                  {dias === 0 ? 'Último día' : `${dias} días restantes`}
                </span>
              </div>
            )}
            {c.objetivo_comercios && (
              <div className="flex items-center gap-1">
                <Target size={12} />
                <span>{c.comercios_relevados} / {c.objetivo_comercios} comercios</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users size={12} />
              <span>{c.gondoleroCount} gondolero{c.gondoleroCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Barra de progreso */}
          {c.objetivo_comercios && c.objetivo_comercios > 0 && (
            <div className="mt-3">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-xs">
                <div
                  className="h-full bg-gondo-indigo-600 rounded-full transition-all"
                  style={{ width: `${progreso}%` }}
                />
              </div>
            </div>
          )}

          {/* Motivo de rechazo */}
          {c.motivo_rechazo && (
            <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              ❌ {c.motivo_rechazo}
            </p>
          )}
        </div>

        <Link
          href={`/marca/campanas/${c.id}`}
          className="shrink-0 text-xs font-semibold text-gondo-indigo-600 hover:underline"
        >
          Ver detalle →
        </Link>
      </div>
    </div>
  )
}

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
      motivo_rechazo
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

  // Secciones por estado
  const activas     = campanas.filter(c => c.estado === 'activa')
    .sort((a, b) => {
      if (!a.fecha_fin) return 1
      if (!b.fecha_fin) return -1
      return a.fecha_fin.localeCompare(b.fecha_fin)
    })
  const pendientes  = campanas.filter(c => c.estado === 'pendiente_aprobacion')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const borradores  = campanas.filter(c => c.estado === 'borrador')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const cerradas    = campanas.filter(c => ['cerrada', 'cancelada', 'pausada'].includes(c.estado))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

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
        <div className="space-y-4">

          {/* ── Activas ── */}
          {activas.length > 0 && (
            <SeccionColapsable
              titulo="Activas"
              badge={activas.length}
              badgeClassName="bg-green-100 text-green-700"
              headerClassName="bg-green-50 text-green-800"
              defaultOpen={true}
            >
              <div className="space-y-3 pt-1">
                {activas.map(c => <CampanaCard key={c.id} c={c} />)}
              </div>
            </SeccionColapsable>
          )}

          {/* ── Pendientes de aprobación ── */}
          {pendientes.length > 0 && (
            <SeccionColapsable
              titulo="Pendientes de aprobación"
              badge={pendientes.length}
              badgeClassName="bg-amber-100 text-amber-700"
              headerClassName="bg-amber-50 text-amber-800"
              defaultOpen={true}
            >
              <div className="space-y-3 pt-1">
                {pendientes.map(c => <CampanaCard key={c.id} c={c} />)}
              </div>
            </SeccionColapsable>
          )}

          {/* ── Borradores ── */}
          {borradores.length > 0 && (
            <SeccionColapsable
              titulo="Borradores"
              badge={borradores.length}
              badgeClassName="bg-gray-200 text-gray-600"
              headerClassName="bg-gray-100 text-gray-700"
              defaultOpen={borradores.some(c => c.motivo_rechazo)}
            >
              <div className="space-y-3 pt-1">
                {borradores.map(c => <CampanaCard key={c.id} c={c} />)}
              </div>
            </SeccionColapsable>
          )}

          {/* ── Cerradas / pausadas / canceladas ── */}
          {cerradas.length > 0 && (
            <SeccionColapsable
              titulo="Cerradas y pausadas"
              badge={cerradas.length}
              badgeClassName="bg-gray-200 text-gray-500"
              headerClassName="bg-gray-50 text-gray-600"
              defaultOpen={false}
            >
              <div className="space-y-3 pt-1">
                {cerradas.map(c => <CampanaCard key={c.id} c={c} />)}
              </div>
            </SeccionColapsable>
          )}

        </div>
      )}
    </div>
  )
}
