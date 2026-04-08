import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, AlertCircle, ArrowLeft, Users, Camera, Image, Coins,
} from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { ValidarDistriBtn } from '../validar-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function DistriDetallePage({ params }: { params: { id: string } }) {
  const admin = adminClient()

  const { data: distri, error } = await admin
    .from('distribuidoras')
    .select('id, razon_social, cuit, validada, tokens_disponibles, created_at')
    .eq('id', params.id)
    .single()

  if (error || !distri) notFound()

  // Gondoleros vinculados con stats
  const { data: gondolerosRaw } = await admin
    .from('profiles')
    .select('id, alias, nombre, activo, fotos_aprobadas, nivel, created_at')
    .eq('distri_id', params.id)
    .eq('tipo_actor', 'gondolero')
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gondoleros = (gondolerosRaw ?? []) as any[]
  const gondoleroIds = gondoleros.map(g => g.id)

  let fotosMap: Record<string, number> = {}
  let totalFotos = 0
  let totalAprobadas = 0

  if (gondoleroIds.length > 0) {
    const { data: fotosData } = await admin
      .from('fotos')
      .select('gondolero_id, estado')
      .in('gondolero_id', gondoleroIds)

    const fotos = (fotosData ?? []) as { gondolero_id: string; estado: string }[]
    totalFotos = fotos.length
    totalAprobadas = fotos.filter(f => f.estado === 'aprobada').length

    fotosMap = fotos.reduce(
      (acc, f) => { acc[f.gondolero_id] = (acc[f.gondolero_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
  }

  // Campañas activas de esta distribuidora
  const { data: campanasData } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_fin, puntos_por_foto, created_at')
    .eq('distri_id', params.id)
    .eq('estado', 'activa')
    .order('fecha_fin', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanas = (campanasData ?? []) as any[]

  const fechaCreacion = new Date(distri.created_at).toLocaleString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/admin/distribuidoras" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={15} />
          Distribuidoras
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{distri.razon_social}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{distri.razon_social}</h1>
            {distri.cuit && (
              <p className="text-sm text-gray-500 font-mono mt-0.5">CUIT: {distri.cuit}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {distri.validada ? (
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
              <div className="flex items-center gap-1.5">
                <Coins size={13} className="text-gondo-amber-400" />
                <span className="text-xs font-semibold text-gray-700">
                  {(distri.tokens_disponibles ?? 0).toLocaleString('es-AR')} tokens
                </span>
              </div>
            </div>
          </div>
          {!distri.validada && (
            <ValidarDistriBtn distriId={distri.id} />
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Gondoleros vinculados', value: gondoleros.length, icon: Users, color: 'text-gondo-amber-400' },
          { label: 'Campañas activas', value: campanas.length, icon: Camera, color: 'text-purple-600' },
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

      {/* Gondoleros */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Gondoleros vinculados</h2>
          <p className="text-xs text-gray-400 mt-0.5">{gondoleros.length} gondolero{gondoleros.length !== 1 ? 's' : ''}</p>
        </div>
        {gondoleros.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Alias', 'Nombre', 'Fotos totales', 'Aprobadas', 'Nivel', 'Estado', 'Registro'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gondoleros.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5">
                      {g.alias ? (
                        <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg">{g.alias}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-gray-900">{g.nombre ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-700">{fotosMap[g.id] ?? 0}</td>
                    <td className="px-4 py-3.5 text-gray-700">{g.fotos_aprobadas ?? 0}</td>
                    <td className="px-4 py-3.5">
                      {g.nivel && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          g.nivel === 'pro' ? 'bg-amber-100 text-amber-700'
                          : g.nivel === 'activo' ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {g.nivel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {g.activo ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} /> Activo
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                      {tiempoRelativo(g.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">Sin gondoleros vinculados aún</p>
        )}
      </div>

      {/* Campañas activas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Campañas activas</h2>
          <p className="text-xs text-gray-400 mt-0.5">{campanas.length} campaña{campanas.length !== 1 ? 's' : ''} activa{campanas.length !== 1 ? 's' : ''}</p>
        </div>
        {campanas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Campaña', 'Tipo', 'Puntos por foto', 'Vence', 'Acciones'].map(h => (
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
                    <td className="px-4 py-3.5 text-xs text-gray-500">{c.tipo ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-700 font-semibold">{c.puntos_por_foto ?? 0}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                      {c.fecha_fin ? new Date(c.fecha_fin).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/campanas/${c.id}/detalle`}
                        className="text-xs text-gondo-amber-400 hover:underline font-medium"
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
          <p className="text-sm text-gray-400 text-center py-10">Sin campañas activas</p>
        )}
      </div>
    </div>
  )
}
