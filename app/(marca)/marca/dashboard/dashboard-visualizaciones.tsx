'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ESTE ARCHIVO es el único punto de entrada para recharts + leaflet.
// Se carga SIEMPRE con dynamic(() => import('./dashboard-visualizaciones'), { ssr: false })
// de modo que ninguna de estas librerías se evalúa durante el SSR de Next.js.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Tooltip as MapTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

// ── Types (copiados para evitar cross-imports que rompan el tree-shaking) ────

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

// ── Mapa de cobertura ─────────────────────────────────────────────────────────

function CoverageMap({ zonas }: { zonas: ZonaMapData[] }) {
  const zonasConCoords = zonas.filter(z => z.lat != null && z.lng != null)

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
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: presenciaColor(z.presenciaPct) }}
                >
                  {z.presenciaPct}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  const center: [number, number] = [-34.6, -64.2]

  return (
    <div className="relative" style={{ height: 420 }}>
      <MapContainer
        center={center}
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
            weight={2}
            opacity={1}
            fillOpacity={0.6}
          >
            <MapTooltip>
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-sm">{z.nombre}</p>
                <p>PDV relevados: <strong>{z.pdvRelevados}</strong></p>
                <p>Con presencia: <strong>{z.conPresencia}</strong></p>
                <p>Presencia: <strong>{z.presenciaPct}%</strong> ({presenciaLabel(z.presenciaPct)})</p>
                <p>Fotos recibidas: <strong>{z.fotosRecibidas}</strong></p>
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

// ── Penetración por campaña ───────────────────────────────────────────────────

function PenetracionChart({ data }: { data: PenetracionData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400 text-center px-6">
        Activá campañas para empezar a relevar la presencia de tus productos en góndola.
      </div>
    )
  }

  const chartData = data.map(d => ({
    nombre: d.nombre.length > 28 ? d.nombre.slice(0, 25) + '…' : d.nombre,
    'Presente': d.presente,
    'No encontrado': d.noEncontrado,
    'Solo competencia': d.soloCompetencia,
    pct: d.pct,
  }))

  return (
    <div style={{ height: Math.max(120, data.length * 52 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="nombre" width={160} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(val: number, name: string) => [`${val} fotos`, name]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Presente"          stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
          <Bar dataKey="No encontrado"     stackId="a" fill="#f87171" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Solo competencia"  stackId="a" fill="#fbbf24" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Tipo de comercio ──────────────────────────────────────────────────────────

function TipoComercioChart({ data }: { data: TipoComercioData[] }) {
  if (data.length === 0 || data.every(d => d.relevados === 0)) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400 text-center px-6">
        Los datos de tipo de comercio aparecerán cuando haya fotos aprobadas.
      </div>
    )
  }
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="relevados"    name="PDV relevados" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
          <Bar dataKey="conPresencia" name="Con presencia" fill="#4f46e5" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Evolución temporal ────────────────────────────────────────────────────────

function EvolucionChart({ data }: { data: EvolucionData[] }) {
  if (data.length === 0 || data.every(d => d.fotos === 0)) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400 text-center px-6">
        La evolución temporal aparecerá cuando haya fotos recibidas en tus campañas.
      </div>
    )
  }
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="colorFotos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(val: number) => [`${val} fotos`, 'Fotos recibidas']}
          />
          <Area
            type="monotone"
            dataKey="fotos"
            name="Fotos recibidas"
            stroke="#4f46e5"
            strokeWidth={2}
            fill="url(#colorFotos)"
            dot={{ fill: '#4f46e5', r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Pie de presencia global ───────────────────────────────────────────────────

function PresenciaPieChart({ presente, ausente }: { presente: number; ausente: number }) {
  const total = presente + ausente
  if (total === 0) return null

  const data = [
    { name: 'Con presencia', value: presente, color: '#22c55e' },
    { name: 'Sin presencia', value: ausente,  color: '#f87171' },
  ]

  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={38}
            outerRadius={56}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(val: number) => [`${val} PDV`, '']}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Tabla de ciudades ─────────────────────────────────────────────────────────

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
    const av: string | number = a[sortKey] ?? ''
    const bv: string | number = b[sortKey] ?? ''
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
    { key: 'pdvRelevados',   label: 'Sin presencia',   align: 'right' }, // sorted by pdvRelevados
    { key: 'presenciaPct',   label: 'Presencia %',     align: 'right' },
    { key: 'fotosRecibidas', label: 'Fotos recibidas', align: 'right' },
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
                className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                onClick={() => handleSort(col.key)}
              >
                <span className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                  {col.align === 'right' && <SortIcon col={col.key} />}
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
              <td className="px-4 py-3 text-right"><PresenciaBadge pct={r.presenciaPct} /></td>
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

// ── Sección wrapper ───────────────────────────────────────────────────────────

function SectionCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Componente principal (default export) ─────────────────────────────────────

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

      {/* Pie + Penetración */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Presencia global">
          {totalFotos === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400 text-center px-6">
              Sin datos de presencia aún.
            </div>
          ) : (
            <PresenciaPieChart presente={conPresenciaGlobal} ausente={totalFotos - conPresenciaGlobal} />
          )}
        </SectionCard>
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Penetración por campaña</h3>
            <p className="text-xs text-gray-400 mt-0.5">Resultado declarado por foto</p>
          </div>
          <div className="p-5">
            <PenetracionChart data={penetracionData} />
          </div>
        </div>
      </div>

      {/* Tipo de comercio */}
      <SectionCard title="Presencia por tipo de comercio">
        <TipoComercioChart data={tipoComercioData} />
      </SectionCard>

      {/* Tabla de ciudades */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Análisis por ciudad</h3>
          <p className="text-xs text-gray-400 mt-0.5">Hacé clic en los encabezados para ordenar</p>
        </div>
        <CiudadTable rows={ciudadRows} />
      </div>

      {/* Evolución */}
      <SectionCard title="Evolución semanal de fotos recibidas">
        <EvolucionChart data={semanas} />
      </SectionCard>

    </div>
  )
}
