/**
 * components/shared/foto-distancia.tsx
 *
 * A qué distancia del comercio se sacó la foto.
 *
 * POR QUÉ EXISTE: hasta el 15/9/2026 la distancia no se calculaba en ningún
 * lado. Una misión hecha a 1,5 km llegaba al panel idéntica a una hecha en la
 * puerta, y el que aprobaba no tenía forma de notarlo. Guardarla en la base sin
 * mostrarla no habría cambiado nada: el valor del dato está en que lo vea la
 * persona que decide.
 *
 * Tres bandas, que son las mismas que usa la captura:
 *   ≤ 50m    — en el comercio
 *   50-200m  — lejos pero defendible: un GPS urbano impreciso se va decenas de
 *              metros, así que no es señal de nada por sí solo
 *   > 200m   — no lo explica ningún error de GPS. La captura en vivo lo bloquea;
 *              si una foto llegó igual, vino de la cola offline y entró marcada
 *              a propósito (el gondolero pudo haber validado contra coordenadas
 *              que después se corrigieron). Es justamente el caso que hay que
 *              mirar a ojo.
 */

import { MapPin } from 'lucide-react'

export function FotoDistancia({ metros }: { metros: number | null | undefined }) {
  // null = foto anterior al cambio, o sin coordenadas. No es 0 y no se inventa.
  if (metros == null) return null

  const texto = metros >= 1000
    ? `${(metros / 1000).toFixed(1)} km`
    : `${metros} m`

  const estilo = metros > 200
    ? 'bg-red-50 text-red-700 border-red-200'
    : metros > 50
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-gray-50 text-gray-500 border-gray-200'

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${estilo}`}
      title={`La foto se sacó a ${texto} de la ubicación registrada del comercio`}
    >
      <MapPin size={10} className="shrink-0" />
      {texto} del comercio
    </span>
  )
}
