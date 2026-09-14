/**
 * components/campanas/modulos/piezas.tsx
 * Piezas compartidas por todos los módulos: encabezado, barra de proporción y
 * estado vacío.
 *
 * `BarraProporcion` es la barra de divs que ya existía en el panel viejo,
 * extraída a un solo lugar. En la etapa 2 se reemplaza por SVG acá adentro y
 * los cinco módulos lo heredan sin tocarlos.
 */

import React from 'react'

export function ModuloHeader({
  pregunta,
  base,
  nota,
}: {
  pregunta: string
  base: number
  nota?: string
}) {
  return (
    <div className="mb-3">
      <p className="text-sm font-medium text-gray-800">{pregunta}</p>
      <p className="text-xs text-gray-400 mt-0.5">
        {base === 0
          ? 'Sin respuestas todavía'
          : `${base} respuesta${base !== 1 ? 's' : ''}`}
        {nota ? ` · ${nota}` : ''}
      </p>
    </div>
  )
}

export function BarraProporcion({
  label,
  n,
  total,
  color,
}: {
  label: string
  n: number
  total: number
  color: string
}) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1 gap-2">
        <span className="truncate">{label}</span>
        <span className="font-semibold shrink-0">{n} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Un módulo sin respuestas no se oculta: se muestra vacío.
 * Que nadie haya contestado una pregunta es un resultado del relevamiento,
 * no una fila que falta.
 */
export function ModuloVacio({ mensaje }: { mensaje?: string }) {
  return (
    <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
      {mensaje ?? 'Ningún relevamiento respondió esta pregunta todavía.'}
    </p>
  )
}
