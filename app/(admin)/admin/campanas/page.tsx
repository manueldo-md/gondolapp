import Link from 'next/link'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Camera, DollarSign } from 'lucide-react'
import {
  labelEstadoCampana,
  colorEstadoCampana,
  labelTipoCampana,
  diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana, FinanciadaPor } from '@/types'
import { CampanaAccionesAdmin } from './campana-acciones'
import { SeccionColapsable } from '@/components/campanas/seccion-colapsable'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const FINANCIADO_BADGE: Record<FinanciadaPor, { label: string; className: string }> = {
  gondolapp: { label: 'GondolApp', className: 'bg-[#1E1B4B] text-white' },
  marca:     { label: 'Marca',     className: 'bg-purple-50 text-purple-700 border border-purple-200' },
  distri:    { label: 'Distri',    className: 'bg-amber-50 text-amber-700 border border-amber-200' },
}

const TIPO_COLOR: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-600',
  pop:          'bg-purple-50 text-purple-600',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-600',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-600',
  interna:      'bg-gray-100 text-gray-500',
}

type CampanaAdmin = {
  id: string
  nombre: string
  tipo: TipoCampana
  estado: EstadoCampana
  financiada_por: FinanciadaPor
  fecha_fin: string | null
  objetivo_comercios: number | null
  comercios_relevados: number
  puntos_por_foto: number
  created_at: string
  marca_nombre: string | null
  distri_nombre: string | null
}

function CampanaTable({ campanas }: { campanas: CampanaAdmin[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-1">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Nombre', 'Tipo', 'Contenido', 'Origen', 'Marca / Distri', 'Avance', 'Días', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {campanas.map(c => {
              const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
              const progreso = c.objetivo_comercios
                ? Math.round((c.comercios_relevados / c.objetivo_comercios) * 100)
                : null
              const fp = (c.financiada_por ?? 'gondolapp') as FinanciadaPor
              const badge = FINANCIADO_BADGE[fp] ?? FINANCIADO_BADGE.gondolapp

              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px]">
                    <Link href={`/admin/campanas/${c.id}`} className="truncate block hover:text-[#1E1B4B] hover:underline">
                      {c.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo] ?? 'bg-gray-100 text-gray-500'}`}>
                      {labelTipoCampana(c.tipo)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
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
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.marca_nombre ?? c.distri_nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {progreso !== null ? `${c.comercios_relevados}/${c.objetivo_comercios} (${progreso}%)` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {dias !== null
                      ? <span className={dias <= 3 ? 'text-red-500 font-medium' : 'text-gray-500'}>{dias}d</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/campanas/${c.id}/detalle`} className="text-xs font-semibold text-gray-600 hover:underline px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">Detalle</Link>
                      <Link href={`/admin/campanas/${c.id}/resultados`} className="text-xs font-semibold text-[#1E1B4B] hover:underline px-2 py-1 bg-[#1E1B4B]/5 rounded-lg border border-[#1E1B4B]/10">Resultados</Link>
                      <CampanaAccionesAdmin campanaId={c.id} estadoActual={c.estado} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function CampanasAdminPage() {
  const admin = adminClient()

  const { data: campanasRaw } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, financiada_por,
      fecha_inicio, fecha_fin, objetivo_comercios, comercios_relevados,
      puntos_por_foto, created_at,
      marca:marcas(razon_social),
      distri:distribuidoras(razon_social)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanas = ((campanasRaw ?? []) as any[]).map(c => ({
    ...c,
    marca_nombre: Array.isArray(c.marca) ? c.marca[0]?.razon_social : c.marca?.razon_social,
    distri_nombre: Array.isArray(c.distri) ? c.distri[0]?.razon_social : c.distri?.razon_social,
  })) as CampanaAdmin[]

  // Secciones por estado
  const pendientes = campanas.filter(c => c.estado === 'pendiente_aprobacion')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const activas    = campanas.filter(c => c.estado === 'activa')
    .sort((a, b) => {
      if (!a.fecha_fin) return 1
      if (!b.fecha_fin) return -1
      return a.fecha_fin.localeCompare(b.fecha_fin)
    })
  const borradores = campanas.filter(c => c.estado === 'borrador')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const cerradas   = campanas.filter(c => ['cerrada', 'cancelada', 'pausada'].includes(c.estado))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campañas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{campanas.length} campañas</p>
        </div>
        <Link
          href="/admin/campanas/nueva"
          className="flex items-center gap-2 px-4 py-2 bg-[#1E1B4B] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2a6e] transition-colors"
        >
          + Nueva campaña
        </Link>
      </div>

      <div className="space-y-4">

        {/* ── Pendientes de aprobación ── */}
        {pendientes.length > 0 && (
          <SeccionColapsable
            titulo="Pendientes de aprobación"
            badge={pendientes.length}
            badgeClassName="bg-amber-100 text-amber-700"
            headerClassName="bg-amber-50 text-amber-800"
            defaultOpen={true}
          >
            <CampanaTable campanas={pendientes} />
          </SeccionColapsable>
        )}

        {/* ── Activas ── */}
        {activas.length > 0 && (
          <SeccionColapsable
            titulo="Activas"
            badge={activas.length}
            badgeClassName="bg-green-100 text-green-700"
            headerClassName="bg-green-50 text-green-800"
            defaultOpen={true}
          >
            <CampanaTable campanas={activas} />
          </SeccionColapsable>
        )}

        {/* ── Borradores ── */}
        {borradores.length > 0 && (
          <SeccionColapsable
            titulo="Borradores"
            badge={borradores.length}
            badgeClassName="bg-gray-200 text-gray-600"
            headerClassName="bg-gray-100 text-gray-700"
            defaultOpen={false}
          >
            <CampanaTable campanas={borradores} />
          </SeccionColapsable>
        )}

        {/* ── Cerradas / pausadas ── */}
        {cerradas.length > 0 && (
          <SeccionColapsable
            titulo="Cerradas y pausadas"
            badge={cerradas.length}
            badgeClassName="bg-gray-200 text-gray-500"
            headerClassName="bg-gray-50 text-gray-600"
            defaultOpen={false}
          >
            <CampanaTable campanas={cerradas} />
          </SeccionColapsable>
        )}

        {campanas.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">Sin campañas</p>
        )}
      </div>
    </div>
  )
}
