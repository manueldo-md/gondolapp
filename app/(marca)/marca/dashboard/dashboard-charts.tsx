'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area, Cell, PieChart, Pie, Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Penetración por campaña (horizontal bars) ────────────────────────────────

const TIPO_COLORS = ['#4f46e5', '#7c3aed', '#a855f7', '#d946ef', '#f43f5e', '#ef4444']

export function PenetracionChart({ data }: { data: PenetracionData[] }) {
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
          <Bar dataKey="Presente"         stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
          <Bar dataKey="No encontrado"     stackId="a" fill="#f87171" radius={[0,0,0,0]} />
          <Bar dataKey="Solo competencia" stackId="a" fill="#fbbf24" radius={[0,4,4,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Presencia por tipo de comercio (barras agrupadas) ─────────────────────────

export function TipoComercioChart({ data }: { data: TipoComercioData[] }) {
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
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="relevados"    name="PDV relevados"   fill="#c7d2fe" radius={[3,3,0,0]} />
          <Bar dataKey="conPresencia" name="Con presencia"   fill="#4f46e5" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Evolución temporal (area chart) ──────────────────────────────────────────

export function EvolucionChart({ data }: { data: EvolucionData[] }) {
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

// ── Mini pie para presencia global ───────────────────────────────────────────

export function PresenciaPieChart({ presente, ausente }: { presente: number; ausente: number }) {
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
