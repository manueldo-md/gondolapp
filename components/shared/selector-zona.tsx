'use client'

import { useState, useEffect } from 'react'
import { useCascadaLocalidad } from './cascada-localidad'
import { X, Plus, MapPin, Check } from 'lucide-react'

// ── Tipo exportado para que los padres lo usen ────────────────
export interface GrupoZona {
  provinciaId:       number
  provinciaNombre:   string
  departamentoId:    number
  departamentoNombre: string
  /** IDs concretos de localidades incluidas en este grupo */
  localidadIds:      number[]
  /** true cuando se eligió "Todas las localidades de [Depto]" */
  todas:             boolean
}


// ── Props ─────────────────────────────────────────────────────
interface Props {
  grupos:      GrupoZona[]
  onGrupos:    (grupos: GrupoZona[]) => void
  /** Clases de foco/border para los selects según el actor */
  accentClass?: string
  /** Clase del botón "Agregar zona" */
  addBtnClass?: string
  /** Mostrar el label de sección (default true) */
  showLabel?:  boolean
}

// ── Componente ────────────────────────────────────────────────
export function SelectorZona({
  grupos,
  onGrupos,
  accentClass  = 'focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600',
  addBtnClass  = 'bg-gray-700 hover:bg-gray-600 text-white',
  showLabel    = true,
}: Props) {
  // ── Estado del picker ──────────────────────────────────────
  // La cascada provincia → departamento → localidad vive en un solo lugar:
  // esta pantalla elige VARIAS localidades y el selector del comercio elige
  // UNA, pero las tres consultas y las reglas de reseteo son las mismas. Dos
  // copias de eso es garantizar que una resetee al cambiar de provincia y la
  // otra no. Ver components/shared/cascada-localidad.ts.
  const {
    provincias, departamentos, localidades,
    provinciaId, departamentoId, elegirProvincia, elegirDepartamento, limpiar,
  } = useCascadaLocalidad()

  // Los nombres salen de las listas y ya no de `e.target.options[...].text`:
  // ese truco lee el texto del <option> renderizado, asi que depende de que el
  // DOM y el estado esten en sincronia.
  const provinciaNombre    = provincias.find(p => p.id === provinciaId)?.nombre ?? ''
  const departamentoNombre = departamentos.find(d => d.id === departamentoId)?.nombre ?? ''

  const [selLocal,  setSelLocal]  = useState<Set<number>>(new Set())
  const [todasSel,  setTodasSel]  = useState(false)

  // El hook trae las listas. Lo unico propio de esta pantalla es que al cambiar
  // de departamento se limpie lo tildado: las localidades son otras.
  useEffect(() => {
    setSelLocal(new Set())
    setTodasSel(false)
  }, [departamentoId])

  // ── Handlers ───────────────────────────────────────────────
  const toggleLocalidad = (id: number) => {
    if (todasSel) return
    setSelLocal(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleTodas = () => {
    setTodasSel(prev => {
      if (!prev) setSelLocal(new Set()) // limpiar individuales al activar "todas"
      return !prev
    })
  }

  // Si "todas" está seleccionado, solo habilitar cuando las localidades ya cargaron (> 0)
  // para evitar agregar un grupo vacío si el usuario hace click antes de que cargue el listado
  const canAgregar = !!departamentoId && (
    (todasSel && localidades.length > 0) || (!todasSel && selLocal.size > 0)
  )

  // Evitar agregar el mismo departamento dos veces
  const deptYaAgregado = grupos.some(g => g.departamentoId === departamentoId)

  const agregarZona = () => {
    if (!canAgregar || deptYaAgregado) return
    const localidadIds = todasSel ? localidades.map(l => l.id) : [...selLocal]
    onGrupos([
      ...grupos,
      {
        provinciaId:       provinciaId as number,
        provinciaNombre,
        departamentoId:    departamentoId as number,
        departamentoNombre,
        localidadIds,
        todas:             todasSel,
      },
    ])
    // Reset picker
    limpiar()
    setSelLocal(new Set()); setTodasSel(false)
  }

  const removeGrupo = (index: number) => onGrupos(grupos.filter((_, i) => i !== index))

  // ── Estilos compartidos ────────────────────────────────────
  const selectCls = `w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white
    focus:outline-none transition disabled:opacity-40 disabled:cursor-not-allowed ${accentClass}`

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Label opcional */}
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700">
          Zonas de la campaña{' '}
          <span className="text-gray-400 font-normal">(opcional — vacío = todas)</span>
        </label>
      )}

      {/* ── Picker ──────────────────────────────────────────── */}
      <div className="space-y-2 p-3 border border-gray-200 rounded-xl bg-gray-50/60">

        {/* Provincia + Departamento */}
        <div className="grid grid-cols-2 gap-2">
          <select
            className={selectCls}
            value={provinciaId}
            onChange={e => elegirProvincia(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Provincia…</option>
            {provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <select
            className={selectCls}
            value={departamentoId}
            disabled={!provinciaId}
            onChange={e => elegirDepartamento(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Departamento…</option>
            {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>

        {/* Lista de localidades */}
        {departamentoId && (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">

            {/* Opción "Todas las localidades" — primera, destacada */}
            <button
              type="button"
              onClick={toggleTodas}
              className={`w-full flex items-center gap-3 px-3 py-2.5 border-b text-left transition-colors ${
                todasSel
                  ? 'bg-blue-50 border-blue-100 text-blue-800'
                  : 'hover:bg-gray-50 text-gray-700 border-gray-100'
              }`}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                todasSel ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
                {todasSel && <Check size={10} className="text-white" />}
              </div>
              <span className="text-sm font-semibold">
                Todas las localidades de {departamentoNombre}
              </span>
              <span className="ml-auto text-xs text-gray-400 shrink-0">
                {localidades.length} loc.
              </span>
            </button>

            {/* Localidades individuales */}
            <div className={`max-h-36 overflow-y-auto divide-y divide-gray-50 ${todasSel ? 'opacity-40' : ''}`}>
              {localidades.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400">Sin localidades cargadas</p>
              ) : localidades.map(l => (
                <label
                  key={l.id}
                  className={`flex items-center gap-2.5 px-3 py-1.5 transition-colors ${
                    todasSel ? 'cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={todasSel || selLocal.has(l.id)}
                    disabled={todasSel}
                    onChange={() => toggleLocalidad(l.id)}
                    className="w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-sm text-gray-700">{l.nombre}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Mensaje si el departamento ya fue agregado */}
        {deptYaAgregado && departamentoId && (
          <p className="text-xs text-amber-600 font-medium">
            Este departamento ya fue agregado. Removelo primero para reemplazarlo.
          </p>
        )}

        {/* Botón Agregar zona */}
        <button
          type="button"
          onClick={agregarZona}
          disabled={!canAgregar || deptYaAgregado}
          className={`flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-semibold rounded-lg
            transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${addBtnClass}`}
        >
          <Plus size={14} />
          Agregar zona
        </button>
      </div>

      {/* ── Grupos ya seleccionados ──────────────────────────── */}
      {grupos.length > 0 && (
        <div className="space-y-1.5">
          {grupos.map((g, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-lg px-3 py-2.5"
            >
              <MapPin size={13} className="text-blue-500 shrink-0 mt-px" />
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-medium text-gray-800">{g.departamentoNombre}</span>
                <span className="text-gray-400 mx-1">·</span>
                <span className="text-gray-500">{g.provinciaNombre}</span>
                <span className="ml-2 text-xs text-blue-600 font-medium">
                  {g.todas
                    ? 'Todas las localidades'
                    : `${g.localidadIds.length} localidad${g.localidadIds.length !== 1 ? 'es' : ''}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeGrupo(i)}
                className="text-gray-300 hover:text-gray-500 shrink-0 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onGrupos([])}
            className="text-xs text-gray-400 hover:text-gray-600 underline pl-1"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  )
}
