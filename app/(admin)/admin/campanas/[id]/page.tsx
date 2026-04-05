import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ArrowLeft, Calendar, Target, Camera, MapPin, AlertCircle } from 'lucide-react'
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

export default async function CampanaAdminDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const admin = adminClient()

  const { data: c, error } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, financiada_por, via_ejecucion, motivo_rechazo,
      marca_id, distri_id,
      fecha_inicio, fecha_fin, fecha_limite_inscripcion,
      objetivo_comercios, tope_total_comercios, comercios_relevados,
      max_comercios_por_gondolero, min_comercios_para_cobrar,
      puntos_por_foto, instruccion, nivel_minimo, es_abierta,
      created_at,
      marca:marcas ( razon_social ),
      distri:distribuidoras ( razon_social ),
      bloques_foto ( id, orden, instruccion, tipo_contenido,
        bloque_campos ( id, orden, tipo, pregunta, opciones, obligatorio )
      ),
      campana_zonas ( zona_id, zonas ( nombre ) )
    `)
    .eq('id', params.id)
    .single()

  if (error || !c) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campana = c as any
  const marcaNombre = Array.isArray(campana.marca) ? campana.marca[0]?.razon_social : campana.marca?.razon_social
  const distriNombre = Array.isArray(campana.distri) ? campana.distri[0]?.razon_social : campana.distri?.razon_social
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bloques = (campana.bloques_foto ?? []).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zonas = (campana.campana_zonas ?? []).map((cz: any) =>
    Array.isArray(cz.zonas) ? cz.zonas[0]?.nombre : cz.zonas?.nombre
  ).filter(Boolean)

  const fp = (campana.financiada_por ?? 'gondolapp') as FinanciadaPor
  const badge = FINANCIADO_BADGE[fp] ?? FINANCIADO_BADGE.gondolapp
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null
  const progreso = campana.objetivo_comercios
    ? Math.round((campana.comercios_relevados / campana.objetivo_comercios) * 100)
    : null

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
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

      {/* Motivo de rechazo */}
      {campana.motivo_rechazo && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Motivo de rechazo</p>
            <p className="text-sm text-red-700 mt-0.5">{campana.motivo_rechazo}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Info general */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Información general</h2>
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
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Fechas y avance</h2>
          <dl className="space-y-2.5 text-sm">
            {campana.fecha_inicio && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1"><Calendar size={13} /> Inicio</dt>
                <dd className="font-medium text-gray-900">{campana.fecha_inicio}</dd>
              </div>
            )}
            {campana.fecha_fin && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1"><Calendar size={13} /> Fin</dt>
                <dd className={`font-medium ${dias !== null && dias <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                  {campana.fecha_fin}{dias !== null ? ` (${dias}d)` : ''}
                </dd>
              </div>
            )}
            {campana.fecha_limite_inscripcion && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1"><Calendar size={13} /> Límite inscripción</dt>
                <dd className="font-medium text-gray-900">{campana.fecha_limite_inscripcion}</dd>
              </div>
            )}
            {campana.objetivo_comercios && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1"><Target size={13} /> Objetivo</dt>
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

          {/* Barra de progreso */}
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

      {/* Zonas */}
      {zonas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <MapPin size={14} /> Zonas
          </h2>
          <div className="flex flex-wrap gap-2">
            {zonas.map((zona: string, i: number) => (
              <span key={i} className="text-xs px-2.5 py-1 bg-gondo-verde-50 text-gondo-verde-600 rounded-full font-medium border border-gondo-verde-100">
                {zona}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Instrucción general */}
      {campana.instruccion && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Instrucción general</h2>
          <p className="text-sm text-gray-700 whitespace-pre-line">{campana.instruccion}</p>
        </div>
      )}

      {/* Bloques de foto */}
      {bloques.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Camera size={14} /> Bloques de foto ({bloques.length})
          </h2>
          <div className="space-y-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {bloques.map((bloque: any, idx: number) => (
              <div key={bloque.id} className="border border-gray-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">Bloque {bloque.orden ?? idx + 1}</span>
                  {bloque.tipo_contenido && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium capitalize">
                      {bloque.tipo_contenido}
                    </span>
                  )}
                </div>
                {bloque.instruccion && (
                  <p className="text-sm text-gray-700">{bloque.instruccion}</p>
                )}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {bloque.bloque_campos?.length > 0 && (
                  <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-gray-100">
                    <p className="text-xs font-semibold text-gray-400">Campos</p>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {bloque.bloque_campos.sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0)).map((campo: any) => (
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

      {/* Metadata */}
      <div className="text-xs text-gray-400 pb-4">
        ID: {campana.id} · Creada el {new Date(campana.created_at).toLocaleDateString('es-AR')}
      </div>
    </div>
  )
}
