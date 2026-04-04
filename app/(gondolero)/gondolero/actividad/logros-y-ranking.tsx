'use client'

import { useState } from 'react'
import type { NivelGondolero } from '@/types'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface LogroUI {
  clave: string
  nombre: string
  descripcion: string
  emoji: string
  desbloqueado: boolean
  frase?: string | null
  desbloqueado_at?: string | null
}

export interface RankingEntry {
  gondolero_id: string
  alias: string
  nivel: NivelGondolero
  fotos_este_mes: number
  posicion: number
}

export interface LogrosYRankingProps {
  logros: LogroUI[]
  rankings: {
    nacional:  RankingEntry[]
    distri:    RankingEntry[]
    zona:      RankingEntry[]
    provincia: RankingEntry[]
  }
  misPosiciones: {
    nacional:  number | null
    distri:    number | null
    zona:      number | null
    provincia: number | null
  }
  gondoleroId: string
  mesLabel: string
  hayDistri: boolean
  hayZona: boolean
  hayProvincia: boolean
}

// ── Constantes ────────────────────────────────────────────────────────────────

const CONDICION_LOGRO: Record<string, string> = {
  primera_foto:    '1 foto aprobada',
  velocista:       '10 fotos en un día',
  racha_7_dias:    '6 días seguidos con actividad',
  explorador:      '10 comercios distintos',
  perfeccion:      'Todas las fotos de una campaña aprobadas',
  podio:           'Top 3 del mes',
  primera_campana: '1 campaña completada',
  decacampeon:     '10 campañas completadas',
}

const MEDALLA: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const NIVEL_COLOR: Record<NivelGondolero, string> = {
  casual: 'bg-gray-100 text-gray-500',
  activo: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  pro:    'bg-amber-50 text-amber-600',
}

// ── LogroCard ─────────────────────────────────────────────────────────────────

function LogroCard({ logro }: { logro: LogroUI }) {
  if (logro.desbloqueado) {
    return (
      <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-green-50 border border-green-200">
        <span className="text-3xl mb-1.5">{logro.emoji}</span>
        <p className="text-xs font-bold text-gray-800 leading-tight mb-1">{logro.nombre}</p>
        {logro.frase && (
          <p className="text-[10px] text-green-700 italic leading-tight line-clamp-2">
            "{logro.frase}"
          </p>
        )}
        <span className="mt-1.5 text-[10px] font-semibold text-green-600">✓ Desbloqueado</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-gray-50 border border-gray-200 opacity-60">
      <span className="text-3xl mb-1.5 grayscale">{logro.emoji}</span>
      <p className="text-xs font-semibold text-gray-600 leading-tight mb-1">{logro.nombre}</p>
      <p className="text-[10px] text-gray-400 leading-tight">
        {CONDICION_LOGRO[logro.clave] ?? logro.descripcion}
      </p>
      <span className="mt-1.5 text-[10px] text-gray-400">🔒 Bloqueado</span>
    </div>
  )
}

// ── RankingTab ────────────────────────────────────────────────────────────────

function RankingTab({
  entries,
  miPosicion,
  gondoleroId,
  mesLabel,
  vacio,
}: {
  entries: RankingEntry[]
  miPosicion: number | null
  gondoleroId: string
  mesLabel: string
  vacio?: string
}) {
  if (!entries.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        {vacio ?? 'Sin datos para este ranking.'}
      </p>
    )
  }

  const estaEnTop10 = entries.some(e => e.gondolero_id === gondoleroId)

  return (
    <div>
      <div className="space-y-1.5">
        {entries.map(e => {
          const esYo = e.gondolero_id === gondoleroId
          return (
            <div
              key={e.gondolero_id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                esYo
                  ? 'bg-gondo-verde-50 border border-gondo-verde-200'
                  : 'bg-white border border-gray-100'
              }`}
            >
              {/* Posición */}
              <span className="text-base w-7 text-center shrink-0">
                {MEDALLA[e.posicion] ?? <span className="text-sm font-bold text-gray-500">#{e.posicion}</span>}
              </span>

              {/* Alias + nivel */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${esYo ? 'text-gondo-verde-600' : 'text-gray-800'}`}>
                  {e.alias}{esYo && <span className="ml-1 text-[10px] font-normal text-gondo-verde-500">(vos)</span>}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${NIVEL_COLOR[e.nivel]}`}>
                {e.nivel}
              </span>

              {/* Fotos */}
              <span className={`text-sm font-bold shrink-0 ${esYo ? 'text-gondo-verde-600' : 'text-gray-700'}`}>
                {e.fotos_este_mes} 📷
              </span>
            </div>
          )
        })}
      </div>

      {/* Posición fuera del top 10 */}
      {!estaEnTop10 && miPosicion !== null && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-gondo-verde-50 border border-gondo-verde-200 flex items-center justify-between">
          <span className="text-sm text-gondo-verde-600 font-medium">Tu posición en {mesLabel}</span>
          <span className="text-sm font-bold text-gondo-verde-600">#{miPosicion}</span>
        </div>
      )}
      {!estaEnTop10 && miPosicion === null && (
        <p className="mt-3 text-xs text-gray-400 text-center">
          Todavía no tenés fotos este mes. ¡Salí a capturar!
        </p>
      )}
    </div>
  )
}

// ── LogrosYRanking (export) ────────────────────────────────────────────────────

type TabRanking = 'nacional' | 'distri' | 'zona' | 'provincia'

export function LogrosYRanking({
  logros,
  rankings,
  misPosiciones,
  gondoleroId,
  mesLabel,
  hayDistri,
  hayZona,
  hayProvincia,
}: LogrosYRankingProps) {
  const [tabRanking, setTabRanking] = useState<TabRanking>(
    hayDistri ? 'distri' : hayZona ? 'zona' : 'nacional'
  )

  const desbloqueados = logros.filter(l => l.desbloqueado).length

  const tabs: Array<{ key: TabRanking; label: string; activo: boolean }> = [
    { key: 'distri',    label: 'Mi Distri',   activo: hayDistri },
    { key: 'zona',      label: 'Mi Zona',     activo: hayZona },
    { key: 'provincia', label: 'Provincia',   activo: hayProvincia },
    { key: 'nacional',  label: 'Nacional',    activo: true },
  ]

  return (
    <div className="space-y-4">

      {/* ── LOGROS ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Mis logros</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gondo-verde-50 text-gondo-verde-600">
            {desbloqueados} / {logros.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {logros.map(logro => (
            <LogroCard key={logro.clave} logro={logro} />
          ))}
        </div>

        {desbloqueados === 0 && (
          <p className="text-xs text-gray-400 text-center mt-3">
            Aprobá tu primera foto para empezar a desbloquear logros.
          </p>
        )}
      </div>

      {/* ── RANKING MENSUAL ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Ranking del mes</h2>
          <span className="text-xs text-gray-400">{mesLabel}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4 overflow-x-auto">
          {tabs.filter(t => t.activo).map(tab => (
            <button
              key={tab.key}
              onClick={() => setTabRanking(tab.key)}
              className={`flex-1 min-w-fit text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                tabRanking === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        {tabRanking === 'nacional' && (
          <RankingTab
            entries={rankings.nacional}
            miPosicion={misPosiciones.nacional}
            gondoleroId={gondoleroId}
            mesLabel={mesLabel}
            vacio="Todavía no hay fotos aprobadas este mes."
          />
        )}
        {tabRanking === 'distri' && (
          <RankingTab
            entries={rankings.distri}
            miPosicion={misPosiciones.distri}
            gondoleroId={gondoleroId}
            mesLabel={mesLabel}
            vacio="No hay otros gondoleros de tu distribuidora todavía."
          />
        )}
        {tabRanking === 'zona' && (
          <RankingTab
            entries={rankings.zona}
            miPosicion={misPosiciones.zona}
            gondoleroId={gondoleroId}
            mesLabel={mesLabel}
            vacio="No hay gondoleros en tu zona todavía."
          />
        )}
        {tabRanking === 'provincia' && (
          <RankingTab
            entries={rankings.provincia}
            miPosicion={misPosiciones.provincia}
            gondoleroId={gondoleroId}
            mesLabel={mesLabel}
            vacio="No hay gondoleros en tu provincia todavía."
          />
        )}
      </div>
    </div>
  )
}
