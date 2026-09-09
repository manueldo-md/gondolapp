'use client'

import { useState } from 'react'

/**
 * Motivos de rechazo de foto.
 *
 * Por qué el motivo es obligatorio: desde que existe la recaptura, el gondolero
 * rehace la foto a partir de lo que dice el rechazo. Rechazar sin explicar lo
 * manda a repetir el mismo error a ciegas.
 *
 * El motivo viaja a `fotos.motivo_rechazo` y también al texto de la
 * notificación que recibe el gondolero, así que se lee antes de volver al
 * comercio. Escribirlo pensando en eso: tiene que decirle qué corregir.
 */
export const MOTIVOS_RECHAZO = [
  'Foto borrosa o fuera de foco',
  'No se ve el producto',
  'No corresponde al comercio',
  'Foto repetida',
] as const

const OTRO = 'Otro'

/**
 * Selector de motivo. Reporta el motivo resuelto, o `null` mientras no haya uno
 * válido — con "Otro" el texto libre es obligatorio, así que hasta que se
 * escriba algo sigue devolviendo null y el llamador mantiene el botón de
 * confirmar deshabilitado.
 */
export function SelectorMotivoRechazo({
  onChange,
  disabled,
}: {
  onChange: (motivo: string | null) => void
  disabled?: boolean
}) {
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [textoLibre, setTextoLibre] = useState('')

  const elegir = (m: string) => {
    setSeleccionado(m)
    onChange(m === OTRO ? (textoLibre.trim() || null) : m)
  }

  const escribir = (t: string) => {
    setTextoLibre(t)
    if (seleccionado === OTRO) onChange(t.trim() || null)
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-gray-500">Motivo del rechazo</p>

      <div className="flex flex-wrap gap-1.5">
        {[...MOTIVOS_RECHAZO, OTRO].map(m => {
          const activo = seleccionado === m
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => elegir(m)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
                activo
                  ? 'border-red-400 bg-red-50 text-red-700 font-semibold'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {m}
            </button>
          )
        })}
      </div>

      {seleccionado === OTRO && (
        <textarea
          value={textoLibre}
          onChange={e => escribir(e.target.value)}
          placeholder="Contá qué pasó, para que sepa qué corregir"
          rows={2}
          autoFocus
          disabled={disabled}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-red-300 placeholder:text-gray-400 disabled:opacity-50"
        />
      )}
    </div>
  )
}
