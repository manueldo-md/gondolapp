import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  labelEstadoCampana,
  colorEstadoCampana,
  labelTipoCampana,
  diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'
import { CampanaAccionesAdmin } from './campana-acciones'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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

export default async function CampanasAdminPage({
  searchParams,
}: {
  searchParams: { estado?: string }
}) {
  const admin = adminClient()
  const filtroEstado = searchParams.estado ?? 'todos'

  let query = admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, financiada_por,
      fecha_inicio, fecha_fin, objetivo_comercios, comercios_relevados,
      puntos_por_foto, created_at,
      marca:marcas(razon_social),
      distri:distribuidoras(razon_social)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (filtroEstado !== 'todos') query = query.eq('estado', filtroEstado)

  const { data: campanasRaw } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanas = ((campanasRaw ?? []) as any[]).map(c => ({
    ...c,
    marca_nombre: Array.isArray(c.marca) ? c.marca[0]?.razon_social : c.marca?.razon_social,
    distri_nombre: Array.isArray(c.distri) ? c.distri[0]?.razon_social : c.distri?.razon_social,
  }))

  const FILTROS = ['todos', 'activa', 'borrador', 'pausada', 'cerrada', 'cancelada']

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Campañas</h1>
        <p className="text-sm text-gray-500 mt-0.5">{campanas.length} campañas</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(f => (
          <a
            key={f}
            href={`/admin/campanas${f !== 'todos' ? `?estado=${f}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filtroEstado === f
                ? 'bg-[#1E1B4B] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Nombre', 'Tipo', 'Marca / Distri', 'Estado', 'Avance', 'Días', 'Acciones'].map(h => (
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

                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px]">
                      <p className="truncate">{c.nombre}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo as TipoCampana] ?? 'bg-gray-100 text-gray-500'}`}>
                        {labelTipoCampana(c.tipo)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.marca_nombre ?? c.distri_nombre ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(c.estado as EstadoCampana)}`}>
                        {labelEstadoCampana(c.estado as EstadoCampana)}
                      </span>
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
                      <CampanaAccionesAdmin campanaId={c.id} estadoActual={c.estado} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {campanas.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin campañas</p>
          )}
        </div>
      </div>
    </div>
  )
}
