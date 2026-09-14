/**
 * components/campanas/ResultadosView.tsx
 * Componente Server compartido por los cuatro paneles de resultados.
 * Los cuatro ven los mismos resultados; lo único que cambia es el tema y si
 * ven quién relevó. El layout exterior (nav de página) queda en cada page.tsx.
 *
 * Estructura: KPIs → avance → módulos en orden (bloque.orden, campo.orden).
 * Cada módulo se dibuja según su tipo en components/campanas/modulos/.
 *
 * No hay grilla global de fotos: cada campo tipo='foto' tiene su galería en su
 * módulo, y el filtro por estado de arriba filtra todas a la vez.
 */

import React from 'react'
import { TrendingUp } from 'lucide-react'
import { TabFilter } from '@/components/campanas/tab-filter'
import { calcularPorcentaje, diasRestantes } from '@/lib/utils'
import type { ResultadosData } from '@/lib/resultados'
import { TEMAS, type Panel } from './modulos/tema'
import { ModuloDispatcher } from './modulos/ModuloDispatcher'

export interface ResultadosViewCampana {
  id: string
  nombre: string
  tipo: string
  fecha_fin: string | null
  /**
   * Denominador del avance. Se usa `tope_total_comercios`: `objetivo_comercios`
   * está vacío en todas las campañas y hacía que la barra no se dibujara nunca
   * en estos paneles mientras sí aparecía en el detalle de admin.
   * Sin tope, se muestra el absoluto sin porcentaje.
   */
  tope_total_comercios: number | null
}

export interface ResultadosViewProps {
  data: ResultadosData
  campana: ResultadosViewCampana
  tab: string
  /** Quién mira. Resuelve colores, etiquetas y si se ve el agente. */
  panel: Panel
  /** Slot de acciones por foto. Recibe id y estado; devuelve null si no aplica. */
  renderFotoAcciones?: (fotoId: string, estado: string) => React.ReactNode
}

export function ResultadosView({
  data,
  campana,
  tab,
  panel,
  renderFotoAcciones,
}: ResultadosViewProps) {
  const {
    modulos, tieneCamposFoto, fotoRespuestasMap, camposMap,
    misionesAprobadas, pdvRelevados, counts, gondoleroCount,
    totalFotos, fotosAprobadas,
  } = data

  const tema = TEMAS[panel]
  const tope = campana.tope_total_comercios
  const progreso = tope ? calcularPorcentaje(pdvRelevados, tope) : null
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null

  return (
    <>
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'PDV relevados',   value: pdvRelevados,      color: 'text-gray-900' },
          { label: 'Misiones completadas', value: misionesAprobadas, color: 'text-green-600' },
          ...(tieneCamposFoto
            ? [{ label: 'Fotos aprobadas', value: `${fotosAprobadas}/${totalFotos}`, color: 'text-green-600' }]
            : []),
          { label: tema.agenteLabel, value: gondoleroCount, color: tema.acento },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* ── Avance ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span className="flex items-center gap-1">
            <TrendingUp size={12} /> Avance de la campaña
          </span>
          <span className={dias !== null && dias <= 3 ? 'text-red-500 font-medium' : ''}>
            {dias !== null ? `${dias} días restantes` : ''}
          </span>
        </div>
        {progreso !== null ? (
          <>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
              <div className={`h-full ${tema.barraAvance} rounded-full transition-all`} style={{ width: `${progreso}%` }} />
            </div>
            <p className="text-xs text-gray-400 text-right">
              {pdvRelevados}/{tope} comercios ({progreso}%)
            </p>
          </>
        ) : (
          <p className="text-xs text-gray-400 text-right">
            {pdvRelevados} comercio{pdvRelevados !== 1 ? 's' : ''} relevado{pdvRelevados !== 1 ? 's' : ''}
            <span className="text-gray-300"> · sin objetivo definido</span>
          </p>
        )}
      </div>

      {/* ── Filtro de estado: aplica a todas las galerías ────────────────── */}
      {tieneCamposFoto && (
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <TabFilter tabActivo={tab} counts={counts} />
        </div>
      )}

      {/* ── Módulos ──────────────────────────────────────────────────────── */}
      {modulos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-500">Esta campaña no tiene módulos configurados</p>
          <p className="text-xs text-gray-400 mt-1">Agregá campos a sus bloques para ver resultados acá.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {modulos.map(m => (
            <div key={m.campo.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <ModuloDispatcher
                modulo={m}
                tema={tema}
                fotoRespuestasMap={fotoRespuestasMap}
                camposMap={camposMap}
                renderFotoAcciones={renderFotoAcciones}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
