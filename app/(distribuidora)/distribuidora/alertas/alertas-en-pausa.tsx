'use client'

import { useState, useTransition } from 'react'
import { PackageX, Store, Megaphone, UserX } from 'lucide-react'
import { reactivarAlerta, eliminarAlertaDefinitivo } from './actions'

export interface AlertaIgnoradaConNombre {
  id:            string
  tipo:          string
  nombre:        string
  ignoradaHasta: string
}

const TIPO_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  quiebre_stock:      { label: 'Quiebre de stock',         Icon: PackageX, color: 'text-red-400'    },
  sin_visita:         { label: 'Sin visita',               Icon: Store,    color: 'text-amber-400'  },
  campana_riesgo:     { label: 'Campaña en riesgo',        Icon: Megaphone, color: 'text-orange-400'},
  gondolero_inactivo: { label: 'Gondolero sin actividad',  Icon: UserX,    color: 'text-amber-400'  },
}

function formatFecha(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function AlertasEnPausa({ alertas }: { alertas: AlertaIgnoradaConNombre[] }) {
  const [abierto, setAbierto]       = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [pendingReactivar, startReactivar] = useTransition()
  const [pendingEliminar,  startEliminar]  = useTransition()

  if (alertas.length === 0) return null

  return (
    <section>
      {/* TODO: agregar botón "Crear campaña desde alerta" */}
      {/* Ver CLAUDE.md sección "Features pendientes de diseño" */}
      {/* Misiones de venta desde alertas */}

      <button
        onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-2 mb-3 text-left w-full group"
      >
        <span className="text-sm">🔕</span>
        <span className="text-sm font-semibold text-gray-500 group-hover:text-gray-700 transition-colors">
          Alertas en pausa
        </span>
        <span className="bg-gray-200 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {alertas.length}
        </span>
        <span className="ml-auto text-xs text-gray-300 group-hover:text-gray-400 transition-colors">
          {abierto ? '▲' : '▼'}
        </span>
      </button>

      {abierto && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {alertas.map(a => {
            const config = TIPO_CONFIG[a.tipo]
            const Icon   = config?.Icon
            return (
              <div key={a.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">

                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {Icon && <Icon size={12} className={config.color} />}
                      <span className="text-[11px] text-gray-400 font-medium">{config?.label}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-700 truncate">{a.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Se reactiva el {formatFecha(a.ignoradaHasta)}
                    </p>
                  </div>

                  {/* Acciones */}
                  <div className="shrink-0">
                    {confirmando === a.id ? (
                      <div className="text-right">
                        <p className="text-[11px] text-gray-500 mb-2 max-w-[180px] leading-snug">
                          ¿Eliminar esta alerta? No va a volver a aparecer aunque el problema persista.
                        </p>
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={() => setConfirmando(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() =>
                              startEliminar(() => {
                                eliminarAlertaDefinitivo(a.id).then(res => {
                                  if (res?.error) console.error('[eliminarAlertaDefinitivo]', res.error)
                                  setConfirmando(null)
                                })
                              })
                            }
                            disabled={pendingEliminar}
                            className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                          >
                            {pendingEliminar ? 'Eliminando...' : 'Sí, eliminar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        <button
                          onClick={() =>
                            startReactivar(() => {
                              reactivarAlerta(a.id).then(res => {
                                if (res?.error) console.error('[reactivarAlerta]', res.error)
                              })
                            })
                          }
                          disabled={pendingReactivar}
                          className="text-xs font-semibold text-gondo-amber-400 hover:underline disabled:opacity-50"
                        >
                          {pendingReactivar ? 'Reactivando...' : 'Reactivar ahora'}
                        </button>
                        <button
                          onClick={() => setConfirmando(a.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                          Eliminar definitivamente
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
