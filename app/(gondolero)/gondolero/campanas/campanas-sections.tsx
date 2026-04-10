'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Star, Clock, Camera, CheckCircle2, ChevronDown, ChevronRight, DollarSign,
} from 'lucide-react'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface CampanaCardData {
  id: string
  nombre: string
  tipo: TipoCampana
  marca_id: string | null
  distri_id: string | null
  financiada_por: string
  puntos_por_foto: number
  puntos_por_mision: number
  fecha_fin: string | null
  fecha_limite_inscripcion: string | null
  objetivo_comercios: number | null
  tope_total_comercios: number | null
  comercios_relevados: number
  instruccion: string | null
  min_comercios_para_cobrar: number
  max_comercios_por_gondolero: number
  nivel_minimo: string | null
  es_abierta: boolean
  via_ejecucion: string | null
  estado?: string
  created_at: string
  marca: { razon_social: string } | null
  distri: { razon_social: string } | null
  bloques_foto: { id: string; bloque_campos: { tipo: string }[] }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const NIVEL_ORDEN: Record<string, number> = { casual: 0, activo: 1, pro: 2 }
const NIVEL_LABEL: Record<string, string>  = { casual: 'Casual', activo: 'Activo', pro: 'Pro' }

const COLORES_TIPO: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-600',
  pop:          'bg-purple-50 text-purple-600',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-600',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-600',
  interna:      'bg-gray-100 text-gray-500',
}

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

// ── CampanaCard (full) ─────────────────────────────────────────────────────────

function CampanaCard({
  campana,
  participacionEstado,
  gondoleroNivel,
  misDistriIds,
  gondoleroComerciosCompletados,
}: {
  campana: CampanaCardData
  participacionEstado?: 'activa' | 'completada' | 'abandonada'
  gondoleroNivel: string
  misDistriIds: string[]
  gondoleroComerciosCompletados?: number
}) {
  const participando = participacionEstado === 'activa'
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null
  const progreso = calcularPorcentaje(campana.comercios_relevados, campana.objetivo_comercios ?? 0)
  const cantFotos = campana.bloques_foto.reduce(
    (acc, b) => acc + b.bloque_campos.filter(c => c.tipo === 'foto').length,
    0
  )
  const nueva = !participando && (Date.now() - new Date(campana.created_at).getTime() < SIETE_DIAS_MS)
  const nivelMinimo = campana.nivel_minimo ?? 'casual'
  const nivelOk = (NIVEL_ORDEN[gondoleroNivel] ?? 0) >= (NIVEL_ORDEN[nivelMinimo] ?? 0)

  const maxPropios = campana.max_comercios_por_gondolero
  const minPropios = campana.min_comercios_para_cobrar
  const completadosPropios = gondoleroComerciosCompletados ?? 0
  const progresoPropios = maxPropios > 0 ? Math.min(100, Math.round((completadosPropios / maxPropios) * 100)) : 0
  const minPct = maxPropios > 0 ? Math.min(100, Math.round((minPropios / maxPropios) * 100)) : 0

  const cupoLleno = !!(campana.tope_total_comercios != null && campana.comercios_relevados >= campana.tope_total_comercios)
  const ultimosCupos = !cupoLleno && campana.tope_total_comercios != null &&
    campana.comercios_relevados / campana.tope_total_comercios > 0.8
  const diasInscripcion = campana.fecha_limite_inscripcion ? diasRestantes(campana.fecha_limite_inscripcion) : null
  const inscripcionProntoCierra = diasInscripcion !== null && diasInscripcion >= 0 && diasInscripcion <= 3

  const esMiDistri = !!campana.distri_id && misDistriIds.includes(campana.distri_id)
  const esGondolApp = campana.financiada_por === 'gondolapp' || (!campana.distri_id && !campana.marca_id)

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden transition-transform duration-100 active:scale-[0.98]">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[campana.tipo]}`}>
            {labelTipoCampana(campana.tipo)}
          </span>
          {cantFotos > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              <Camera size={10} />
              Foto
            </span>
          )}
          {campana.tipo === 'precio' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gondo-amber-50 text-gondo-amber-400">
              <DollarSign size={10} />
              Precio
            </span>
          )}
          {esMiDistri && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
              📦 {campana.distri?.razon_social ?? 'Tu distribuidora'}
            </span>
          )}
          {!esMiDistri && esGondolApp && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              GondolApp
            </span>
          )}
          {participando && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <CheckCircle2 size={10} />
              En curso
            </span>
          )}
          {!nivelOk && !participando && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-500">
              Requiere nivel {NIVEL_LABEL[nivelMinimo]}
            </span>
          )}
          {nueva && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              Nueva
            </span>
          )}
          {cupoLleno && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
              Sin cupos
            </span>
          )}
          {!cupoLleno && ultimosCupos && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
              Últimos cupos
            </span>
          )}
          {inscripcionProntoCierra && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
              Inscripción cierra en {diasInscripcion === 0 ? 'hoy' : `${diasInscripcion}d`}
            </span>
          )}
        </div>
        <h2 className="font-semibold text-gray-900 text-base leading-snug">{campana.nombre}</h2>
        {campana.instruccion && (
          <p className="text-gray-500 text-sm mt-1 line-clamp-2">{campana.instruccion}</p>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Star size={14} className="text-gondo-verde-400 fill-gondo-verde-400" />
          <span className="text-sm font-semibold text-gondo-verde-400">
            {formatearPuntos(campana.puntos_por_mision > 0 ? campana.puntos_por_mision : campana.puntos_por_foto)} pts/misión
          </span>
        </div>
        {dias !== null && (
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-400" />
            <span className={`text-sm font-medium ${dias <= 3 ? 'text-red-500' : 'text-gray-500'}`}>
              {dias === 0 ? 'Último día' : `${dias} días`}
            </span>
          </div>
        )}
        {cantFotos > 0 && (
          <div className="flex items-center gap-1.5">
            <Camera size={14} className="text-gray-400" />
            <span className="text-sm text-gray-500">
              {cantFotos} {cantFotos === 1 ? 'foto' : 'fotos'}
            </span>
          </div>
        )}
      </div>

      {/* Barra progreso campaña global */}
      {campana.objetivo_comercios !== null && campana.objetivo_comercios > 0 && (
        <div className="px-4 pb-2">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-400">Comercios relevados</span>
            <span className="text-xs font-medium text-gray-600">
              {campana.comercios_relevados} / {campana.objetivo_comercios}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gondo-verde-400 rounded-full transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      {/* Barra progreso propio (solo en curso) */}
      {participando && maxPropios > 0 && (
        <div className="px-4 pb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-500 font-medium">Tu avance</span>
            <span className="text-xs font-semibold text-gray-700">
              {completadosPropios} / {maxPropios}
              {completadosPropios >= minPropios
                ? <span className="text-gondo-verde-600 ml-1">✓ Mínimo alcanzado</span>
                : <span className="text-amber-500 ml-1">· mínimo {minPropios}</span>
              }
            </span>
          </div>
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            {minPct > 0 && minPct < 100 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                style={{ left: `${minPct}%` }}
              />
            )}
            <div
              className={`h-full rounded-full transition-all ${
                completadosPropios >= minPropios ? 'bg-gondo-verde-400' : 'bg-amber-400'
              }`}
              style={{ width: `${progresoPropios}%` }}
            />
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="px-4 pb-4">
        <Link
          href={`/gondolero/campanas/${campana.id}`}
          className={`block w-full py-3 text-white text-center font-semibold rounded-xl transition-all duration-100 active:scale-[0.97] min-h-touch ${
            participando
              ? 'bg-green-600 hover:bg-green-700'
              : !nivelOk
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gondo-verde-400 hover:bg-gondo-verde-600'
          }`}
        >
          {participando ? 'Continuar →' : 'Ver campaña'}
        </Link>
      </div>
    </div>
  )
}

// ── CampanaCardCerrada (compacta) ──────────────────────────────────────────────

function CampanaCardCerrada({
  campana,
  misDistriIds,
}: {
  campana: CampanaCardData
  misDistriIds: string[]
}) {
  const esMiDistri = !!campana.distri_id && misDistriIds.includes(campana.distri_id)
  const suspendida = campana.estado === 'suspendida'

  return (
    <Link
      href={`/gondolero/campanas/${campana.id}`}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 transition-transform duration-100 active:scale-[0.98]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${COLORES_TIPO[campana.tipo]}`}>
            {labelTipoCampana(campana.tipo)}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            suspendida ? 'bg-gray-100 text-gray-500' : 'bg-rose-100 text-rose-600'
          }`}>
            {suspendida ? 'Suspendida' : 'Cerrada'}
          </span>
          {esMiDistri && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
              📦 Tu distribuidora
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-700 truncate">{campana.nombre}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-gondo-verde-400 font-medium">
            <Star size={10} className="fill-gondo-verde-400" />
            {formatearPuntos(campana.puntos_por_mision > 0 ? campana.puntos_por_mision : campana.puntos_por_foto)} pts/misión
          </span>
          {campana.fecha_fin && (
            <span className="text-xs text-gray-400">
              Venció {new Date(campana.fecha_fin).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </Link>
  )
}

// ── Sección colapsable ─────────────────────────────────────────────────────────

function Seccion({
  titulo,
  badge,
  badgeColor,
  bgColor,
  borderColor,
  children,
  defaultOpen = true,
}: {
  titulo: string
  badge: number
  badgeColor: string
  bgColor: string
  borderColor: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-2xl overflow-hidden border ${bgColor} ${borderColor}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-gray-900 text-sm">{titulo}</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? '4000px' : '0px' }}
      >
        <div className="px-4 pb-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── CampanasSections ───────────────────────────────────────────────────────────

export function CampanasSections({
  misCampanas,
  disponibles,
  finalizadas,
  gondoleroNivel,
  misDistriIds,
  comerciosCompletadosRecord,
}: {
  misCampanas: CampanaCardData[]
  disponibles: CampanaCardData[]
  finalizadas: CampanaCardData[]
  gondoleroNivel: string
  misDistriIds: string[]
  comerciosCompletadosRecord: Record<string, number>
}) {
  const hayAlgo = misCampanas.length + disponibles.length + finalizadas.length > 0

  if (!hayAlgo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-base font-semibold text-gray-700 mb-1">
          No hay campañas activas
        </h2>
        <p className="text-sm text-gray-400 max-w-xs">
          Cuando haya campañas disponibles en tu zona van a aparecer acá.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Mis campañas ── */}
      {misCampanas.length > 0 && (
        <Seccion
          titulo="Mis campañas"
          badge={misCampanas.length}
          badgeColor="bg-green-100 text-green-700"
          bgColor="bg-green-50"
          borderColor="border-green-200"
          defaultOpen={true}
        >
          {misCampanas.map(c => (
            <CampanaCard
              key={c.id}
              campana={c}
              participacionEstado="activa"
              gondoleroNivel={gondoleroNivel}
              misDistriIds={misDistriIds}
              gondoleroComerciosCompletados={comerciosCompletadosRecord[c.id] ?? 0}
            />
          ))}
        </Seccion>
      )}

      {/* ── Disponibles ── */}
      {disponibles.length > 0 && (
        <Seccion
          titulo="Disponibles"
          badge={disponibles.length}
          badgeColor="bg-slate-200 text-slate-600"
          bgColor="bg-slate-100"
          borderColor="border-slate-200"
          defaultOpen={true}
        >
          {disponibles.map(c => (
            <CampanaCard
              key={c.id}
              campana={c}
              gondoleroNivel={gondoleroNivel}
              misDistriIds={misDistriIds}
            />
          ))}
        </Seccion>
      )}

      {/* ── Finalizadas ── */}
      {finalizadas.length > 0 && (
        <Seccion
          titulo="Finalizadas"
          badge={finalizadas.length}
          badgeColor="bg-rose-100 text-rose-600"
          bgColor="bg-rose-50"
          borderColor="border-rose-200"
          defaultOpen={false}
        >
          {finalizadas.map(c => (
            <CampanaCardCerrada
              key={c.id}
              campana={c}
              misDistriIds={misDistriIds}
            />
          ))}
        </Seccion>
      )}

      {/* Estado vacío de disponibles cuando solo hay en mis campañas */}
      {disponibles.length === 0 && finalizadas.length === 0 && misCampanas.length > 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-sm font-semibold text-gray-700">
            Ya estás en todas las campañas activas
          </p>
        </div>
      )}

    </div>
  )
}
