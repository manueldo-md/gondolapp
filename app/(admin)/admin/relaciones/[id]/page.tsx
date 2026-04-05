/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  ArrowLeft, TrendingUp, Camera, Package, Clock, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react'
import { labelEstadoCampana } from '@/lib/utils'
import type { EstadoCampana } from '@/types'

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

export default async function AdminRelacionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const admin = adminClient()

  const { data: rel } = await admin
    .from('marca_distri_relaciones')
    .select(`
      id, estado, iniciado_por, created_at, updated_at, fecha_fin, fecha_reinicio,
      marca_id, distri_id,
      acepto_tyc_marca, acepto_tyc_distri,
      marca:marcas(razon_social),
      distri:distribuidoras(razon_social)
    `)
    .eq('id', params.id)
    .single()

  if (!rel) notFound()

  const marcaNombre: string  = (Array.isArray(rel.marca) ? rel.marca[0]?.razon_social : (rel.marca as any)?.razon_social) ?? 'Marca'
  const distriNombre: string = (Array.isArray(rel.distri) ? rel.distri[0]?.razon_social : (rel.distri as any)?.razon_social) ?? 'Distribuidora'

  const [campanasRes, reinicioRes] = await Promise.all([
    admin.from('campanas')
      .select('id, nombre, estado, comercios_relevados, objetivo_comercios, created_at')
      .eq('marca_id', rel.marca_id)
      .eq('distri_id', rel.distri_id)
      .order('created_at', { ascending: false }),

    admin.from('relacion_reinicio_solicitudes')
      .select('id, solicitado_por, estado, acepto_tyc, created_at, updated_at')
      .eq('relacion_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  const campanas = (campanasRes.data ?? []) as any[]
  const campanasIds = campanas.map(c => c.id)

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
  const reinicioSols      = (reinicioRes.data ?? []) as any[]

  return (
    <div className="space-y-6 max-w-4xl">

      <div>
        <Link
          href="/admin/relaciones"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={15} />
          Volver a Relaciones
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {marcaNombre} <span className="text-gray-300 mx-2">↔</span> {distriNombre}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Relación marca ↔ distribuidora</p>
          </div>
          <EstadoBadge estado={rel.estado} />
        </div>
      </div>

      {/* Datos de la relación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Datos de la relación</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
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
          <div>
            <dt className="text-gray-500 mb-0.5">Iniciada por</dt>
            <dd className="font-medium text-gray-900 capitalize">{rel.iniciado_por ?? '—'}</dd>
          </div>
          {rel.fecha_fin && (
            <div>
              <dt className="text-gray-500 mb-0.5">Terminada el</dt>
              <dd className="font-medium text-red-600">
                {new Date(rel.fecha_fin).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </dd>
            </div>
          )}
          {rel.fecha_reinicio && (
            <div>
              <dt className="text-gray-500 mb-0.5">Último reinicio</dt>
              <dd className="font-medium text-gray-900">
                {new Date(rel.fecha_reinicio).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500 mb-0.5">TyC Marca</dt>
            <dd>{rel.acepto_tyc_marca
              ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={13} /> Aceptó</span>
              : <span className="flex items-center gap-1 text-gray-400"><XCircle size={13} /> Pendiente</span>
            }</dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-0.5">TyC Distri</dt>
            <dd>{rel.acepto_tyc_distri
              ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={13} /> Aceptó</span>
              : <span className="flex items-center gap-1 text-gray-400"><XCircle size={13} /> Pendiente</span>
            }</dd>
          </div>
        </dl>

        {/* Links a los actores */}
        <div className="flex gap-4 mt-5 pt-4 border-t border-gray-100 text-xs">
          <Link href={`/admin/marcas`} className="text-purple-700 hover:underline font-medium">
            Ver marca →
          </Link>
          <Link href={`/admin/distribuidoras`} className="text-[#1E1B4B] hover:underline font-medium">
            Ver distribuidora →
          </Link>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Package, label: 'Campañas',      value: campanas.length },
          { icon: Package, label: 'En curso',       value: campanasActivas.length },
          { icon: Camera,  label: 'Fotos totales',  value: totalFotos },
          { icon: Camera,  label: 'Aprobadas',      value: fotosAprobadas },
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
          <AdminCampanasTable campanas={campanasActivas} />
        </div>
      )}

      {/* Historial */}
      {campanasHistorial.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Clock size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Historial de campañas</h2>
            <span className="text-xs text-gray-400 ml-auto">{campanasHistorial.length}</span>
          </div>
          <AdminCampanasTable campanas={campanasHistorial} />
        </div>
      )}

      {campanas.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <Package size={24} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sin campañas conjuntas</p>
        </div>
      )}

      {/* Solicitudes de reinicio */}
      {reinicioSols.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <RefreshCw size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Solicitudes de reinicio</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Solicitada por</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">TyC aceptado</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reinicioSols.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900 capitalize">{s.solicitado_por}</td>
                  <td className="px-4 py-3"><SolicitudEstadoBadge estado={s.estado} /></td>
                  <td className="px-4 py-3">
                    {s.acepto_tyc
                      ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 size={12} /> Sí</span>
                      : <span className="text-xs text-gray-400">No</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(s.created_at).toLocaleDateString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AdminCampanasTable({ campanas }: { campanas: any[] }) {
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
                ) : <span className="text-xs text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/campanas/${c.id}`} className="text-xs text-[#1E1B4B] hover:underline font-medium">
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
