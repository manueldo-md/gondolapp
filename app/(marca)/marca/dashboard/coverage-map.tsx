'use client'

import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

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

function ZonaListFallback({ zonas }: { zonas: ZonaMapData[] }) {
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

export function CoverageMap({ zonas }: { zonas: ZonaMapData[] }) {
  const zonasConCoords = zonas.filter(z => z.lat != null && z.lng != null)

  if (zonasConCoords.length === 0) {
    return <ZonaListFallback zonas={zonas} />
  }

  // Center of Argentina as default
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
            <Tooltip>
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-sm">{z.nombre}</p>
                <p>PDV relevados: <strong>{z.pdvRelevados}</strong></p>
                <p>Con presencia: <strong>{z.conPresencia}</strong></p>
                <p>Presencia: <strong>{z.presenciaPct}%</strong> ({presenciaLabel(z.presenciaPct)})</p>
                <p>Fotos recibidas: <strong>{z.fotosRecibidas}</strong></p>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legend */}
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
