import type { PrecioRelevado } from '@/lib/precios-relevados'

/**
 * Los precios relevados en la misión de esta foto.
 *
 * Se muestran TODOS: una misión puede medir el precio de dos productos, y
 * quedarse con uno sería elegir por el que revisa. Con uno solo la pregunta
 * queda de contexto en gris; con varios es lo único que los distingue, así que
 * ahí pesa más.
 *
 * Sin `Intl.NumberFormat`: el separador de miles ayuda a leer 7777 pero el
 * valor tiene que verse tal cual se cargó, porque el punto de este badge es
 * detectar el dato raro, no presentarlo prolijo.
 */
export function PreciosFoto({
  precios,
  className = '',
}: {
  precios: PrecioRelevado[]
  className?: string
}) {
  if (precios.length === 0) return null

  return (
    <div className={`space-y-0.5 ${className}`}>
      {precios.map((p, i) => (
        <p key={i} className="text-[11px] leading-tight">
          <span className="font-medium text-gray-700">💲 ${p.valor}</span>
          {p.pregunta && (
            <span className="text-gray-400 font-normal"> · {p.pregunta}</span>
          )}
        </p>
      ))}
    </div>
  )
}
