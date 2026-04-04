'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Star, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'
import { AbandonarBtn } from './abandonar-btn'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type FotoStats = { pendiente: number; aprobada: number; rechazada: number }

export interface ParticipacionCardData {
  id: string
  comercios_completados: number
  puntos_acumulados: number
  joined_at: string
  estado: 'activa' | 'completada' | 'abandonada'
  campana: {
    id: string
    nombre: string
    tipo: TipoCampana
    puntos_por_foto: number
    fecha_fin: string | null
    objetivo_comercios: number | null
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const COLORES_TIPO: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-600',
  pop:          'bg-purple-50 text-purple-600',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-600',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-600',
  interna:      'bg-gray-100 text-gray-500',
}

// ── MisionCard ────────────────────────────────────────────────────────────────

function MisionCard({
  p,
  fotoStats,
}: {
  p: ParticipacionCardData
  fotoStats?: FotoStats
}) {
  const c = p.campana
  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const progreso = calcularPorcentaje(p.comercios_completados, c.objetivo_comercios ?? 0)
  const esActiva = p.estado === 'activa'

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden transition-transform duration-100 active:scale-[0.98] ${
      esActiva ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="p-4 pb-3">
        {/* Badge tipo + tiempo */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[c.tipo]}`}>
              {labelTipoCampana(c.tipo)}
            </span>
            {p.estado === 'completada' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Completada ✓
              </span>
            )}
            {p.estado === 'abandonada' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                Abandonada
              </span>
            )}
          </div>
          {dias !== null && (
            <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
              <Clock size={12} />
              <span className={dias <= 3 ? 'text-red-500 font-medium' : ''}>
                {dias === 0 ? 'Último día' : `${dias} días`}
              </span>
            </div>
          )}
        </div>

        {/* Nombre */}
        <h2 className="font-semibold text-gray-900 text-base leading-snug mb-3">
          {c.nombre}
        </h2>

        {/* Stats inline */}
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <Star size={14} className="text-gondo-verde-400 fill-gondo-verde-400" />
            <span className="text-sm font-semibold text-gondo-verde-400">
              {formatearPuntos(p.puntos_acumulados)} pts
            </span>
          </div>
          {fotoStats && (fotoStats.aprobada > 0 || fotoStats.pendiente > 0 || fotoStats.rechazada > 0) && (
            <div className="flex items-center gap-2 text-[11px] font-medium">
              {fotoStats.aprobada > 0 && (
                <span className="text-green-600">✅ {fotoStats.aprobada}</span>
              )}
              {fotoStats.pendiente > 0 && (
                <span className="text-amber-500">⏳ {fotoStats.pendiente}</span>
              )}
              {fotoStats.rechazada > 0 && (
                <span className="text-red-500">❌ {fotoStats.rechazada}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barra de progreso */}
      {c.objetivo_comercios !== null && c.objetivo_comercios > 0 && (
        <div className="px-4 pb-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-400">Progreso</span>
            <span className="text-xs font-medium text-gray-600">
              {p.comercios_completados} / {c.objetivo_comercios} comercios
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

      {/* CTA solo para activas */}
      {esActiva && (
        <>
          <div className="px-4 pb-2">
            <Link
              href={`/gondolero/captura?campana=${c.id}`}
              className="flex items-center justify-center gap-2 w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-all duration-100 active:scale-[0.97] min-h-touch"
            >
              Ir a capturar
              <ChevronRight size={16} />
            </Link>
          </div>
          <div className="px-4 pb-3">
            <AbandonarBtn campanaId={c.id} />
          </div>
        </>
      )}

      {/* Para completadas / abandonadas: link a detalle */}
      {!esActiva && (
        <div className="px-4 pb-4">
          <Link
            href={`/gondolero/campanas/${c.id}`}
            className="flex items-center justify-center gap-2 w-full py-3 border border-gray-200 text-gray-500 font-medium rounded-xl hover:bg-gray-100 transition-all duration-100 active:scale-[0.97] text-sm min-h-touch"
          >
            Ver campaña
            <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Sección colapsable ─────────────────────────────────────────────────────────

function Seccion({
  titulo,
  badge,
  badgeColor,
  bgColor,
  children,
  defaultOpen = true,
}: {
  titulo: string
  badge: number
  badgeColor: string
  bgColor: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-2xl overflow-hidden border ${bgColor}`}>
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
        <div className="px-4 pb-4 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── MisionesSections ───────────────────────────────────────────────────────────

export function MisionesSections({
  activas,
  completadas,
  abandonadas,
  fotoStatsMap,
}: {
  activas: ParticipacionCardData[]
  completadas: ParticipacionCardData[]
  abandonadas: ParticipacionCardData[]
  fotoStatsMap: Record<string, FotoStats>
}) {
  const hayAlgo = activas.length + completadas.length + abandonadas.length > 0

  if (!hayAlgo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🎯</div>
        <h2 className="text-base font-semibold text-gray-700 mb-1">
          No tenés misiones activas
        </h2>
        <p className="text-sm text-gray-400 max-w-xs mb-6">
          Unite a una campaña para empezar a ganar puntos.
        </p>
        <a
          href="/gondolero/campanas"
          className="px-6 py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors"
        >
          Ver campañas disponibles
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Misiones activas ── */}
      {activas.length > 0 && (
        <Seccion
          titulo="Misiones activas"
          badge={activas.length}
          badgeColor="bg-green-100 text-green-700"
          bgColor="bg-green-50 border-green-200"
          defaultOpen={true}
        >
          {activas.map(p => (
            <MisionCard key={p.id} p={p} fotoStats={fotoStatsMap[p.campana.id]} />
          ))}
        </Seccion>
      )}

      {/* ── Sin misiones activas ── */}
      {activas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-sm font-semibold text-gray-700 mb-1">No tenés misiones activas</p>
          <p className="text-xs text-gray-400 mb-4">Unite a una campaña para empezar a ganar puntos.</p>
          <a
            href="/gondolero/campanas"
            className="px-5 py-2.5 bg-gondo-verde-400 text-white text-sm font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors"
          >
            Ver campañas
          </a>
        </div>
      )}

      {/* ── Completadas ── */}
      {completadas.length > 0 && (
        <Seccion
          titulo="Completadas"
          badge={completadas.length}
          badgeColor="bg-gondo-verde-50 text-gondo-verde-600"
          bgColor="bg-gray-50 border-gray-200"
          defaultOpen={false}
        >
          {completadas.map(p => (
            <MisionCard key={p.id} p={p} fotoStats={fotoStatsMap[p.campana.id]} />
          ))}
        </Seccion>
      )}

      {/* ── Abandonadas ── */}
      {abandonadas.length > 0 && (
        <Seccion
          titulo="Abandonadas"
          badge={abandonadas.length}
          badgeColor="bg-gray-100 text-gray-500"
          bgColor="bg-gray-50 border-gray-200"
          defaultOpen={false}
        >
          {abandonadas.map(p => (
            <MisionCard key={p.id} p={p} fotoStats={fotoStatsMap[p.campana.id]} />
          ))}
        </Seccion>
      )}
    </div>
  )
}
