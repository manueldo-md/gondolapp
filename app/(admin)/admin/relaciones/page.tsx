/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Handshake } from 'lucide-react'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminRelacionesPage() {
  const admin = adminClient()

  const { data: relaciones } = await admin
    .from('marca_distri_relaciones')
    .select(`
      id, estado, iniciado_por, created_at, updated_at, fecha_fin, fecha_reinicio,
      marca_id, distri_id,
      marca:marcas(razon_social),
      distri:distribuidoras(razon_social)
    `)
    .order('created_at', { ascending: false })

  const lista = ((relaciones ?? []) as any[]).map(r => ({
    id:          r.id,
    estado:      r.estado,
    iniciadoPor: r.iniciado_por,
    createdAt:   r.created_at,
    fechaFin:    r.fecha_fin,
    fechaReinicio: r.fecha_reinicio,
    marcaId:     r.marca_id,
    distriId:    r.distri_id,
    marcaNombre: Array.isArray(r.marca) ? r.marca[0]?.razon_social : r.marca?.razon_social,
    distriNombre: Array.isArray(r.distri) ? r.distri[0]?.razon_social : r.distri?.razon_social,
  }))

  // Campañas por relacion — contamos por (marca_id, distri_id)
  const pairs = lista.map(r => ({ marca_id: r.marcaId, distri_id: r.distriId }))
  let campanasPorPar: Record<string, number> = {}
  if (pairs.length > 0) {
    const marcaIds  = [...new Set(lista.map(r => r.marcaId).filter(Boolean))]
    const distriIds = [...new Set(lista.map(r => r.distriId).filter(Boolean))]
    if (marcaIds.length > 0 && distriIds.length > 0) {
      const { data: campData } = await admin
        .from('campanas')
        .select('marca_id, distri_id')
        .in('marca_id', marcaIds)
        .in('distri_id', distriIds)
      for (const c of (campData ?? []) as any[]) {
        const key = `${c.marca_id}__${c.distri_id}`
        campanasPorPar[key] = (campanasPorPar[key] ?? 0) + 1
      }
    }
  }

  // Solicitudes de reinicio pendientes
  const { data: reiniciosPend } = await admin
    .from('relacion_reinicio_solicitudes')
    .select('relacion_id')
    .eq('estado', 'pendiente')
  const reinicioSet = new Set((reiniciosPend ?? []).map((s: any) => s.relacion_id))

  const activas    = lista.filter(r => r.estado !== 'terminada')
  const terminadas = lista.filter(r => r.estado === 'terminada')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Relaciones Marca ↔ Distribuidora</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {lista.filter(r => r.estado === 'activa').length} activas
          · {terminadas.length} terminadas
          · {lista.length} total
        </p>
      </div>

      {lista.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Handshake size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sin relaciones registradas</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activas.length > 0 && (
            <RelacionesTable
              titulo="Activas"
              relaciones={activas}
              campanasPorPar={campanasPorPar}
              reinicioSet={reinicioSet}
            />
          )}
          {terminadas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">
                Historial terminadas
              </p>
              <RelacionesTable
                titulo=""
                relaciones={terminadas}
                campanasPorPar={campanasPorPar}
                reinicioSet={reinicioSet}
                dimmed
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RelacionesTable({
  relaciones, campanasPorPar, reinicioSet, dimmed = false,
}: {
  titulo: string
  relaciones: any[]
  campanasPorPar: Record<string, number>
  reinicioSet: Set<string>
  dimmed?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${dimmed ? 'opacity-80' : ''}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Marca', 'Distribuidora', 'Estado', 'Iniciado por', 'Inicio', 'Campañas', ''].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {relaciones.map(r => {
            const campCount = campanasPorPar[`${r.marcaId}__${r.distriId}`] ?? 0
            const tieneReinicioPend = reinicioSet.has(r.id)
            return (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{r.marcaNombre ?? '—'}</td>
                <td className="px-4 py-3 font-medium text-gray-700">{r.distriNombre ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <EstadoBadge estado={r.estado} />
                    {tieneReinicioPend && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                        Reinicio pendiente
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 capitalize">{r.iniciadoPor ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleDateString('es-AR')}
                  {r.fechaFin && (
                    <span className="block text-gray-300">
                      → {new Date(r.fechaFin).toLocaleDateString('es-AR')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{campCount}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/relaciones/${r.id}`}
                    className="text-xs text-[#1E1B4B] hover:underline font-medium"
                  >
                    Ver detalle →
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    pendiente: 'bg-amber-50 text-amber-700',
    activa:    'bg-green-50 text-green-700',
    pausada:   'bg-gray-100 text-gray-500',
    terminada: 'bg-red-50 text-red-500',
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors[estado] ?? 'bg-gray-100 text-gray-500'}`}>
      {estado}
    </span>
  )
}
