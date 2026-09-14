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
import { MapPin, Clock, User } from 'lucide-react'
import type { ContextoRespuesta } from '@/lib/resultados'

/**
 * Dónde y cuándo se relevó una respuesta.
 *
 * La usan el módulo de texto y el de número: son la misma lista con distinto
 * contenido a la izquierda, así que el contexto se dibuja en un solo lugar. Si
 * mañana se agrega la provincia o el link al comercio, se agrega acá y los dos
 * lo heredan.
 */
export function ContextoLinea({
  contexto,
  verAgente,
}: {
  contexto: ContextoRespuesta
  verAgente: boolean
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-400">
      {contexto.comercio && (
        <span className="flex items-center gap-1 min-w-0">
          <MapPin size={11} className="shrink-0" />
          <span className="truncate">
            {contexto.comercio}
            {contexto.ciudad ? ` · ${contexto.ciudad}` : ''}
          </span>
        </span>
      )}
      {verAgente && contexto.alias && (
        <span className="flex items-center gap-1">
          <User size={11} className="shrink-0" />
          {contexto.alias}
        </span>
      )}
      {contexto.fecha && (
        <span className="flex items-center gap-1">
          <Clock size={11} className="shrink-0" />
          {new Date(contexto.fecha).toLocaleDateString('es-AR')}
        </span>
      )}
    </div>
  )
}

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
