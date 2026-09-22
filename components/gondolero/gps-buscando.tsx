'use client'

import { Loader2, Navigation } from 'lucide-react'

/**
 * Lo que se ve mientras el GPS busca señal.
 *
 * Está en un componente y no escrito dos veces porque los dos pasos de captura
 * —`comercios-gps` y `gps`— muestran exactamente lo mismo, y el día que uno de
 * los textos cambie tiene que cambiar en los dos.
 *
 * **Ninguno de estos tres estados es un error.** El watch sigue vivo y el fix
 * casi siempre llega; lo único que cambia es cuánto contamos de lo que está
 * pasando. Hasta el 22/9/2026 acá aparecía "No pudimos obtener tu ubicación"
 * a los 15 segundos, con el GPS todavía buscando y el fix a punto de llegar.
 */
export function GpsBuscando({
  tardando,
  necesitaAyuda,
  onReintentar,
}: {
  tardando: boolean
  necesitaAyuda: boolean
  onReintentar: () => void
}) {
  // ≥60 s. Deja de ser "esperá" y pasa a ser "probá esto".
  if (necesitaAyuda) {
    return (
      <>
        <Navigation size={36} className="text-amber-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700 mb-1">Está tardando más de lo normal</p>
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          Si no aparece, revisá que la ubicación del teléfono esté activada y
          probá al aire libre.
        </p>
        <button
          onClick={onReintentar}
          className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch"
        >
          Reintentar
        </button>
      </>
    )
  }

  // ≥12 s. El caso sin señal: decirle que es normal evita que crea que se colgó.
  if (tardando) {
    return (
      <>
        <Loader2 size={36} className="text-gondo-verde-400 mx-auto mb-3 animate-spin" />
        <p className="text-sm font-medium text-gray-700 mb-1">Buscando señal GPS</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Sin datos móviles puede tardar hasta un minuto. Seguí esperando.
        </p>
      </>
    )
  }

  return (
    <>
      <Loader2 size={36} className="text-gondo-verde-400 mx-auto mb-3 animate-spin" />
      <p className="text-sm text-gray-600">Obteniendo tu ubicación...</p>
    </>
  )
}
