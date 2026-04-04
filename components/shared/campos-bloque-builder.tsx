'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'

export interface CampoBloque {
  tempId: string
  tipo: 'seleccion_multiple' | 'seleccion_unica' | 'binaria' | 'numero' | 'texto'
  pregunta: string
  opciones: string[]
  obligatorio: boolean
  orden: number
}

const TIPO_LABEL: Record<CampoBloque['tipo'], string> = {
  seleccion_multiple: 'Selección múltiple',
  seleccion_unica:    'Selección única',
  binaria:            'Sí / No',
  numero:             'Número',
  texto:              'Texto libre',
}

function nuevoCampo(orden: number): CampoBloque {
  return {
    tempId:     `campo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    tipo:       'seleccion_unica',
    pregunta:   '',
    opciones:   [''],
    obligatorio: true,
    orden,
  }
}

export function CamposBloqueBuilder({
  campos,
  onChange,
  accentClass = 'focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600',
}: {
  campos: CampoBloque[]
  onChange: (campos: CampoBloque[]) => void
  accentClass?: string
}) {
  const [expandido, setExpandido] = useState<string | null>(null)

  function agregar() {
    const nuevo = nuevoCampo(campos.length + 1)
    onChange([...campos, nuevo])
    setExpandido(nuevo.tempId)
  }

  function eliminar(tempId: string) {
    onChange(
      campos
        .filter(c => c.tempId !== tempId)
        .map((c, i) => ({ ...c, orden: i + 1 }))
    )
    if (expandido === tempId) setExpandido(null)
  }

  function actualizar(tempId: string, patch: Partial<CampoBloque>) {
    onChange(campos.map(c => c.tempId === tempId ? { ...c, ...patch } : c))
  }

  function actualizarOpcion(campoTempId: string, idx: number, valor: string) {
    onChange(campos.map(c => {
      if (c.tempId !== campoTempId) return c
      const ops = [...c.opciones]
      ops[idx] = valor
      return { ...c, opciones: ops }
    }))
  }

  function agregarOpcion(campoTempId: string) {
    onChange(campos.map(c =>
      c.tempId === campoTempId ? { ...c, opciones: [...c.opciones, ''] } : c
    ))
  }

  function eliminarOpcion(campoTempId: string, idx: number) {
    onChange(campos.map(c =>
      c.tempId === campoTempId
        ? { ...c, opciones: c.opciones.filter((_, i) => i !== idx) }
        : c
    ))
  }

  const tieneOpciones = (tipo: CampoBloque['tipo']) =>
    tipo === 'seleccion_multiple' || tipo === 'seleccion_unica'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Preguntas del bloque <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <button
          type="button"
          onClick={agregar}
          className="flex items-center gap-1 text-xs font-semibold text-gondo-indigo-600 hover:text-gondo-indigo-400 transition-colors"
        >
          <Plus size={13} />
          Agregar pregunta
        </button>
      </div>

      {campos.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          Sin preguntas — el gondolero solo declarará resultado.
        </p>
      )}

      {campos.map((campo, idx) => {
        const estaExpandido = expandido === campo.tempId
        return (
          <div key={campo.tempId} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Header del campo */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
              <GripVertical size={14} className="text-gray-300 shrink-0" />
              <span className="text-xs font-semibold text-gray-400">{idx + 1}</span>
              <p className="flex-1 text-sm text-gray-700 truncate min-w-0">
                {campo.pregunta
                  ? campo.pregunta
                  : <span className="text-gray-400 italic">Sin nombre</span>
                }
              </p>
              <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline">
                {TIPO_LABEL[campo.tipo]}
              </span>
              <button
                type="button"
                onClick={() => setExpandido(estaExpandido ? null : campo.tempId)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              >
                {estaExpandido ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              <button
                type="button"
                onClick={() => eliminar(campo.tempId)}
                className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* Detalle expandido */}
            {estaExpandido && (
              <div className="p-3 space-y-3 border-t border-gray-100">
                {/* Pregunta */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pregunta</label>
                  <input
                    type="text"
                    value={campo.pregunta}
                    onChange={e => actualizar(campo.tempId, { pregunta: e.target.value })}
                    placeholder="Ej: ¿El producto tiene precio visible?"
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${accentClass} transition`}
                  />
                </div>

                {/* Tipo */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de respuesta</label>
                  <select
                    value={campo.tipo}
                    onChange={e => actualizar(campo.tempId, {
                      tipo: e.target.value as CampoBloque['tipo'],
                      opciones: tieneOpciones(e.target.value as CampoBloque['tipo']) ? [''] : [],
                    })}
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${accentClass} transition bg-white`}
                  >
                    {(Object.entries(TIPO_LABEL) as [CampoBloque['tipo'], string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                {/* Opciones (solo para selección) */}
                {tieneOpciones(campo.tipo) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Opciones</label>
                    <div className="space-y-1.5">
                      {campo.opciones.map((op, oi) => (
                        <div key={oi} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={op}
                            onChange={e => actualizarOpcion(campo.tempId, oi, e.target.value)}
                            placeholder={`Opción ${oi + 1}`}
                            className={`flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${accentClass} transition`}
                          />
                          {campo.opciones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => eliminarOpcion(campo.tempId, oi)}
                              className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => agregarOpcion(campo.tempId)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
                      >
                        <Plus size={11} /> Agregar opción
                      </button>
                    </div>
                  </div>
                )}

                {/* Obligatorio */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campo.obligatorio}
                    onChange={e => actualizar(campo.tempId, { obligatorio: e.target.checked })}
                    className="w-3.5 h-3.5 accent-gondo-indigo-600"
                  />
                  <span className="text-xs text-gray-600">Respuesta obligatoria</span>
                </label>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
