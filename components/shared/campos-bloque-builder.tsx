'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { type Metrica } from '@/lib/metricas'

export interface CampoBloque {
  tempId: string
  tipo: 'seleccion_multiple' | 'seleccion_unica' | 'binaria' | 'numero' | 'texto' | 'foto'
  pregunta: string
  opciones: string[]
  obligatorio: boolean
  orden: number
  /** Qué mide la pregunta. `null` = sin métrica, que es el default y la mayoría. */
  metricaId: string | null
}

const TIPO_LABEL: Record<CampoBloque['tipo'], string> = {
  seleccion_multiple: 'Selección múltiple',
  seleccion_unica:    'Selección única',
  binaria:            'Sí / No',
  numero:             'Número',
  texto:              'Texto libre',
  foto:               'Foto',
}

function nuevoCampo(orden: number): CampoBloque {
  return {
    tempId:     `campo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    tipo:       'seleccion_unica',
    pregunta:   '',
    opciones:   [''],
    obligatorio: true,
    orden,
    metricaId:  null,
  }
}

/**
 * El catálogo se carga acá adentro, no llega por prop.
 *
 * Es lo mismo que hace `SelectorZona` con provincias y localidades, y por la
 * misma razón: de los cuatro lugares donde se monta este constructor, **dos son
 * client pages** —`admin/campanas/nueva` y `distribuidora/campanas/nueva`— que
 * no tienen un server component arriba del cual pasar nada. Pasarlo por prop
 * obligaría a partir esas dos pantallas en página + formulario solo para eso.
 *
 * La RLS de `metricas` deja leer a cualquier autenticado, así que el cliente
 * anónimo del browser alcanza.
 */
function metricaDe(campo: CampoBloque, metricas: Metrica[]): Metrica | null {
  return campo.metricaId ? metricas.find(m => m.id === campo.metricaId) ?? null : null
}

function useCatalogoMetricas() {
  const [metricas, setMetricas] = useState<Metrica[]>([])

  useEffect(() => {
    createClient()
      .from('metricas')
      .select('id, slug, nombre, descripcion, tipo_respuesta, fuentes, orden, activa')
      .eq('activa', true)
      .order('orden')
      .then(({ data }) => setMetricas((data ?? []) as unknown as Metrica[]))
  }, [])

  return metricas
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
  const metricas = useCatalogoMetricas()

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

  /**
   * Elegir una métrica FIJA el tipo de respuesta, así que las dos cosas se
   * escriben en el mismo acto. Si no, dos campañas podrían medir "precio" una
   * con un número y otra con una selección, y la serie no existiría.
   */
  function elegirMetrica(campo: CampoBloque, metricaId: string) {
    if (!metricaId) {
      actualizar(campo.tempId, { metricaId: null })
      return
    }
    const m = metricas.find(x => x.id === metricaId)
    if (!m) return
    const tipo = m.tipo_respuesta as CampoBloque['tipo']
    actualizar(campo.tempId, {
      metricaId,
      tipo,
      opciones: tieneOpciones(tipo) ? (campo.opciones.length ? campo.opciones : ['']) : [],
    })
  }

  return (
    <div className="space-y-3">
      {/* Encabezado de la sección */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Preguntas del bloque{' '}
          <span className="text-gray-400 font-normal">(opcional)</span>
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

      {/* Estado vacío */}
      {campos.length === 0 && (
        <p className="text-xs text-amber-600 text-center py-4 bg-amber-50 rounded-lg border border-dashed border-amber-200">
          Agregá al menos un campo para poder publicar la campaña.
        </p>
      )}

      {/* Lista de preguntas */}
      {campos.map((campo, idx) => {
        const estaExpandido = expandido === campo.tempId
        return (
          <div
            key={campo.tempId}
            className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
          >
            {/* ── Header de la pregunta ── */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-900">
              <GripVertical size={13} className="text-gray-500 shrink-0" />
              <span className="text-xs font-bold text-white tracking-wide shrink-0">
                Pregunta {idx + 1}
              </span>
              <p className="flex-1 text-sm text-gray-300 truncate min-w-0">
                {campo.pregunta
                  ? campo.pregunta
                  : <span className="text-gray-500 italic font-normal">Sin nombre</span>
                }
              </p>
              {metricaDe(campo, metricas) && (
                <span className="text-[10px] font-semibold text-emerald-300 shrink-0 hidden sm:inline bg-emerald-900/60 border border-emerald-700 px-2 py-0.5 rounded-full">
                  {metricaDe(campo, metricas)!.nombre}
                </span>
              )}
              <span className="text-[10px] font-medium text-gray-400 shrink-0 hidden sm:inline bg-gray-700 px-2 py-0.5 rounded-full">
                {TIPO_LABEL[campo.tipo]}
              </span>
              <button
                type="button"
                onClick={() => setExpandido(estaExpandido ? null : campo.tempId)}
                className="p-1 text-gray-400 hover:text-white transition-colors shrink-0"
                title={estaExpandido ? 'Colapsar' : 'Expandir'}
              >
                {estaExpandido ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              <button
                type="button"
                onClick={() => eliminar(campo.tempId)}
                className="p-1 text-gray-500 hover:text-red-400 transition-colors shrink-0"
                title="Eliminar pregunta"
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* ── Detalle expandido ── */}
            {estaExpandido && (
              <div className="p-4 space-y-4 bg-gray-50 border-t border-gray-200">

                {/* Campo: Pregunta / Instrucción */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    {campo.tipo === 'foto' ? 'Instrucción de la foto' : 'Texto de la pregunta'}
                  </label>
                  <input
                    type="text"
                    value={campo.pregunta}
                    onChange={e => actualizar(campo.tempId, { pregunta: e.target.value })}
                    placeholder={campo.tipo === 'foto' ? 'Ej: Fotografiá el precio del producto' : 'Ej: ¿El producto tiene precio visible?'}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${accentClass} transition`}
                  />
                </div>

                {/* Campo: Qué mide (métrica) */}
                {campo.tipo !== 'foto' && metricas.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      ¿Qué mide?{' '}
                      <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                    <select
                      value={campo.metricaId ?? ''}
                      onChange={e => elegirMetrica(campo, e.target.value)}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 ${accentClass} transition appearance-none cursor-pointer`}
                    >
                      <option value="">Sin métrica</option>
                      {metricas.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                      {metricaDe(campo, metricas)?.descripcion
                        ?? 'Tipificarla deja que el panel de la marca compare esta pregunta con las de otras campañas y consigo misma en el tiempo. Sin métrica, la respuesta se ve igual pero no entra en ninguna serie.'}
                    </p>
                  </div>
                )}

                {/* Campo: Tipo de respuesta */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Tipo de respuesta
                  </label>
                  <select
                    value={campo.tipo}
                    disabled={!!campo.metricaId}
                    onChange={e => actualizar(campo.tempId, {
                      tipo: e.target.value as CampoBloque['tipo'],
                      opciones: tieneOpciones(e.target.value as CampoBloque['tipo']) ? [''] : [],
                    })}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 ${accentClass} transition appearance-none ${campo.metricaId ? 'cursor-not-allowed bg-gray-100 text-gray-500' : 'cursor-pointer'}`}
                  >
                    {(Object.entries(TIPO_LABEL) as [CampoBloque['tipo'], string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  {campo.metricaId && (
                    <p className="flex items-start gap-1.5 text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                      <Lock size={11} className="shrink-0 mt-0.5" />
                      <span>
                        Lo fija la métrica. Para cambiarlo, elegí &ldquo;Sin métrica&rdquo; arriba.
                      </span>
                    </p>
                  )}
                </div>

                {/* Foto: aviso informativo */}
                {campo.tipo === 'foto' && (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                    <span>📷</span>
                    <span>El gondolero verá un botón para tomar una foto adicional en este campo.</span>
                  </div>
                )}

                {/* Campo: Opciones (solo para selección) */}
                {tieneOpciones(campo.tipo) && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Opciones de respuesta
                    </label>
                    <div className="space-y-2">
                      {campo.opciones.map((op, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-400 w-5 text-right shrink-0">
                            {oi + 1}.
                          </span>
                          <input
                            type="text"
                            value={op}
                            onChange={e => actualizarOpcion(campo.tempId, oi, e.target.value)}
                            placeholder={`Opción ${oi + 1}`}
                            className={`flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${accentClass} transition`}
                          />
                          {campo.opciones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => eliminarOpcion(campo.tempId, oi)}
                              className="p-1 text-gray-400 hover:text-red-400 transition-colors shrink-0"
                              title="Eliminar opción"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => agregarOpcion(campo.tempId)}
                        className="flex items-center gap-1 text-xs font-medium text-gondo-indigo-600 hover:text-gondo-indigo-400 transition-colors mt-1 ml-7"
                      >
                        <Plus size={11} />
                        Agregar opción
                      </button>
                    </div>
                  </div>
                )}

                {/* Campo: Obligatorio */}
                <div className="pt-1 border-t border-gray-200">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={campo.obligatorio}
                      onChange={e => actualizar(campo.tempId, { obligatorio: e.target.checked })}
                      className="w-4 h-4 accent-gondo-indigo-600 shrink-0"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      Respuesta obligatoria
                    </span>
                  </label>
                </div>

              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
