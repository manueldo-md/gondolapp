'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface CampanaOption  { id: string; nombre: string }
interface GondoleroOption { id: string; nombre: string | null; alias: string | null }

export interface FiltrosValues {
  estado?:       string
  campana_id?:   string
  gondolero_id?: string
  declaracion?:  string
  desde?:        string
  hasta?:        string
  comercio_id?:  string
}

export function FiltrosArchivo({
  campanas,
  gondoleros,
  filtros,
}: {
  campanas:   CampanaOption[]
  gondoleros: GondoleroOption[]
  filtros:    FiltrosValues
}) {
  const router   = useRouter()
  const pathname = usePathname()

  const actualizarFiltro = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams()
      params.set('tab', 'archivo')

      const prev: Record<string, string | undefined> = {
        estado:       filtros.estado,
        campana_id:   filtros.campana_id,
        gondolero_id: filtros.gondolero_id,
        declaracion:  filtros.declaracion,
        desde:        filtros.desde,
        hasta:        filtros.hasta,
        comercio_id:  filtros.comercio_id,
      }

      for (const [k, v] of Object.entries(prev)) {
        if (k !== key && v) params.set(k, v)
      }
      if (value) params.set(key, value)

      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, filtros],
  )

  const hayFiltros = !!(
    filtros.estado ||
    filtros.campana_id ||
    filtros.gondolero_id ||
    filtros.declaracion ||
    filtros.desde ||
    filtros.hasta
  )

  function limpiarFiltros() {
    router.push(`${pathname}?tab=archivo`)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">

        {/* Estado */}
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
            Estado
          </label>
          <select
            value={filtros.estado ?? ''}
            onChange={e => actualizarFiltro('estado', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-amber-400"
          >
            <option value="">Todas</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobada">Aprobada</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>

        {/* Declaración */}
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
            Declaración
          </label>
          <select
            value={filtros.declaracion ?? ''}
            onChange={e => actualizarFiltro('declaracion', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-amber-400"
          >
            <option value="">Todas</option>
            <option value="producto_presente">Presente</option>
            <option value="producto_no_encontrado">No encontrado</option>
            <option value="solo_competencia">Solo competencia</option>
          </select>
        </div>

        {/* Campaña */}
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
            Campaña
          </label>
          <select
            value={filtros.campana_id ?? ''}
            onChange={e => actualizarFiltro('campana_id', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-amber-400"
          >
            <option value="">Todas</option>
            {campanas.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        {/* Gondolero */}
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
            Gondolero
          </label>
          <select
            value={filtros.gondolero_id ?? ''}
            onChange={e => actualizarFiltro('gondolero_id', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-amber-400"
          >
            <option value="">Todos</option>
            {gondoleros.map(g => (
              <option key={g.id} value={g.id}>{g.alias ?? g.nombre ?? g.id}</option>
            ))}
          </select>
        </div>

        {/* Fecha desde */}
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
            Desde
          </label>
          <input
            type="date"
            value={filtros.desde ?? ''}
            onChange={e => actualizarFiltro('desde', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-amber-400"
          />
        </div>

        {/* Fecha hasta */}
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={filtros.hasta ?? ''}
            onChange={e => actualizarFiltro('hasta', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-amber-400"
          />
        </div>

      </div>

      {hayFiltros && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={limpiarFiltros}
            className="text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  )
}
