'use client'

import { useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export type CiudadRow = {
  id: string
  nombre: string
  pdvRelevados: number
  conPresencia: number
  sinPresencia: number
  fotosRecibidas: number
  ultimaVisita: string | null
  presenciaPct: number
}

type SortKey = 'nombre' | 'pdvRelevados' | 'conPresencia' | 'presenciaPct' | 'fotosRecibidas' | 'ultimaVisita'

function PresenciaBadge({ pct }: { pct: number }) {
  const cfg =
    pct > 12 ? { label: `${pct}%`, className: 'bg-green-100 text-green-800' } :
    pct >= 8  ? { label: `${pct}%`, className: 'bg-emerald-50 text-emerald-700' } :
    pct >= 5  ? { label: `${pct}%`, className: 'bg-amber-50 text-amber-700' } :
                { label: `${pct}%`, className: 'bg-red-50 text-red-700' }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export function CiudadTable({ rows }: { rows: CiudadRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pdvRelevados')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Sin ciudades relevadas aún. Los datos aparecerán cuando haya fotos aprobadas.
      </div>
    )
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let av: string | number = a[sortKey] ?? ''
    let bv: string | number = b[sortKey] ?? ''
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    av = Number(av)
    bv = Number(bv)
    return sortDir === 'asc' ? av - bv : bv - av
  })

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ArrowUp size={12} className="text-gondo-indigo-600" />
      : <ArrowDown size={12} className="text-gondo-indigo-600" />
  }

  const cols: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'nombre',        label: 'Ciudad',          align: 'left'  },
    { key: 'pdvRelevados',  label: 'PDV relevados',   align: 'right' },
    { key: 'conPresencia',  label: 'Con presencia',   align: 'right' },
    { key: 'sinPresencia' as SortKey,  label: 'Sin presencia',   align: 'right' },
    { key: 'presenciaPct',  label: 'Presencia %',     align: 'right' },
    { key: 'fotosRecibidas',label: 'Fotos recibidas', align: 'right' },
    { key: 'ultimaVisita',  label: 'Última visita',   align: 'right' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {cols.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                onClick={() => handleSort(col.key === ('sinPresencia' as SortKey) ? 'pdvRelevados' : col.key)}
              >
                <span className="flex items-center gap-1 justify-end">
                  {col.align === 'right' && <SortIcon col={col.key === ('sinPresencia' as SortKey) ? 'pdvRelevados' : col.key} />}
                  {col.label}
                  {col.align === 'left' && <SortIcon col={col.key} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map(r => (
            <tr key={r.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900">{r.nombre}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">{r.pdvRelevados}</td>
              <td className="px-4 py-3 text-right text-green-700 font-medium">{r.conPresencia}</td>
              <td className="px-4 py-3 text-right text-red-600 font-medium">{r.sinPresencia}</td>
              <td className="px-4 py-3 text-right">
                <PresenciaBadge pct={r.presenciaPct} />
              </td>
              <td className="px-4 py-3 text-right text-gray-700">{r.fotosRecibidas}</td>
              <td className="px-4 py-3 text-right text-xs text-gray-400">
                {r.ultimaVisita
                  ? new Date(r.ultimaVisita).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
