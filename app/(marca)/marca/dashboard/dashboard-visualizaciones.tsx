'use client'

// ─────────────────────────────────────────────────────────────────────────────
// 100% CSS/Tailwind + React puro. Sin recharts, sin leaflet, sin ninguna
// librería externa de visualización o mapas.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, MapPin } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ZonaMapData = {
  id: string
  nombre: string
  lat: number
  lng: number
  pdvRelevados: number
  conPresencia: number
  presenciaPct: number
  fotosRecibidas: number
}

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

export type PenetracionData = {
  nombre: string
  presente: number
  noEncontrado: number
  soloCompetencia: number
  total: number
  pct: number
}

export type TipoComercioData = {
  tipo: string
  label: string
  relevados: number
  conPresencia: number
}

export type EvolucionData = {
  label: string
  fotos: number
}

export type DashboardVisualizacionesProps = {
  zonaMapData: ZonaMapData[]
  ciudadRows: CiudadRow[]
  penetracionData: PenetracionData[]
  tipoComercioData: TipoComercioData[]
  semanas: EvolucionData[]
  totalFotos: number
  conPresenciaGlobal: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function presenciaBadgeClass(pct: number) {
  if (pct > 12) return 'bg-green-100 text-green-800'
  if (pct >= 8)  return 'bg-emerald-50 text-emerald-700'
  if (pct >= 5)  return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function presenciaBarColor(pct: number) {
  if (pct > 12) return 'bg-green-500'
  if (pct >= 8)  return 'bg-emerald-400'
  if (pct >= 5)  return 'bg-amber-400'
  return 'bg-red-400'
}

// ── Cobertura por ciudad (reemplaza mapa Leaflet) ─────────────────────────────

function CoberturaGrid({ zonas }: { zonas: ZonaMapData[] }) {
  if (zonas.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-400">
        Los puntos de venta aparecerán aquí cuando haya fotos aprobadas con datos de zona.
      </div>
    )
  }

  const sorted = [...zonas].sort((a, b) => b.pdvRelevados - a.pdvRelevados)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map(z => (
        <div key={z.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="text-sm font-semibold text-gray-900 truncate">{z.nombre}</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${presenciaBadgeClass(z.presenciaPct)}`}>
              {z.presenciaPct}%
            </span>
          </div>

          {/* Barra de presencia */}
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all ${presenciaBarColor(z.presenciaPct)}`}
              style={{ width: `${Math.min(z.presenciaPct, 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-400">PDV</p>
              <p className="text-sm font-bold text-gray-900">{z.pdvRelevados}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Con pres.</p>
              <p className="text-sm font-bold text-green-700">{z.conPresencia}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Fotos</p>
              <p className="text-sm font-bold text-gray-600">{z.fotosRecibidas}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Presencia global — CSS conic-gradient ─────────────────────────────────────

function PresenciaDonut({ presente, ausente }: { presente: number; ausente: number }) {
  const total = presente + ausente
  if (total === 0) return null
  const pct = Math.round((presente / total) * 100)
  const deg = Math.round((presente / total) * 360)

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div
        className="relative w-32 h-32 rounded-full"
        style={{ background: `conic-gradient(#22c55e 0deg ${deg}deg, #fca5a5 ${deg}deg 360deg)` }}
      >
        <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{pct}%</span>
        </div>
      </div>
      <div className="flex gap-5 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-600">{presente} con presencia</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-300" />
          <span className="text-gray-600">{ausente} sin presencia</span>
        </div>
      </div>
    </div>
  )
}

// ── Penetración por campaña — barras horizontales apiladas ────────────────────

function PenetracionBars({ data }: { data: PenetracionData[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        Activá campañas para empezar a relevar la presencia de tus productos en góndola.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" />Presente</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-400" />No encontrado</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-400" />Solo competencia</span>
      </div>
      {data.map(d => {
        const pP = d.total > 0 ? (d.presente        / d.total) * 100 : 0
        const pN = d.total > 0 ? (d.noEncontrado    / d.total) * 100 : 0
        const pS = d.total > 0 ? (d.soloCompetencia / d.total) * 100 : 0
        return (
          <div key={d.nombre}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 truncate max-w-[60%]">{d.nombre}</span>
              <span className="text-xs text-gray-500">
                {d.total} fotos · <span className="font-semibold text-green-700">{d.pct}%</span>
              </span>
            </div>
            <div className="flex h-5 rounded-md overflow-hidden bg-gray-100">
              {pP > 0 && <div className="bg-green-500 h-full" style={{ width: `${pP}%` }} title={`Presente: ${d.presente}`} />}
              {pN > 0 && <div className="bg-red-400  h-full" style={{ width: `${pN}%` }} title={`No encontrado: ${d.noEncontrado}`} />}
              {pS > 0 && <div className="bg-amber-400 h-full" style={{ width: `${pS}%` }} title={`Solo competencia: ${d.soloCompetencia}`} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tipo de comercio — barras paralelas CSS ───────────────────────────────────

function TipoComercioChart({ data }: { data: TipoComercioData[] }) {
  if (data.length === 0 || data.every(d => d.relevados === 0)) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        Los datos de tipo de comercio aparecerán cuando haya fotos aprobadas.
      </p>
    )
  }

  const maxVal = Math.max(...data.map(d => d.relevados), 1)

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-200" />PDV relevados</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-600" />Con presencia</span>
      </div>
      {data.map(d => {
        const wR = (d.relevados    / maxVal) * 100
        const wP = (d.conPresencia / maxVal) * 100
        const pct = d.relevados > 0 ? Math.round((d.conPresencia / d.relevados) * 100) : 0
        return (
          <div key={d.tipo}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800">{d.label}</span>
              <span className="text-xs text-gray-500">
                {d.conPresencia}/{d.relevados} PDV · <span className="font-semibold text-indigo-700">{pct}%</span>
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-200 rounded-full" style={{ width: `${wR}%` }} />
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${wP}%` }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Evolución semanal — mini barras verticales ────────────────────────────────

function EvolucionBars({ data }: { data: EvolucionData[] }) {
  const total  = data.reduce((s, d) => s + d.fotos, 0)
  const maxVal = Math.max(...data.map(d => d.fotos), 1)

  if (total === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        La evolución temporal aparecerá cuando haya fotos recibidas en tus campañas.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d, i) => {
          const h = d.fotos > 0 ? Math.max((d.fotos / maxVal) * 100, 4) : 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              {d.fotos > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {d.fotos} fotos
                </div>
              )}
              <div className="w-full rounded-t-sm bg-indigo-500" style={{ height: `${h}%` }} />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1 mt-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            {i % 3 === 0 && <span className="text-[9px] text-gray-400">{d.label}</span>}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-right">{total} fotos · últimas 12 semanas</p>
    </div>
  )
}

// ── Tabla de ciudades ─────────────────────────────────────────────────────────

type SortKey = 'nombre' | 'pdvRelevados' | 'conPresencia' | 'presenciaPct' | 'fotosRecibidas' | 'ultimaVisita'

function CiudadTable({ rows }: { rows: CiudadRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pdvRelevados')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Sin ciudades relevadas aún.
      </div>
    )
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? ''
    const bv = b[sortKey] ?? ''
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
  })

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ArrowUp   size={12} className="text-indigo-600" />
      : <ArrowDown size={12} className="text-indigo-600" />
  }

  const cols: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'nombre',         label: 'Ciudad',        align: 'left'  },
    { key: 'pdvRelevados',   label: 'PDV',           align: 'right' },
    { key: 'conPresencia',   label: 'Con pres.',     align: 'right' },
    { key: 'pdvRelevados',   label: 'Sin pres.',     align: 'right' },
    { key: 'presenciaPct',   label: 'Presencia %',   align: 'right' },
    { key: 'fotosRecibidas', label: 'Fotos',         align: 'right' },
    { key: 'ultimaVisita',   label: 'Última visita', align: 'right' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {cols.map((col, i) => (
              <th
                key={`${col.key}-${i}`}
                onClick={() => handleSort(col.key)}
                className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                <span className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                  {col.align === 'right' && <SortIcon col={col.key} />}
                  {col.label}
                  {col.align === 'left'  && <SortIcon col={col.key} />}
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
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${presenciaBadgeClass(r.presenciaPct)}`}>
                  {r.presenciaPct}%
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-700">{r.fotosRecibidas}</td>
              <td className="px-4 py-3 text-right text-xs text-gray-400">
                {r.ultimaVisita
                  ? new Date(r.ultimaVisita).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DashboardVisualizaciones({
  zonaMapData,
  ciudadRows,
  penetracionData,
  tipoComercioData,
  semanas,
  totalFotos,
  conPresenciaGlobal,
}: DashboardVisualizacionesProps) {
  return (
    <div className="space-y-6">

      {/* Cobertura por ciudad (cards) */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Cobertura por ciudad</h3>
          <p className="text-xs text-gray-400 mt-0.5">Ordenado por PDV relevados</p>
        </div>
        <div className="p-5">
          <CoberturaGrid zonas={zonaMapData} />
        </div>
      </div>

      {/* Presencia global + Penetración */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Presencia global</h3>
          </div>
          <div className="p-5">
            {totalFotos === 0
              ? <p className="text-sm text-gray-400 text-center py-8">Sin datos aún.</p>
              : <PresenciaDonut presente={conPresenciaGlobal} ausente={totalFotos - conPresenciaGlobal} />
            }
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Penetración por campaña</h3>
            <p className="text-xs text-gray-400 mt-0.5">Resultado declarado por foto aprobada</p>
          </div>
          <div className="p-5">
            <PenetracionBars data={penetracionData} />
          </div>
        </div>
      </div>

      {/* Tipo de comercio */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Presencia por tipo de comercio</h3>
        </div>
        <div className="p-5">
          <TipoComercioChart data={tipoComercioData} />
        </div>
      </div>

      {/* Tabla de ciudades */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Análisis por ciudad</h3>
          <p className="text-xs text-gray-400 mt-0.5">Hacé clic en los encabezados para ordenar</p>
        </div>
        <CiudadTable rows={ciudadRows} />
      </div>

      {/* Evolución semanal */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Evolución semanal de fotos recibidas</h3>
          <p className="text-xs text-gray-400 mt-0.5">Últimas 12 semanas</p>
        </div>
        <div className="p-5">
          <EvolucionBars data={semanas} />
        </div>
      </div>

    </div>
  )
}
