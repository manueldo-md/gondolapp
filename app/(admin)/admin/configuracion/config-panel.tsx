'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { guardarConfiguracion } from './actions'
import type { ConfigRow } from './page'

interface SeccionInfo {
  key: string
  label: string
  emoji: string
}

export function ConfigPanel({
  config,
  secciones,
}: {
  config: ConfigRow[]
  secciones: SeccionInfo[]
}) {
  const seccionesConDatos = secciones.filter(s => config.some(c => c.seccion === s.key))
  const [tabActivo, setTabActivo] = useState(seccionesConDatos[0]?.key ?? 'fotos')

  const rows = config.filter(c => c.seccion === tabActivo)

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 flex-wrap mb-5">
        {seccionesConDatos.map(s => (
          <button
            key={s.key}
            onClick={() => setTabActivo(s.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tabActivo === s.key
                ? 'bg-[#1E1B4B] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <span>{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Tabla de parámetros */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Parámetro</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Valor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Última modificación</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(row => (
              <ConfigRowItem key={row.clave} row={row} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">Sin parámetros en esta sección</p>
        )}
      </div>
    </div>
  )
}

function ConfigRowItem({ row }: { row: ConfigRow }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(row.valor)
  const [guardado, setGuardado] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleGuardar = () => {
    startTransition(async () => {
      const result = await guardarConfiguracion(row.clave, valor)
      if (!result?.error) {
        setEditando(false)
        setGuardado(true)
        setTimeout(() => setGuardado(false), 2000)
      }
    })
  }

  const handleCancelar = () => {
    setValor(row.valor)
    setEditando(false)
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3.5">
        <p className="font-medium text-gray-900 text-sm">{row.descripcion}</p>
        <p className="text-[11px] text-gray-400 font-mono mt-0.5">{row.clave}</p>
      </td>
      <td className="px-4 py-3.5">
        {editando ? (
          <input
            type={row.tipo === 'numero' ? 'number' : 'text'}
            value={valor}
            onChange={e => setValor(e.target.value)}
            autoFocus
            className="w-28 px-2 py-1.5 border border-amber-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/20"
            onKeyDown={e => { if (e.key === 'Enter') handleGuardar(); if (e.key === 'Escape') handleCancelar() }}
          />
        ) : (
          <span className={`font-mono text-sm font-semibold ${guardado ? 'text-green-600' : 'text-gray-900'}`}>
            {valor}
            {guardado && <Check size={12} className="inline ml-1 text-green-500" />}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-xs text-gray-400">
        {row.updated_at ? (
          <div>
            <p>{tiempoRelativo(row.updated_at)}</p>
            {row.updater_nombre && (
              <p className="text-[10px] text-gray-300">{row.updater_nombre}</p>
            )}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {editando ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleGuardar}
              disabled={isPending}
              className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              title="Guardar"
            >
              {isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button
              onClick={handleCancelar}
              className="p-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
              title="Cancelar"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditando(true)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Editar"
          >
            <Pencil size={13} />
          </button>
        )}
      </td>
    </tr>
  )
}
