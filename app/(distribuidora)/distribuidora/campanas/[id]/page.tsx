import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera, Clock, MapPin, Target, TrendingUp, User, Users } from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import {
  labelEstadoCampana, colorEstadoCampana,
  labelTipoCampana, calcularPorcentaje,
  diasRestantes, formatearFechaHora, tiempoRelativo,
} from '@/lib/utils'
import type { DeclaracionFoto, EstadoFoto, TipoCampana, EstadoCampana } from '@/types'
import { FotoAcciones } from '../../gondolas/foto-acciones'
import { TabFilter } from './tab-filter'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FotoRow {
  id: string
  url: string | null
  storage_path: string | null
  declaracion: DeclaracionFoto
  estado: EstadoFoto
  precio_detectado: number | null
  precio_confirmado: number | null
  created_at: string
  gondolero: { nombre: string | null; alias: string | null } | null
  comercio:  { nombre: string; direccion: string | null } | null
  bloque:    { instruccion: string | null } | null
  signedUrl: string | null
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

const ESTADO_COLOR: Record<EstadoFoto, string> = {
  pendiente:   'bg-gray-100 text-gray-600',
  aprobada:    'bg-green-100 text-green-700',
  rechazada:   'bg-red-100 text-red-700',
  en_revision: 'bg-blue-100 text-blue-700',
}

const ESTADO_LABEL: Record<EstadoFoto, string> = {
  pendiente:   'Pendiente',
  aprobada:    'Aprobada',
  rechazada:   'Rechazada',
  en_revision: 'En revision',
}

const NIVEL_COLOR: Record<string, string> = {
  casual: 'bg-gray-100 text-gray-600',
  activo: 'bg-blue-100 text-blue-700',
  pro:    'bg-amber-100 text-amber-700',
}
const NIVEL_LABEL: Record<string, string> = { casual: 'Casual', activo: 'Activo', pro: 'Pro' }

const ESTADO_PART_COLOR: Record<string, string> = {
  activa:     'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  abandonada: 'bg-gray-100 text-gray-500',
}
const ESTADO_PART_LABEL: Record<string, string> = {
  activa:     'Activa',
  completada: 'Completada',
  abandonada: 'Abandonada',
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function CampanaDetallePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Campaña
  const { data: campana, error } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_inicio, fecha_fin, objetivo_comercios, comercios_relevados, puntos_por_foto, instruccion, financiada_por, min_comercios_para_cobrar, distri_id, marca:marcas(razon_social)')
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()

  // Gondoleros participando
  const { data: partData } = await admin
    .from('participaciones')
    .select('id, estado, comercios_completados, puntos_acumulados, joined_at, gondolero:profiles(nombre, alias, nivel)')
    .eq('campana_id', params.id)
    .order('joined_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participaciones = ((partData ?? []) as any[]).map((p: any) => ({
    ...p,
    gondolero: Array.isArray(p.gondolero) ? (p.gondolero[0] ?? null) : p.gondolero,
  }))

  // Fotos con filtro de tab
  const tab = searchParams.tab ?? ''
  let query = admin
    .from('fotos')
    .select('id, url, storage_path, declaracion, estado, precio_detectado, precio_confirmado, created_at, gondolero:profiles(nombre, alias), comercio:comercios(nombre, direccion), bloque:bloques_foto(instruccion)')
    .eq('campana_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (tab) query = query.eq('estado', tab as EstadoFoto)

  const { data: fotosData } = await query

  // Signed URLs en paralelo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos: FotoRow[] = await Promise.all(
    ((fotosData ?? []) as any[]).map(async (f: any) => {
      let signedUrl: string | null = null
      if (f.storage_path) {
        const { data: signed } = await admin.storage
          .from('fotos-gondola')
          .createSignedUrl(f.storage_path, 3600)
        signedUrl = signed?.signedUrl ?? null
      }
      return { ...f, signedUrl: signedUrl ?? f.url ?? null }
    })
  )

  const progreso   = calcularPorcentaje(campana.comercios_relevados, campana.objetivo_comercios ?? 0)
  const dias       = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null
  const esPropia   = campana.financiada_por === 'distri'
  const colorBarra = esPropia ? 'bg-gondo-amber-400' : 'bg-gondo-indigo-600'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marcaNombre = Array.isArray((campana as any).marca)
    ? ((campana as any).marca[0]?.razon_social ?? null)
    : ((campana as any).marca?.razon_social ?? null)

  // Conteos por estado para el header de tabs
  const { data: conteos } = await admin
    .from('fotos')
    .select('estado')
    .eq('campana_id', params.id)

  const counts = (conteos ?? []).reduce((acc: Record<string, number>, f: { estado: string }) => {
    acc[f.estado] = (acc[f.estado] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const fotosAprobadas = counts['aprobada'] ?? 0
  const totalPuntos = (campana.puntos_por_foto ?? 0) * fotosAprobadas
  const costoPorFoto = fotosAprobadas > 0 ? campana.puntos_por_foto ?? 0 : null
  const gondolerosActivos = participaciones.filter((p: any) => p.estado === 'activa').length

  // Otras campañas de esta distribuidora
  const campanaDistriId = (campana as any).distri_id ?? null
  const { data: otrasDistriData } = campanaDistriId ? await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, comercios_relevados, objetivo_comercios, fecha_fin')
    .eq('distri_id', campanaDistriId)
    .neq('id', params.id)
    .order('created_at', { ascending: false })
    .limit(6)
    : { data: null }
  const otrasCampanas = (otrasDistriData ?? []) as any[]

  return (
    <div>
      {/* Back */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/distribuidora/campanas"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <h2 className="text-xl font-bold text-gray-900 truncate">{campana.nombre}</h2>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              esPropia ? 'bg-gondo-amber-50 text-gondo-amber-400' : 'bg-gondo-indigo-50 text-gondo-indigo-600'
            }`}>
              {labelTipoCampana(campana.tipo as TipoCampana)}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(campana.estado as EstadoCampana)}`}>
              {labelEstadoCampana(campana.estado as EstadoCampana)}
            </span>
            {marcaNombre && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                {marcaNombre}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400">Puntos/foto</p>
            <p className="text-sm font-bold text-gray-900">{campana.puntos_por_foto}</p>
          </div>
        </div>

        {campana.instruccion && (
          <p className="text-sm text-gray-600 mb-4">{campana.instruccion}</p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-5 text-xs text-gray-500 mb-4">
          {dias !== null && (
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span className={dias <= 3 ? 'text-red-500 font-medium' : ''}>
                {dias === 0 ? 'Ultimo dia' : `${dias} dias restantes`}
              </span>
            </div>
          )}
          {campana.objetivo_comercios && (
            <div className="flex items-center gap-1">
              <Target size={12} />
              <span>{campana.comercios_relevados} / {campana.objetivo_comercios} comercios</span>
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        {campana.objetivo_comercios && campana.objetivo_comercios > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Avance</span>
              <span>{progreso}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${colorBarra}`}
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>
        )}

        {/* Grid de 4 métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {[
            { label: 'Fotos totales',   value: Object.values(counts).reduce((a, b) => a + b, 0) },
            { label: 'Aprobadas',       value: counts['aprobada']  ?? 0, color: 'text-green-600' },
            { label: 'Pendientes',      value: counts['pendiente'] ?? 0, color: 'text-amber-600' },
            { label: 'Gondoleros',      value: participaciones.length },
          ].map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className={`text-2xl font-bold ${m.color ?? 'text-gray-900'}`}>{m.value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gondoleros participando */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Users size={14} className="text-gray-400" />
          Gondoleros participando ({participaciones.length})
        </h3>
        {participaciones.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Todavía nadie se unió a esta campaña.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {participaciones.map((p: {
              id: string
              estado: string
              comercios_completados: number
              puntos_acumulados: number
              joined_at: string
              gondolero: { nombre: string | null; alias: string | null; nivel: string } | null
            }) => (
              <div key={p.id} className="flex items-center justify-between py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-gray-500">
                      {(p.gondolero?.alias ?? p.gondolero?.nombre ?? '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.gondolero?.alias ?? p.gondolero?.nombre ?? 'Gondolero'}
                      </p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${NIVEL_COLOR[p.gondolero?.nivel ?? 'casual']}`}>
                        {NIVEL_LABEL[p.gondolero?.nivel ?? 'casual']}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {p.comercios_completados}/{campana.min_comercios_para_cobrar ?? '?'} comercios
                      {' · '}{p.puntos_acumulados.toLocaleString('es-AR')} pts
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_PART_COLOR[p.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {ESTADO_PART_LABEL[p.estado] ?? p.estado}
                  </span>
                  <p className="text-[10px] text-gray-400">{tiempoRelativo(p.joined_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Métricas de la campaña */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <TrendingUp size={14} />
          Métricas
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Puntos entregados', value: totalPuntos.toLocaleString('es-AR'), color: 'text-gondo-amber-400' },
            { label: 'Costo por foto', value: costoPorFoto !== null ? `${costoPorFoto} pts` : '—', color: 'text-gray-900' },
            { label: 'Fotos aprobadas', value: (counts['aprobada'] ?? 0).toString(), color: 'text-green-600' },
            { label: 'Gondoleros activos', value: gondolerosActivos.toString(), color: 'text-blue-600' },
          ].map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <TabFilter tabActivo={tab} counts={counts} />
        <p className="text-sm text-gray-500">
          {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
          {tab ? ` ${ESTADO_LABEL[tab as EstadoFoto]?.toLowerCase() ?? tab}` : ' en total'}
        </p>
      </div>

      {/* Grid */}
      {fotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <Camera size={32} className="text-gray-300 mb-4" />
          <p className="text-sm text-gray-400">
            {tab ? `No hay fotos ${ESTADO_LABEL[tab as EstadoFoto]?.toLowerCase() ?? tab}s.` : 'Todavia no hay fotos en esta campana.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {fotos.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">

              {/* Imagen */}
              <FotoLightbox
                src={f.signedUrl}
                alt={`Foto de ${(f.comercio as { nombre: string } | null)?.nombre ?? 'comercio'}`}
                containerClassName="relative w-full h-52 shrink-0"
              >
                <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[f.estado]}`}>
                  {ESTADO_LABEL[f.estado]}
                </span>
              </FotoLightbox>

              {/* Datos */}
              <div className="p-4 flex-1 flex flex-col gap-2.5">
                <div className="flex items-start gap-2">
                  <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {(f.comercio as { nombre: string } | null)?.nombre ?? 'Comercio desconocido'}
                    </p>
                    {(f.comercio as { nombre: string; direccion: string | null } | null)?.direccion && (
                      <p className="text-xs text-gray-400 truncate">
                        {(f.comercio as { nombre: string; direccion: string | null }).direccion}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User size={13} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-600 truncate">
                      {(f.gondolero as { nombre: string | null; alias: string | null } | null)?.alias
                        ?? (f.gondolero as { nombre: string | null; alias: string | null } | null)?.nombre
                        ?? 'Gondolero'}
                    </span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${DECL_COLOR[f.declaracion]}`}>
                    {DECL_LABEL[f.declaracion]}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
                  {f.precio_confirmado != null && (
                    <span className="text-xs font-medium text-gray-600">
                      💲 ${f.precio_confirmado}
                      {(f.bloque as { instruccion: string | null } | null)?.instruccion && (
                        <span className="text-gray-400 font-normal"> · {(f.bloque as { instruccion: string | null }).instruccion}</span>
                      )}
                    </span>
                  )}
                  {f.precio_confirmado == null && <span />}
                  <div className="flex items-center gap-1">
                    <Clock size={11} />
                    <span>{formatearFechaHora(f.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Acciones solo en pendientes */}
              {f.estado === 'pendiente' && (
                <div className="px-4 pb-4 shrink-0">
                  <FotoAcciones fotoId={f.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mis otras campañas */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Mis otras campañas
        </h3>
        {otrasCampanas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Esta es la única campaña activa.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {otrasCampanas.map((oc: any) => {
              const ocDias = oc.fecha_fin ? diasRestantes(oc.fecha_fin) : null
              return (
                <div key={oc.id} className="flex items-center justify-between py-3 gap-3">
                  <Link href={`/distribuidora/campanas/${oc.id}`} className="text-sm font-medium text-gray-900 hover:text-gondo-amber-400 truncate">
                    {oc.nombre}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {oc.objetivo_comercios && (
                      <span className="text-xs text-gray-400">{oc.comercios_relevados}/{oc.objetivo_comercios}</span>
                    )}
                    {ocDias !== null && (
                      <span className={`text-xs ${ocDias <= 3 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{ocDias}d</span>
                    )}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${colorEstadoCampana(oc.estado as EstadoCampana)}`}>
                      {labelEstadoCampana(oc.estado as EstadoCampana)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
