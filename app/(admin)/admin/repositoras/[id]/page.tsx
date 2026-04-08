import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, AlertCircle, ArrowLeft, Users, Camera, Image,
} from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { ValidarRepoBtn, DesactivarRepoBtn } from '../validar-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function RepositoraDetallePage({ params }: { params: { id: string } }) {
  const admin = adminClient()

  const { data: repo, error } = await admin
    .from('repositoras')
    .select('id, razon_social, cuit, validada, created_at, updated_at')
    .eq('id', params.id)
    .single()

  if (error || !repo) notFound()

  // Fixers vinculados con stats
  const { data: fixersRaw } = await admin
    .from('profiles')
    .select('id, alias, nombre, activo, fotos_aprobadas, created_at')
    .eq('repositora_id', params.id)
    .eq('tipo_actor', 'fixer')
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixers = (fixersRaw ?? []) as any[]
  const fixerIds = fixers.map(f => f.id)

  // Fotos totales por fixer y campañas activas fixer
  let fotosMap: Record<string, number> = {}
  let totalFotos = 0
  let totalAprobadas = 0

  if (fixerIds.length > 0) {
    const { data: fotosData } = await admin
      .from('fotos')
      .select('gondolero_id, estado')
      .in('gondolero_id', fixerIds)

    const fotos = (fotosData ?? []) as { gondolero_id: string; estado: string }[]
    totalFotos = fotos.length
    totalAprobadas = fotos.filter(f => f.estado === 'aprobada').length

    fotosMap = fotos.reduce(
      (acc, f) => { acc[f.gondolero_id] = (acc[f.gondolero_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
  }

  // Campañas activas con actor_campana = 'fixer'
  const { data: campanasData } = await admin
    .from('campanas')
    .select('id, nombre, estado, fecha_fin, puntos_por_foto, created_at')
    .eq('actor_campana', 'fixer')
    .eq('estado', 'activa')
    .order('fecha_fin', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanas = (campanasData ?? []) as any[]

  const fechaCreacion = new Date(repo.created_at).toLocaleString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/admin/repositoras" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={15} />
          Repositoras
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{repo.razon_social}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{repo.razon_social}</h1>
            {repo.cuit && (
              <p className="text-sm text-gray-500 font-mono mt-0.5">CUIT: {repo.cuit}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {repo.validada ? (
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 size={14} />
                  <span className="text-xs font-semibold">Validada</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-500">
                  <AlertCircle size={14} />
                  <span className="text-xs font-semibold">Pendiente de validación</span>
                </div>
              )}
              <span className="text-xs text-gray-400">· Registrada {fechaCreacion}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!repo.validada
              ? <ValidarRepoBtn repoId={repo.id} />
              : <DesactivarRepoBtn repoId={repo.id} />
            }
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Fixers vinculados', value: fixers.length, icon: Users, color: 'text-blue-600' },
          { label: 'Campañas fixer activas', value: campanas.length, icon: Camera, color: 'text-purple-600' },
          { label: 'Fotos totales', value: totalFotos, icon: Image, color: 'text-gray-600' },
          { label: 'Fotos aprobadas', value: totalAprobadas, icon: CheckCircle2, color: 'text-green-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={color} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Fixers */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Fixers vinculados</h2>
          <p className="text-xs text-gray-400 mt-0.5">{fixers.length} fixer{fixers.length !== 1 ? 's' : ''}</p>
        </div>
        {fixers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Alias', 'Nombre', 'Fotos totales', 'Aprobadas', 'Estado', 'Registro'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fixers.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-gray-900">{f.alias ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-600">{f.nombre ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-700">{fotosMap[f.id] ?? 0}</td>
                    <td className="px-4 py-3.5 text-gray-700">{f.fotos_aprobadas ?? 0}</td>
                    <td className="px-4 py-3.5">
                      {f.activo ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} /> Activo
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                      {tiempoRelativo(f.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">Sin fixers vinculados aún</p>
        )}
      </div>

      {/* Campañas fixer activas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Campañas activas para fixers</h2>
          <p className="text-xs text-gray-400 mt-0.5">{campanas.length} campaña{campanas.length !== 1 ? 's' : ''} activa{campanas.length !== 1 ? 's' : ''}</p>
        </div>
        {campanas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Campaña', 'Puntos por foto', 'Vence', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campanas.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-gray-900">{c.nombre}</td>
                    <td className="px-4 py-3.5 text-gray-700 font-semibold">{c.puntos_por_foto ?? 0}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                      {c.fecha_fin ? new Date(c.fecha_fin).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/campanas/${c.id}/detalle`}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Ver campaña
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">Sin campañas activas para fixers</p>
        )}
      </div>
    </div>
  )
}
