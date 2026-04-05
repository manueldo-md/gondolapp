/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  ArrowLeft, Calendar, TrendingUp, Camera, Package, Clock, RefreshCw,
} from 'lucide-react'
import { labelEstadoCampana, colorEstadoCampana } from '@/lib/utils'
import type { EstadoCampana } from '@/types'
import { ReiniciarRelacionBtnMarca } from '../reiniciar-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function calcularDuracion(start: string, end?: string | null): string {
  const desde = new Date(start)
  const hasta = end ? new Date(end) : new Date()
  const meses = Math.floor((hasta.getTime() - desde.getTime()) / (30 * 24 * 60 * 60 * 1000))
  if (meses < 1) return 'menos de 1 mes'
  if (meses === 1) return '1 mes'
  if (meses < 12) return `${meses} meses`
  const años = Math.floor(meses / 12)
  const resto = meses % 12
  if (resto === 0) return `${años} año${años > 1 ? 's' : ''}`
  return `${años} año${años > 1 ? 's' : ''} y ${resto} mes${resto > 1 ? 'es' : ''}`
}

const ESTADO_COLOR: Record<string, string> = {
  activa:               'bg-green-50 text-green-700',
  pendiente_aprobacion: 'bg-amber-50 text-amber-700',
  pausada:              'bg-gray-100 text-gray-500',
  cerrada:              'bg-blue-50 text-blue-700',
  cancelada:            'bg-red-50 text-red-500',
  borrador:             'bg-gray-100 text-gray-400',
}

export default async function MarcaRelacionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles').select('marca_id').eq('id', user.id).single()
  if (!profile?.marca_id) redirect('/marca/perfil')

  // Fetch relacion (only if belongs to this marca)
  const { data: rel } = await admin
    .from('marca_distri_relaciones')
    .select(`
      id, estado, iniciado_por, created_at, updated_at, fecha_fin, fecha_reinicio,
      marca_id, distri_id,
      distri:distribuidoras(razon_social),
      marca:marcas(razon_social)
    `)
    .eq('id', params.id)
    .eq('marca_id', profile.marca_id)
    .single()

  if (!rel) notFound()

  const distriNombre: string = (Array.isArray(rel.distri) ? rel.distri[0]?.razon_social : (rel.distri as any)?.razon_social) ?? 'Distribuidora'
  const marcaNombre: string  = (Array.isArray(rel.marca)  ? rel.marca[0]?.razon_social  : (rel.marca as any)?.razon_social)  ?? 'Marca'

  // Campañas conjuntas + reinicio solicitudes — en paralelo
  const [campanasRes, reinicioRes] = await Promise.all([
    admin.from('campanas')
      .select('id, nombre, estado, comercios_relevados, objetivo_comercios, created_at, fecha_inicio, fecha_fin')
      .eq('marca_id', rel.marca_id)
      .eq('distri_id', rel.distri_id)
      .order('created_at', { ascending: false }),

    admin.from('relacion_reinicio_solicitudes')
      .select('id, solicitado_por, estado, created_at')
      .eq('relacion_id', params.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const campanas = (campanasRes.data ?? []) as any[]
  const campanasIds = campanas.map(c => c.id)

  // Métricas: fotos + puntos
  let totalFotos = 0, fotosAprobadas = 0, totalPuntos = 0
  if (campanasIds.length > 0) {
    const [fotosCountRes, fotosAprobRes, partRes] = await Promise.all([
      admin.from('fotos').select('id', { count: 'exact', head: true }).in('campana_id', campanasIds),
      admin.from('fotos').select('id', { count: 'exact', head: true }).in('campana_id', campanasIds).eq('estado', 'aprobada'),
      admin.from('participaciones').select('puntos_acumulados').in('campana_id', campanasIds),
    ])
    totalFotos     = fotosCountRes.count ?? 0
    fotosAprobadas = fotosAprobRes.count ?? 0
    totalPuntos    = ((partRes.data ?? []) as any[]).reduce((s: number, p: any) => s + (p.puntos_acumulados ?? 0), 0)
  }

  const campanasActivas   = campanas.filter(c => ['activa', 'pendiente_aprobacion', 'pausada', 'borrador'].includes(c.estado))
  const campanasHistorial = campanas.filter(c => ['cerrada', 'cancelada'].includes(c.estado))

  // Solicitudes de reinicio
  const reinicioSols = (reinicioRes.data ?? []) as any[]
  const solicitudPendiente = reinicioSols.find(s => s.estado === 'pendiente')
  const ultimaSolicitud    = reinicioSols[0]

  // ¿Hay solicitud pendiente enviada por la MARCA (para mostrar "pendiente" en el botón)?
  const solEnviadaPorMarca = solicitudPendiente?.solicitado_por === 'marca' ? 'pendiente' as const
    : ultimaSolicitud?.solicitado_por === 'marca' && ultimaSolicitud?.estado === 'rechazada' ? 'rechazada' as const
    : null

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Back */}
      <div>
        <Link
          href="/marca/distribuidoras"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={15} />
          Volver a Distribuidoras
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{distriNombre}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Relación con {marcaNombre}</p>
          </div>
          <div className="flex items-center gap-2">
            <EstadoBadge estado={rel.estado} />
          </div>
        </div>
      </div>

      {/* Resumen de la relación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Relación</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-gray-500 mb-0.5">Inicio</dt>
            <dd className="font-medium text-gray-900">
              {new Date(rel.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-0.5">Duración total</dt>
            <dd className="font-medium text-gray-900">{calcularDuracion(rel.created_at)}</dd>
          </div>
          {rel.fecha_reinicio && (
            <div>
              <dt className="text-gray-500 mb-0.5">Último reinicio</dt>
              <dd className="font-medium text-gray-900">
                {new Date(rel.fecha_reinicio).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </dd>
            </div>
          )}
          {rel.estado === 'terminada' && rel.fecha_fin && (
            <div>
              <dt className="text-gray-500 mb-0.5">Terminada el</dt>
              <dd className="font-medium text-red-600">
                {new Date(rel.fecha_fin).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500 mb-0.5">Iniciada por</dt>
            <dd className="font-medium text-gray-900 capitalize">{rel.iniciado_por ?? '—'}</dd>
          </div>
        </dl>

        {rel.estado === 'terminada' && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <ReiniciarRelacionBtnMarca
              relacionId={rel.id}
              distriNombre={distriNombre}
              solicitudEstado={solEnviadaPorMarca}
            />
          </div>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Package, label: 'Campañas', value: campanas.length },
          { icon: Package, label: 'En curso',  value: campanasActivas.length },
          { icon: Camera,  label: 'Fotos totales', value: totalFotos },
          { icon: Camera,  label: 'Aprobadas', value: fotosAprobadas },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className="text-gray-400" />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value.toLocaleString('es-AR')}</p>
          </div>
        ))}
      </div>

      {/* Campañas en curso */}
      {campanasActivas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <TrendingUp size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Campañas en curso</h2>
          </div>
          <CampanasTable campanas={campanasActivas} />
        </div>
      )}

      {/* Historial de campañas */}
      {campanasHistorial.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Clock size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Historial de campañas</h2>
            <span className="text-xs text-gray-400 ml-auto">{campanasHistorial.length} cerradas</span>
          </div>
          <CampanasTable campanas={campanasHistorial} />
        </div>
      )}

      {campanas.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <Package size={24} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sin campañas conjuntas aún</p>
        </div>
      )}

      {/* Historial de solicitudes de reinicio */}
      {reinicioSols.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <RefreshCw size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Solicitudes de reinicio</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {reinicioSols.map((s: any) => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-600">Solicitada por <strong className="capitalize">{s.solicitado_por}</strong></span>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(s.created_at).toLocaleDateString('es-AR')}
                  </span>
                </div>
                <SolicitudEstadoBadge estado={s.estado} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CampanasTable({ campanas }: { campanas: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100">
          <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Campaña</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
          <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Avance</th>
          <th className="px-4 py-2.5"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {campanas.map((c: any) => {
          const progreso = c.objetivo_comercios
            ? Math.round((c.comercios_relevados / c.objetivo_comercios) * 100)
            : null
          return (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-5 py-3 font-medium text-gray-900">{c.nombre}</td>
              <td className="px-4 py-3">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[c.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                  {labelEstadoCampana(c.estado as EstadoCampana)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {progreso !== null ? (
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min(progreso, 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-600 w-8 text-right">{progreso}%</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/marca/campanas/${c.id}`}
                  className="text-xs text-[#1E1B4B] hover:underline font-medium"
                >
                  Ver →
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
    activa:    'bg-green-50 text-green-700 border border-green-200',
    pausada:   'bg-gray-100 text-gray-500',
    terminada: 'bg-red-50 text-red-500 border border-red-200',
  }
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${colors[estado] ?? 'bg-gray-100 text-gray-500'}`}>
      {estado}
    </span>
  )
}

function SolicitudEstadoBadge({ estado }: { estado: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    pendiente: { label: 'Pendiente',  className: 'bg-amber-50 text-amber-700' },
    aceptada:  { label: 'Aceptada',   className: 'bg-green-50 text-green-700' },
    rechazada: { label: 'Rechazada',  className: 'bg-red-50 text-red-500' },
  }
  const { label, className } = cfg[estado] ?? { label: estado, className: 'bg-gray-100 text-gray-500' }
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${className}`}>{label}</span>
}
