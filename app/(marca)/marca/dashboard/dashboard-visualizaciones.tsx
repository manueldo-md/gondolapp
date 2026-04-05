'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Visualizaciones CSS/Tailwind puras — sin recharts ni ninguna otra librería
// de charts. Solo react-leaflet para el mapa.
// Cargado con dynamic(..., { ssr: false }) desde page.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip as MapTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

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

// ── Helpers de color ──────────────────────────────────────────────────────────

function presenciaColor(pct: number): string {
  if (pct > 12) return '#166534'
  if (pct >= 8)  return '#16a34a'
  if (pct >= 5)  return '#ca8a04'
  return '#dc2626'
}

function presenciaLabel(pct: number): string {
  if (pct > 12) return 'Alta'
  if (pct >= 8)  return 'Media-alta'
  if (pct >= 5)  return 'Media'
  return 'Baja'
}

function presenciaBadgeClass(pct: number): string {
  if (pct > 12) return 'bg-green-100 text-green-800'
  if (pct >= 8)  return 'bg-emerald-50 text-emerald-700'
  if (pct >= 5)  return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

// ── Mapa de cobertura (react-leaflet) ─────────────────────────────────────────

function CoverageMap({ zonas }: { zonas: ZonaMapData[] }) {
  const zonasConCoords = zonas.filter(z => z.lat !== 0 && z.lng !== 0)

  if (zonasConCoords.length === 0) {
    return (
      <div className="space-y-2">
        {zonas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Los puntos de venta aparecerán aquí cuando haya fotos aprobadas con datos de zona.
          </p>
        ) : (
          zonas.map(z => (
            <div key={z.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
              <span className="font-medium text-gray-900">{z.nombre}</span>
              <div className="flex items-center gap-3">
                <span className="text-gray-500">{z.pdvRelevados} PDV</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: presenciaColor(z.presenciaPct) }}>
                  {z.presenciaPct}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="relative" style={{ height: 420 }}>
      <MapContainer
        center={[-34.6, -64.2]}
        zoom={5}
        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {zonasConCoords.map(z => (
          <CircleMarker
            key={z.id}
            center={[z.lat, z.lng]}
            radius={Math.max(8, Math.min(8 + Math.sqrt(z.pdvRelevados) * 3, 30))}
            fillColor={presenciaColor(z.presenciaPct)}
            color={presenciaColor(z.presenciaPct)}
            weight={2} opacity={1} fillOpacity={0.6}
          >
            <MapTooltip>
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-sm">{z.nombre}</p>
                <p>PDV: <strong>{z.pdvRelevados}</strong></p>
                <p>Con presencia: <strong>{z.conPresencia}</strong></p>
                <p>Presencia: <strong>{z.presenciaPct}%</strong> ({presenciaLabel(z.presenciaPct)})</p>
                <p>Fotos: <strong>{z.fotosRecibidas}</strong></p>
              </div>
            </MapTooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow px-3 py-2 text-xs space-y-1.5">
        {[
          { label: '> 12% — Alta',       color: '#166534' },
          { label: '8-12% — Media-alta', color: '#16a34a' },
          { label: '5-8% — Media',       color: '#ca8a04' },
          { label: '< 5% — Baja',        color: '#dc2626' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Presencia global — CSS conic-gradient donut ───────────────────────────────

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
      <div className="flex gap-6 text-sm">
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

// ── Penetración por campaña — barras horizontales CSS ─────────────────────────

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
      {/* Leyenda */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Presente</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-400" /> No encontrado</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-400" /> Solo competencia</span>
      </div>

      {data.map(d => {
        const pPresente       = d.total > 0 ? (d.presente       / d.total) * 100 : 0
        const pNoEncontrado   = d.total > 0 ? (d.noEncontrado   / d.total) * 100 : 0
        const pSoloCompetencia = d.total > 0 ? (d.soloCompetencia / d.total) * 100 : 0

        return (
          <div key={d.nombre}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 truncate max-w-[60%]">{d.nombre}</span>
              <span className="text-xs text-gray-500">{d.total} fotos · <span className="font-semibold text-green-700">{d.pct}% presencia</span></span>
            </div>
            <div className="flex h-5 rounded-md overflow-hidden bg-gray-100">
              {pPresente > 0 && (
                <div className="bg-green-500 h-full transition-all" style={{ width: `${pPresente}%` }} title={`Presente: ${d.presente}`} />
              )}
              {pNoEncontrado > 0 && (
                <div className="bg-red-400 h-full transition-all" style={{ width: `${pNoEncontrado}%` }} title={`No encontrado: ${d.noEncontrado}`} />
              )}
              {pSoloCompetencia > 0 && (
                <div className="bg-amber-400 h-full transition-all" style={{ width: `${pSoloCompetencia}%` }} title={`Solo competencia: ${d.soloCompetencia}`} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tipo de comercio — barras verticales CSS ──────────────────────────────────

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
    <div className="space-y-3">
      {/* Leyenda */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-200" /> PDV relevados</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-600" /> Con presencia</span>
      </div>

      {data.map(d => {
        const wRelev = (d.relevados   / maxVal) * 100
        const wPres  = (d.conPresencia / maxVal) * 100
        const pct    = d.relevados > 0 ? Math.round((d.conPresencia / d.relevados) * 100) : 0

        return (
          <div key={d.tipo}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800">{d.label}</span>
              <span className="text-xs text-gray-500">{d.conPresencia}/{d.relevados} PDV · <span className="font-semibold text-indigo-700">{pct}%</span></span>
            </div>
            <div className="space-y-1">
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-indigo-200 h-full rounded-full transition-all" style={{ width: `${wRelev}%` }} />
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${wPres}%` }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Evolución semanal — barras verticales CSS mini ────────────────────────────

function EvolucionBars({ data }: { data: EvolucionData[] }) {
  const maxVal = Math.max(...data.map(d => d.fotos), 1)
  const total  = data.reduce((s, d) => s + d.fotos, 0)

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
          const h = maxVal > 0 ? Math.max((d.fotos / maxVal) * 100, d.fotos > 0 ? 4 : 0) : 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Tooltip */}
              {d.fotos > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {d.fotos} fotos
                </div>
              )}
              <div
                className="w-full rounded-t-sm bg-indigo-500 transition-all"
                style={{ height: `${h}%` }}
              />
            </div>
          )
        })}
      </div>
      {/* Labels — solo mostrar cada 2 para no saturar */}
      <div className="flex gap-1 mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            {i % 2 === 0 && (
              <span className="text-[9px] text-gray-400 leading-none">{d.label}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-right">{total} fotos en las últimas 12 semanas</p>
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
        Sin ciudades relevadas aún. Los datos aparecerán cuando haya fotos aprobadas.
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
    { key: 'nombre',         label: 'Ciudad',          align: 'left'  },
    { key: 'pdvRelevados',   label: 'PDV relevados',   align: 'right' },
    { key: 'conPresencia',   label: 'Con presencia',   align: 'right' },
    { key: 'pdvRelevados',   label: 'Sin presencia',   align: 'right' },
    { key: 'presenciaPct',   label: 'Presencia %',     align: 'right' },
    { key: 'fotosRecibidas', label: 'Fotos',           align: 'right' },
    { key: 'ultimaVisita',   label: 'Última visita',   align: 'right' },
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

      {/* Mapa */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Cobertura por ciudad</h3>
          <p className="text-xs text-gray-400 mt-0.5">Tamaño = PDV relevados · Color = % presencia</p>
        </div>
        <div className="p-5">
          <CoverageMap zonas={zonaMapData} />
        </div>
      </div>

      {/* Presencia global + Penetración por campaña */}
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

      {/* Tabla ciudades */}
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
