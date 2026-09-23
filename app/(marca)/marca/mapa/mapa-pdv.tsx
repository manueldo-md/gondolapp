'use client'

/**
 * SPIKE — mapa de PDV con pigeon-maps.
 *
 * Existe para medir el costo real en el bundle antes de decidir. Si el número
 * no convence, esto se borra entero junto con la dependencia.
 */

import { Map, Marker } from 'pigeon-maps'

export interface PuntoMapa {
  id: string
  nombre: string
  lat: number
  lng: number
  /** `true` presente, `false` ausente, `null` sin medir. */
  presente: boolean | null
  tipo: string | null
}

/** CARTO Positron. Sin API key — verificado: responde 200 y ~6 kB por tile. */
function tilesCarto(x: number, y: number, z: number, dpr?: number) {
  const s = 'abcd'[(x + y) % 4]
  return `https://${s}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}${dpr && dpr >= 2 ? '@2x' : ''}.png`
}

const COLOR = { si: '#16a34a', no: '#dc2626', sin: '#9ca3af' }

export function MapaPdv({ puntos }: { puntos: PuntoMapa[] }) {
  const lats = puntos.map(p => p.lat)
  const lngs = puntos.map(p => p.lng)
  const centro: [number, number] = puntos.length
    ? [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2]
    : [-32.0, -58.5]

  return (
    <div className="h-[520px] rounded-xl overflow-hidden border border-gray-200">
      <Map provider={tilesCarto} defaultCenter={centro} defaultZoom={9} attribution={
        <span className="text-[10px]">© OpenStreetMap · © CARTO</span>
      }>
        {puntos.map(p => (
          <Marker
            key={p.id}
            width={22}
            anchor={[p.lat, p.lng]}
            color={p.presente === null ? COLOR.sin : p.presente ? COLOR.si : COLOR.no}
          />
        ))}
      </Map>
    </div>
  )
}
