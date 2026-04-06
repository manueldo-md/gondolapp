'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'

interface Provincia    { id: number; nombre: string }
interface Departamento { id: number; nombre: string; provincia_id: number }
interface Localidad    { id: number; nombre: string }

interface Props {
  localidadesSeleccionadas: number[]
  onSeleccionadas: (ids: number[]) => void
  /** Clases extra para los selects (foco/border, según el actor) */
  accentClass?: string
  /** Mostrar el label de sección (default true) */
  showLabel?: boolean
}

export function SelectorZona({
  localidadesSeleccionadas,
  onSeleccionadas,
  accentClass = 'focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600',
  showLabel = true,
}: Props) {
  const [provincias, setProvincias]       = useState<Provincia[]>([])
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [localidades, setLocalidades]     = useState<Localidad[]>([])
  const [provinciaId, setProvinciaId]     = useState<number | ''>('')
  const [departamentoId, setDepartamentoId] = useState<number | ''>('')
  // nombre cache para chips: { [id]: nombre }
  const [nombres, setNombres] = useState<Record<number, string>>({})
  const didFetchInitial = useRef(false)

  // Cargar provincias al montar
  useEffect(() => {
    createClient()
      .from('provincias')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => setProvincias((data ?? []) as Provincia[]))
  }, [])

  // Pre-cargar nombres de localidades ya seleccionadas (para chips al editar)
  useEffect(() => {
    if (didFetchInitial.current || localidadesSeleccionadas.length === 0) {
      didFetchInitial.current = true
      return
    }
    didFetchInitial.current = true
    createClient()
      .from('localidades')
      .select('id, nombre')
      .in('id', localidadesSeleccionadas)
      .then(({ data }) => {
        if (!data) return
        const map: Record<number, string> = {}
        for (const l of data as Localidad[]) map[l.id] = l.nombre
        setNombres(prev => ({ ...prev, ...map }))
      })
  }, []) // solo al montar

  // Cargar departamentos cuando cambia la provincia
  useEffect(() => {
    if (!provinciaId) {
      setDepartamentos([])
      setDepartamentoId('')
      setLocalidades([])
      return
    }
    createClient()
      .from('departamentos')
      .select('id, nombre, provincia_id')
      .eq('provincia_id', provinciaId)
      .order('nombre')
      .then(({ data }) => {
        setDepartamentos((data ?? []) as Departamento[])
        setDepartamentoId('')
        setLocalidades([])
      })
  }, [provinciaId])

  // Cargar localidades cuando cambia el departamento
  useEffect(() => {
    if (!departamentoId) { setLocalidades([]); return }
    createClient()
      .from('localidades')
      .select('id, nombre')
      .eq('departamento_id', departamentoId)
      .order('nombre')
      .then(({ data }) => setLocalidades((data ?? []) as Localidad[]))
  }, [departamentoId])

  const toggle = (id: number, nombre: string) => {
    setNombres(prev => ({ ...prev, [id]: nombre }))
    const set = new Set(localidadesSeleccionadas)
    set.has(id) ? set.delete(id) : set.add(id)
    onSeleccionadas([...set])
  }

  const remove = (id: number) => {
    onSeleccionadas(localidadesSeleccionadas.filter(x => x !== id))
  }

  const selectBase = `w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none transition disabled:opacity-40 disabled:cursor-not-allowed ${accentClass}`

  return (
    <div className="space-y-2">
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700">
          Zonas de la campaña{' '}
          <span className="text-gray-400 font-normal">(opcional — vacío = todas)</span>
        </label>
      )}

      {/* Cascada de selects */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Provincia */}
        <select
          className={selectBase}
          value={provinciaId}
          onChange={e => setProvinciaId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Provincia…</option>
          {provincias.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>

        {/* Departamento */}
        <select
          className={selectBase}
          value={departamentoId}
          disabled={!provinciaId}
          onChange={e => setDepartamentoId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Departamento…</option>
          {departamentos.map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>

        {/* Localidades — lista con checkboxes */}
        <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-36">
          {!departamentoId ? (
            <p className="px-3 py-2.5 text-sm text-gray-400">
              {provinciaId ? 'Seleccioná departamento' : 'Seleccioná provincia'}
            </p>
          ) : localidades.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gray-400">Sin localidades</p>
          ) : (
            localidades.map(l => (
              <label
                key={l.id}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={localidadesSeleccionadas.includes(l.id)}
                  onChange={() => toggle(l.id, l.nombre)}
                  className="w-4 h-4 shrink-0"
                />
                <span className="text-sm text-gray-700">{l.nombre}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Chips de selección */}
      {localidadesSeleccionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {localidadesSeleccionadas.map(id => (
            <span
              key={id}
              className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full"
            >
              {nombres[id] ?? `Localidad ${id}`}
              <button
                type="button"
                onClick={() => remove(id)}
                className="text-gray-400 hover:text-gray-600 ml-0.5 shrink-0"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onSeleccionadas([])}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  )
}
