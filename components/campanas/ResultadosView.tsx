/**
 * components/campanas/ResultadosView.tsx
 * Componente Server compartido para los paneles de resultados por campaña.
 * Renderiza KPIs, progreso, respuestas del formulario, precios y grid de fotos.
 * El layout exterior (nav de página) queda en cada page.tsx de cada rol.
 */

import React from 'react'
import { Camera, Clock, MapPin, User, TrendingUp } from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import { TabFilter } from '@/components/campanas/tab-filter'
import { calcularPorcentaje, diasRestantes, formatearFechaHora } from '@/lib/utils'
import type { EstadoFoto } from '@/types'
import type { ResultadosData, CampoStat, RespuestaRow } from '@/lib/resultados'

// ── Constantes de estado ──────────────────────────────────────────────────────

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
  en_revision: 'En revisión',
}

// ── Tipos de configuración por rol ────────────────────────────────────────────

export interface ResultadosViewConfig {
  /** Color del valor del KPI del agente: 'text-gondo-indigo-600' | 'text-gondo-amber-400' | 'text-blue-600' */
  accentColor: string
  /** Color de la barra de progreso: 'bg-gondo-indigo-600' | 'bg-gondo-amber-400' | 'bg-blue-500' */
  progressBarColor: string
  /** Color de las barras de selección única/múltiple: 'bg-gondo-indigo-600' | 'bg-blue-400' */
  seleccionBarColor: string
  /** Etiqueta del tile KPI de agente: 'Gondoleros' | 'Fixers' */
  agentLabel: string
  /** Encabezado de columna en tabla de detalle: 'Gondolero' | 'Fixer' */
  agentHeaderLabel: string
  /** Mostrar columna de agente en tabla de detalle */
  showAgent: boolean
  /** Límite de comercios para la barra de progreso (objetivo o tope) */
  limiteComercio: number | null
}

export interface ResultadosViewCampana {
  id: string
  nombre: string
  tipo: string
  fecha_fin: string | null
  comercios_relevados: number | null
}

export interface ResultadosViewProps {
  data: ResultadosData
  campana: ResultadosViewCampana
  tab: string
  config: ResultadosViewConfig
  /** Slot de acciones por foto. Recibe id y estado; devuelve null si no aplica. */
  renderFotoAcciones?: (fotoId: string, estado: string) => React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtValor(valor: unknown, tipo: string): string {
  if (valor === null || valor === undefined) return '—'
  if (tipo === 'binaria') return (valor === true || valor === 'true' || valor === 'Sí') ? 'Sí' : 'No'
  if (tipo === 'seleccion_multiple' && Array.isArray(valor)) return valor.join(', ')
  return String(valor)
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function CampoStatView({
  stat,
  detalles,
  showAgent,
  agentHeaderLabel,
  seleccionBarColor,
}: {
  stat: CampoStat
  detalles: RespuestaRow[]
  showAgent: boolean
  agentHeaderLabel: string
  seleccionBarColor: string
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-800 mb-1">{stat.pregunta}</p>
      <p className="text-xs text-gray-400 mb-2">{stat.total} respuesta{stat.total !== 1 ? 's' : ''}</p>

      {/* Binaria */}
      {stat.tipo === 'binaria' && (
        <div className="space-y-2">
          {[
            { label: 'Sí', n: stat.siCount ?? 0, color: 'bg-green-400' },
            { label: 'No', n: stat.noCount  ?? 0, color: 'bg-red-400'   },
          ].map(opt => {
            const pct = stat.total > 0 ? Math.round((opt.n / stat.total) * 100) : 0
            return (
              <div key={opt.label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{opt.label}</span>
                  <span className="font-semibold">{opt.n} ({pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${opt.color} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Selección única / múltiple */}
      {(stat.tipo === 'seleccion_unica' || stat.tipo === 'seleccion_multiple') && stat.opcionCounts && (
        <div className="space-y-2">
          {Object.entries(stat.opcionCounts).sort((a, b) => b[1] - a[1]).map(([op, n]) => {
            const pct = stat.total > 0 ? Math.round((n / stat.total) * 100) : 0
            return (
              <div key={op}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{op}</span>
                  <span className="font-semibold">{n} ({pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${seleccionBarColor} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Número */}
      {stat.tipo === 'numero' && stat.numAvg !== undefined && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-green-50 rounded-xl p-2">
            <p className="text-base font-bold text-green-700">{stat.numMin}</p>
            <p className="text-xs text-gray-400">Mínimo</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-2">
            <p className="text-base font-bold text-blue-700">{stat.numAvg}</p>
            <p className="text-xs text-gray-400">Promedio</p>
          </div>
          <div className="bg-red-50 rounded-xl p-2">
            <p className="text-base font-bold text-red-700">{stat.numMax}</p>
            <p className="text-xs text-gray-400">Máximo</p>
          </div>
        </div>
      )}

      {/* Texto libre */}
      {stat.tipo === 'texto' && stat.textUltimas && stat.textUltimas.length > 0 && (
        <ul className="space-y-1">
          {stat.textUltimas.map((t, i) => (
            <li key={i} className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">&ldquo;{t}&rdquo;</li>
          ))}
        </ul>
      )}

      {/* Detalle (legacy: solo campañas con datos en foto_respuestas) */}
      {detalles.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Detalle de respuestas</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {showAgent && <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">{agentHeaderLabel}</th>}
                  <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Comercio</th>
                  <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Respuesta</th>
                  <th className="text-left py-1.5 text-gray-400 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {detalles.map((row, ri) => (
                  <tr key={ri} className="border-b border-gray-50">
                    {showAgent && <td className="py-1.5 pr-3 text-gray-700 font-medium">{row.alias ?? '—'}</td>}
                    <td className="py-1.5 pr-3 text-gray-600">{row.comercioNombre ?? row.comercioDireccion ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-gray-700 font-medium">{fmtValor(row.valor, stat.tipo)}</td>
                    <td className="py-1.5 text-gray-400">
                      {row.createdAt ? new Date(row.createdAt).toLocaleDateString('es-AR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ResultadosView({
  data,
  campana,
  tab,
  config,
  renderFotoAcciones,
}: ResultadosViewProps) {
  const {
    tieneCamposFoto, campoStats, campoDetallesMap, fotoRespuestasMap, camposMap,
    misionesAprobadas, fotos, counts, gondoleroCount,
    preciosArr, precioRows, totalFotos, fotosAprobadas,
  } = data
  const { accentColor, progressBarColor, seleccionBarColor, agentLabel, agentHeaderLabel, showAgent, limiteComercio } = config

  const progreso = calcularPorcentaje(campana.comercios_relevados ?? 0, limiteComercio ?? 0)
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null

  const precioMin = preciosArr.length ? Math.min(...preciosArr) : null
  const precioMax = preciosArr.length ? Math.max(...preciosArr) : null
  const precioAvg = preciosArr.length ? Math.round(preciosArr.reduce((a, b) => a + b, 0) / preciosArr.length) : null

  return (
    <>
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      {tieneCamposFoto ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Fotos totales', value: totalFotos,              color: 'text-gray-900' },
            { label: 'Aprobadas',     value: fotosAprobadas,           color: 'text-green-600' },
            { label: 'Pendientes',    value: counts['pendiente'] ?? 0, color: 'text-amber-600' },
            { label: agentLabel,      value: gondoleroCount,           color: accentColor },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Comercios relevados',  value: campana.comercios_relevados ?? 0, color: 'text-gray-900' },
            { label: 'Misiones completadas', value: misionesAprobadas,                 color: 'text-green-600' },
            { label: `${agentLabel} activos`, value: gondoleroCount,                   color: accentColor },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Progreso ─────────────────────────────────────────────────────── */}
      {limiteComercio && limiteComercio > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span className="flex items-center gap-1">
              <TrendingUp size={12} /> Avance de la campaña
            </span>
            <span className={dias !== null && dias <= 3 ? 'text-red-500 font-medium' : ''}>
              {dias !== null ? `${dias} días restantes` : ''}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
            <div className={`h-full ${progressBarColor} rounded-full transition-all`} style={{ width: `${progreso}%` }} />
          </div>
          <p className="text-xs text-gray-400 text-right">
            {campana.comercios_relevados}/{limiteComercio} comercios ({progreso}%)
          </p>
        </div>
      )}

      {/* ── Respuestas del formulario ─────────────────────────────────────── */}
      {campoStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Respuestas del formulario</h3>
          <div className="space-y-6">
            {campoStats.map(stat => (
              <CampoStatView
                key={stat.id}
                stat={stat}
                detalles={campoDetallesMap.get(stat.id) ?? []}
                showAgent={showAgent}
                agentHeaderLabel={agentHeaderLabel}
                seleccionBarColor={seleccionBarColor}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Precios (solo tipo=precio) ────────────────────────────────────── */}
      {campana.tipo === 'precio' && precioMin !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Rango de precios relevados</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xl font-bold text-green-700">${precioMin}</p>
              <p className="text-xs text-gray-500 mt-0.5">Mínimo</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xl font-bold text-blue-700">${precioAvg}</p>
              <p className="text-xs text-gray-500 mt-0.5">Promedio</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xl font-bold text-red-700">${precioMax}</p>
              <p className="text-xs text-gray-500 mt-0.5">Máximo</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">Basado en {preciosArr.length} fotos con precio</p>
          {precioRows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Precios relevados</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {showAgent && <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">{agentHeaderLabel}</th>}
                      <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Comercio</th>
                      <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Precio</th>
                      <th className="text-left py-1.5 text-gray-400 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {precioRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-gray-50">
                        {showAgent && <td className="py-1.5 pr-3 text-gray-700 font-medium">{row.alias ?? '—'}</td>}
                        <td className="py-1.5 pr-3 text-gray-600">{row.comercioNombre ?? row.comercioDireccion ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-gray-700 font-bold">${row.precio}</td>
                        <td className="py-1.5 text-gray-400">
                          {row.createdAt ? new Date(row.createdAt).toLocaleDateString('es-AR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Grid de fotos / placeholder ──────────────────────────────────── */}
      {tieneCamposFoto ? (
        <>
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <TabFilter tabActivo={tab} counts={counts} />
            <p className="text-sm text-gray-500">
              {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
              {tab ? ` ${ESTADO_LABEL[tab as EstadoFoto]?.toLowerCase() ?? tab}` : ''}
            </p>
          </div>

          {fotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
              <Camera size={32} className="text-gray-300 mb-4" />
              <p className="text-sm text-gray-400">
                {tab
                  ? `No hay fotos ${ESTADO_LABEL[tab as EstadoFoto]?.toLowerCase() ?? tab}s.`
                  : 'Todavía no hay fotos en esta campaña.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {fotos.map(f => (
                <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
                  <FotoLightbox
                    src={f.signedUrl}
                    alt={`Foto de ${f.comercio?.nombre ?? 'comercio'}`}
                    containerClassName="relative w-full h-52 shrink-0"
                    modalFooter={
                      fotoRespuestasMap.has(f.id) && camposMap.size > 0
                        ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-white/80 uppercase tracking-wide mb-2">
                              Respuestas del formulario
                            </p>
                            {fotoRespuestasMap.get(f.id)!.map(r => {
                              const campo = camposMap.get(r.campo_id)
                              if (!campo) return null
                              return (
                                <div key={r.campo_id} className="flex justify-between gap-2">
                                  <span className="text-xs text-white/70 shrink-0">{campo.pregunta}</span>
                                  <span className="text-xs font-medium text-white text-right">
                                    {fmtValor(r.valor, campo.tipo)}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                        : undefined
                    }
                  >
                    <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[f.estado as EstadoFoto]}`}>
                      {ESTADO_LABEL[f.estado as EstadoFoto]}
                    </span>
                  </FotoLightbox>

                  <div className="p-4 flex-1 flex flex-col gap-2.5">
                    <div className="flex items-start gap-2">
                      <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {f.comercio?.nombre ?? 'Comercio'}
                        </p>
                        {f.comercio?.direccion && (
                          <p className="text-xs text-gray-400 truncate">{f.comercio.direccion}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User size={13} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-600 truncate">
                        {f.gondolero?.alias ?? f.gondolero?.nombre ?? agentLabel.slice(0, -1)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
                      {f.precio_detectado != null
                        ? <span className="font-medium text-gray-600">${f.precio_detectado}</span>
                        : <span />
                      }
                      <div className="flex items-center gap-1">
                        <Clock size={11} />
                        <span>{formatearFechaHora(f.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {renderFotoAcciones?.(f.id, f.estado)}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <Camera size={28} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">Esta campaña no incluye fotos</p>
          <p className="text-xs text-gray-400 mt-1">Las respuestas del formulario se muestran arriba.</p>
        </div>
      )}
    </>
  )
}
