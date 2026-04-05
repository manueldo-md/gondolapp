/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  ArrowLeft, Calendar, Target, Camera, MapPin, AlertCircle,
  Users, Building2, Package, TrendingUp,
} from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import {
  labelEstadoCampana,
  colorEstadoCampana,
  labelTipoCampana,
  diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana, FinanciadaPor } from '@/types'
import { CampanaAccionesAdmin } from '../campana-acciones'

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
  activa: 'Activa', completada: 'Completada', abandonada: 'Abandonada',
}

const FOTO_ESTADO_COLOR: Record<string, string> = {
  pendiente:   'bg-gray-100 text-gray-600',
  aprobada:    'bg-green-100 text-green-700',
  rechazada:   'bg-red-100 text-red-700',
  en_revision: 'bg-blue-100 text-blue-700',
}
const FOTO_ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pend', aprobada: 'OK', rechazada: 'Rej', en_revision: 'Rev',
}

export default async function CampanaAdminDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const admin = adminClient()

  // ── Round 1: parallel queries ──────────────────────────────────────────────
  const [campanaRes, partDataRes, fotosGridRes, fotosCuentaRes] = await Promise.all([
    admin.from('campanas').select(`
      id, nombre, tipo, estado, financiada_por, via_ejecucion, motivo_rechazo,
      marca_id, distri_id,
      fecha_inicio, fecha_fin, fecha_limite_inscripcion,
      objetivo_comercios, tope_total_comercios, comercios_relevados,
      max_comercios_por_gondolero, min_comercios_para_cobrar,
      puntos_por_foto, instruccion, nivel_minimo, es_abierta, presupuesto_tokens,
      created_at,
      marca:marcas ( razon_social ),
      distri:distribuidoras ( razon_social ),
      bloques_foto ( id, orden, instruccion, tipo_contenido,
        bloque_campos ( id, orden, tipo, pregunta, opciones, obligatorio )
      ),
      campana_zonas ( zona_id, zonas ( nombre ) )
    `).eq('id', params.id).single(),

    admin.from('participaciones')
      .select('id, estado, comercios_completados, puntos_acumulados, joined_at, gondolero:profiles(id, nombre, alias, nivel, distri_id, distri:distribuidoras(razon_social))')
      .eq('campana_id', params.id)
      .order('joined_at', { ascending: false }),

    admin.from('fotos')
      .select('id, storage_path, url, estado')
      .eq('campana_id', params.id)
      .order('created_at', { ascending: false })
      .limit(72),

    admin.from('fotos')
      .select('estado')
      .eq('campana_id', params.id),
  ])

  if (campanaRes.error || !campanaRes.data) notFound()

  const campana = campanaRes.data as any

  // ── Round 2: parallel queries that depend on campana ──────────────────────
  const [fotosConUrl, otrasMarcaRes, otrasDistriRes, gondDistriCountRes] = await Promise.all([
    // Generate signed URLs in parallel for thumbnail grid
    Promise.all(
      ((fotosGridRes.data ?? []) as any[]).map(async (f: any) => {
        let signedUrl: string | null = null
        if (f.storage_path) {
          const { data: signed } = await admin.storage
            .from('fotos-gondola')
            .createSignedUrl(f.storage_path, 3600)
          signedUrl = signed?.signedUrl ?? null
        }
        return { ...f, signedUrl: signedUrl ?? f.url ?? null }
      })
    ),

    // Otras campañas de la misma marca
    campana.marca_id
      ? admin.from('campanas')
          .select('id, nombre, estado, comercios_relevados, objetivo_comercios')
          .eq('marca_id', campana.marca_id)
          .neq('id', params.id)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null, count: null }),

    // Otras campañas de la misma distribuidora
    campana.distri_id
      ? admin.from('campanas')
          .select('id, nombre, estado, comercios_relevados, objetivo_comercios')
          .eq('distri_id', campana.distri_id)
          .neq('id', params.id)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),

    // Total gondoleros activos de esa distri
    campana.distri_id
      ? admin.from('gondolero_distri_solicitudes')
          .select('gondolero_id', { count: 'exact', head: true })
          .eq('distri_id', campana.distri_id)
          .eq('estado', 'aprobada')
      : Promise.resolve({ count: null }),
  ])

  // ── Derived data ──────────────────────────────────────────────────────────

  const marcaNombre = Array.isArray(campana.marca)
    ? campana.marca[0]?.razon_social
    : campana.marca?.razon_social
  const distriNombre = Array.isArray(campana.distri)
    ? campana.distri[0]?.razon_social
    : campana.distri?.razon_social

  const bloques = (campana.bloques_foto ?? []).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
  const zonas = (campana.campana_zonas ?? [])
    .map((cz: any) => Array.isArray(cz.zonas) ? cz.zonas[0]?.nombre : cz.zonas?.nombre)
    .filter(Boolean)

  const fp = (campana.financiada_por ?? 'gondolapp') as FinanciadaPor
  const badge = FINANCIADO_BADGE[fp] ?? FINANCIADO_BADGE.gondolapp
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null
  const progreso = campana.objetivo_comercios
    ? Math.round((campana.comercios_relevados / campana.objetivo_comercios) * 100)
    : null

  // Participaciones with normalized gondolero shape
  const participaciones = ((partDataRes.data ?? []) as any[]).map((p: any) => ({
    ...p,
    gondolero: Array.isArray(p.gondolero) ? (p.gondolero[0] ?? null) : p.gondolero,
  }))

  // Foto counts by estado
  const counts = ((fotosCuentaRes.data ?? []) as any[]).reduce(
    (acc: Record<string, number>, f: any) => {
      acc[f.estado] = (acc[f.estado] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  // Group gondoleros by distri
  const distriMap = new Map<string, { nombre: string; gondoleros: number; puntos: number }>()
  for (const p of participaciones) {
    const distri = p.gondolero?.distri_id
      ? {
          id: p.gondolero.distri_id,
          nombre: Array.isArray(p.gondolero.distri)
            ? p.gondolero.distri[0]?.razon_social ?? 'Distribuidora'
            : p.gondolero.distri?.razon_social ?? 'Distribuidora',
        }
      : null
    const key = distri?.id ?? '__independiente__'
    const entry = distriMap.get(key) ?? {
      nombre: distri?.nombre ?? 'Independiente',
      gondoleros: 0,
      puntos: 0,
    }
    entry.gondoleros += 1
    entry.puntos += p.puntos_acumulados ?? 0
    distriMap.set(key, entry)
  }
  const distrisParticipantes = Array.from(distriMap.values()).sort(
    (a, b) => b.gondoleros - a.gondoleros
  )

  // Métricas financieras
  const totalPuntos = participaciones.reduce(
    (sum: number, p: any) => sum + (p.puntos_acumulados ?? 0), 0
  )
  const fotosAprobadas = counts['aprobada'] ?? 0
  const costoPorFoto = fotosAprobadas > 0 ? Math.round(totalPuntos / fotosAprobadas) : null
  const gondolerosActivos = participaciones.filter((p: any) => p.estado === 'activa').length

  const otrasMarca = (otrasMarcaRes.data ?? []) as any[]
  const otrasDistri = (otrasDistriRes.data ?? []) as any[]
  const gondDistriCount = (gondDistriCountRes as any).count as number | null

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Back + header ─────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/admin/campanas"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={15} />
          Volver a Campañas
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{campana.nombre}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(campana.estado as EstadoCampana)}`}>
                {labelEstadoCampana(campana.estado as EstadoCampana)}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {labelTipoCampana(campana.tipo as TipoCampana)}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
                {badge.label}
              </span>
              {campana.via_ejecucion && campana.via_ejecucion !== 'distribuidora' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1E1B4B]/10 text-[#1E1B4B]">
                  Vía {campana.via_ejecucion === 'gondolapp' ? 'GondolApp' : campana.via_ejecucion}
                </span>
              )}
              {campana.es_abierta && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  Abierta
                </span>
              )}
            </div>
          </div>
          <CampanaAccionesAdmin campanaId={campana.id} estadoActual={campana.estado} />
        </div>
      </div>

      {/* ── Motivo de rechazo ─────────────────────────────────────────────── */}
      {campana.motivo_rechazo && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Motivo de rechazo</p>
            <p className="text-sm text-red-700 mt-0.5">{campana.motivo_rechazo}</p>
          </div>
        </div>
      )}

      {/* ── Información de origen ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Origen
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-gray-500 mb-0.5">Creada el</dt>
            <dd className="font-medium text-gray-900">
              {new Date(campana.created_at).toLocaleDateString('es-AR', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}
              <span className="block text-xs text-gray-400 font-normal">
                {new Date(campana.created_at).toLocaleTimeString('es-AR', {
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-0.5">Creada por</dt>
            <dd className="font-medium text-gray-900">
              {campana.marca_id
                ? (marcaNombre ?? 'Marca')
                : campana.distri_id
                  ? (distriNombre ?? 'Distribuidora')
                  : 'GondolApp'
              }
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-0.5">Vía de ejecución</dt>
            <dd className="font-medium text-gray-900">
              {campana.via_ejecucion === 'distribuidora'
                ? 'Distribuidora'
                : campana.via_ejecucion === 'gondolapp'
                  ? 'GondolApp'
                  : campana.via_ejecucion ?? '—'
              }
            </dd>
          </div>
          {campana.distri_id ? (
            <div>
              <dt className="text-gray-500 mb-0.5">Distribuidora</dt>
              <dd>
                <Link
                  href={`/admin/distribuidoras/${campana.distri_id}`}
                  className="font-medium text-[#1E1B4B] hover:underline"
                >
                  {distriNombre ?? 'Ver distribuidora'}
                </Link>
              </dd>
            </div>
          ) : campana.marca_id ? (
            <div>
              <dt className="text-gray-500 mb-0.5">Marca</dt>
              <dd>
                <Link
                  href={`/admin/marcas/${campana.marca_id}`}
                  className="font-medium text-purple-700 hover:underline"
                >
                  {marcaNombre ?? 'Ver marca'}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* ── Info general + Fechas y avance ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Info general */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Información general
          </h2>
          <dl className="space-y-2.5 text-sm">
            {marcaNombre && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Marca</dt>
                <dd className="font-medium text-gray-900">{marcaNombre}</dd>
              </div>
            )}
            {distriNombre && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Distribuidora</dt>
                <dd className="font-medium text-gray-900">{distriNombre}</dd>
              </div>
            )}
            {campana.nivel_minimo && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Nivel mínimo</dt>
                <dd className="font-medium text-gray-900 capitalize">{campana.nivel_minimo}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Puntos por foto</dt>
              <dd className="font-semibold text-[#1D9E75]">{campana.puntos_por_foto} pts</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Mín. comercios para cobrar</dt>
              <dd className="font-medium text-gray-900">{campana.min_comercios_para_cobrar}</dd>
            </div>
            {campana.max_comercios_por_gondolero && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Máx. comercios / gondolero</dt>
                <dd className="font-medium text-gray-900">{campana.max_comercios_por_gondolero}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Fechas y avance */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Fechas y avance
          </h2>
          <dl className="space-y-2.5 text-sm">
            {campana.fecha_inicio && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Calendar size={13} /> Inicio
                </dt>
                <dd className="font-medium text-gray-900">{campana.fecha_inicio}</dd>
              </div>
            )}
            {campana.fecha_fin && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Calendar size={13} /> Fin
                </dt>
                <dd className={`font-medium ${dias !== null && dias <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                  {campana.fecha_fin}{dias !== null ? ` (${dias}d)` : ''}
                </dd>
              </div>
            )}
            {campana.fecha_limite_inscripcion && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Calendar size={13} /> Límite inscripción
                </dt>
                <dd className="font-medium text-gray-900">{campana.fecha_limite_inscripcion}</dd>
              </div>
            )}
            {campana.objetivo_comercios && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Target size={13} /> Objetivo
                </dt>
                <dd className="font-medium text-gray-900">
                  {campana.comercios_relevados}/{campana.objetivo_comercios}
                  {progreso !== null ? ` (${progreso}%)` : ''}
                </dd>
              </div>
            )}
            {campana.tope_total_comercios && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Tope total</dt>
                <dd className="font-medium text-gray-900">{campana.tope_total_comercios}</dd>
              </div>
            )}
          </dl>

          {progreso !== null && (
            <div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#1D9E75] h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(progreso, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Zonas ─────────────────────────────────────────────────────────── */}
      {zonas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <MapPin size={14} /> Zonas
          </h2>
          <div className="flex flex-wrap gap-2">
            {zonas.map((zona: string, i: number) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 bg-gondo-verde-50 text-gondo-verde-600 rounded-full font-medium border border-gondo-verde-100"
              >
                {zona}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Instrucción general ───────────────────────────────────────────── */}
      {campana.instruccion && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Instrucción general
          </h2>
          <p className="text-sm text-gray-700 whitespace-pre-line">{campana.instruccion}</p>
        </div>
      )}

      {/* ── Bloques de foto ───────────────────────────────────────────────── */}
      {bloques.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Camera size={14} /> Bloques de foto ({bloques.length})
          </h2>
          <div className="space-y-4">
            {bloques.map((bloque: any, idx: number) => (
              <div key={bloque.id} className="border border-gray-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">
                    Bloque {bloque.orden ?? idx + 1}
                  </span>
                  {bloque.tipo_contenido && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium capitalize">
                      {bloque.tipo_contenido}
                    </span>
                  )}
                </div>
                {bloque.instruccion && (
                  <p className="text-sm text-gray-700">{bloque.instruccion}</p>
                )}
                {bloque.bloque_campos?.length > 0 && (
                  <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-gray-100">
                    <p className="text-xs font-semibold text-gray-400">Campos</p>
                    {bloque.bloque_campos
                      .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
                      .map((campo: any) => (
                        <div key={campo.id} className="text-xs text-gray-600">
                          <span className="font-medium">{campo.pregunta}</span>
                          {campo.tipo && (
                            <span className="ml-1.5 text-gray-400">({campo.tipo})</span>
                          )}
                          {campo.obligatorio && (
                            <span className="ml-1.5 text-red-400">*</span>
                          )}
                          {campo.opciones?.length > 0 && (
                            <span className="ml-1.5 text-gray-400">
                              — {Array.isArray(campo.opciones) ? campo.opciones.join(', ') : campo.opciones}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7. FOTOS / GÓNDOLAS ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <Camera size={14} /> Fotos capturadas
          {(fotosCuentaRes.data?.length ?? 0) > 0 && (
            <span className="ml-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {fotosCuentaRes.data?.length ?? 0}
            </span>
          )}
        </h2>

        {/* Counter row */}
        {(fotosCuentaRes.data?.length ?? 0) > 0 && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {(counts['aprobada'] ?? 0) > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                {counts['aprobada']} aprobadas
              </span>
            )}
            {(counts['pendiente'] ?? 0) > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {counts['pendiente']} pendientes
              </span>
            )}
            {(counts['rechazada'] ?? 0) > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {counts['rechazada']} rechazadas
              </span>
            )}
            {(counts['en_revision'] ?? 0) > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {counts['en_revision']} en revisión
              </span>
            )}
          </div>
        )}

        {/* Thumbnail grid */}
        {fotosConUrl.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {fotosConUrl.map((foto: any) => (
              <div key={foto.id} className="relative h-20 rounded-lg overflow-hidden bg-gray-100">
                {foto.signedUrl ? (
                  <FotoLightbox
                    src={foto.signedUrl}
                    alt={`Foto ${foto.id}`}
                    containerClassName="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera size={20} className="text-gray-300" />
                  </div>
                )}
                {/* Estado badge overlay */}
                {foto.estado && (
                  <span
                    className={`absolute top-1 right-1 text-[9px] font-semibold px-1 py-0.5 rounded ${FOTO_ESTADO_COLOR[foto.estado] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {FOTO_ESTADO_LABEL[foto.estado] ?? foto.estado}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Camera size={28} className="mb-2 opacity-40" />
            <p className="text-sm">Todavía no hay fotos en esta campaña.</p>
          </div>
        )}
      </div>

      {/* ── 8. DISTRIBUIDORAS PARTICIPANTES ──────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <Building2 size={14} /> Distribuidoras participantes
        </h2>

        {distrisParticipantes.length > 0 ? (
          <div className="space-y-2">
            {distrisParticipantes.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm"
              >
                <span className="font-medium text-gray-900">{d.nombre}</span>
                <div className="flex items-center gap-4 text-gray-500">
                  <span>{d.gondoleros} gondolero{d.gondoleros !== 1 ? 's' : ''}</span>
                  <span className="font-semibold text-[#1D9E75]">{d.puntos} pts</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Sin distribuidoras vinculadas a esta campaña.</p>
        )}
      </div>

      {/* ── 9. GONDOLEROS ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <Users size={14} /> Gondoleros
          {participaciones.length > 0 && (
            <span className="ml-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {participaciones.length}
            </span>
          )}
        </h2>

        {participaciones.length > 0 ? (
          <div className="space-y-2">
            {participaciones.map((p: any) => {
              const g = p.gondolero
              const displayName = g?.alias ?? g?.nombre ?? 'Gondolero'
              const initial = displayName.charAt(0).toUpperCase()
              const nivel = g?.nivel ?? 'casual'
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-[#1E1B4B]/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[#1E1B4B]">{initial}</span>
                  </div>

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {displayName}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${NIVEL_COLOR[nivel] ?? 'bg-gray-100 text-gray-600'}`}>
                        {NIVEL_LABEL[nivel] ?? nivel}
                      </span>
                      {p.estado && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_PART_COLOR[p.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                          {ESTADO_PART_LABEL[p.estado] ?? p.estado}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                    <span>{p.comercios_completados ?? 0} comercios</span>
                    <span className="font-semibold text-[#1D9E75]">
                      {p.puntos_acumulados ?? 0} pts
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Nadie se unió todavía.</p>
        )}
      </div>

      {/* ── 10. MÉTRICAS FINANCIERAS ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <TrendingUp size={14} /> Métricas financieras
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Puntos entregados</p>
            <p className="text-xl font-bold text-gray-900">{totalPuntos.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Fotos aprobadas</p>
            <p className="text-xl font-bold text-green-700">{fotosAprobadas.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Costo / foto aprobada</p>
            <p className="text-xl font-bold text-gray-900">
              {costoPorFoto !== null ? `${costoPorFoto.toLocaleString('es-AR')} pts` : '—'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Gondoleros activos</p>
            <p className="text-xl font-bold text-blue-700">{gondolerosActivos}</p>
          </div>
        </div>
      </div>

      {/* ── 11. CONTEXTO MARCA ───────────────────────────────────────────── */}
      {campana.marca_id && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <Package size={14} /> Otras campañas de esta marca
          </h2>

          {otrasMarca.length > 0 ? (
            <div className="space-y-2">
              {otrasMarca.map((c: any) => {
                const p = c.objetivo_comercios
                  ? Math.min(Math.round((c.comercios_relevados / c.objetivo_comercios) * 100), 100)
                  : null
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/admin/campanas/${c.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-[#1E1B4B] truncate block"
                      >
                        {c.nombre}
                      </Link>
                      {p !== null && (
                        <div className="mt-1 w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-[#1D9E75] h-1.5 rounded-full"
                            style={{ width: `${p}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${colorEstadoCampana(c.estado as EstadoCampana)}`}
                    >
                      {labelEstadoCampana(c.estado as EstadoCampana)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Esta es la única campaña de esta marca.</p>
          )}
        </div>
      )}

      {/* ── 12. CONTEXTO DISTRIBUIDORA ───────────────────────────────────── */}
      {campana.distri_id && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <Building2 size={14} /> Otras campañas de esta distribuidora
            {gondDistriCount !== null && (
              <span className="ml-auto text-xs text-gray-400 font-normal normal-case tracking-normal">
                {gondDistriCount} gondolero{gondDistriCount !== 1 ? 's' : ''} activos en la distri
              </span>
            )}
          </h2>

          {otrasDistri.length > 0 ? (
            <div className="space-y-2">
              {otrasDistri.map((c: any) => {
                const p = c.objetivo_comercios
                  ? Math.min(Math.round((c.comercios_relevados / c.objetivo_comercios) * 100), 100)
                  : null
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/admin/campanas/${c.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-[#1E1B4B] truncate block"
                      >
                        {c.nombre}
                      </Link>
                      {p !== null && (
                        <div className="mt-1 w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-[#1D9E75] h-1.5 rounded-full"
                            style={{ width: `${p}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${colorEstadoCampana(c.estado as EstadoCampana)}`}
                    >
                      {labelEstadoCampana(c.estado as EstadoCampana)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Esta es la única campaña de esta distribuidora.</p>
          )}
        </div>
      )}

      {/* ── Metadata footer ───────────────────────────────────────────────── */}
      <div className="text-xs text-gray-400 pb-4">
        ID: {campana.id} · Creada el {new Date(campana.created_at).toLocaleDateString('es-AR')}
      </div>

    </div>
  )
}
