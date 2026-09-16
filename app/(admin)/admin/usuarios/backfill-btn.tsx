'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * Forma que devuelve todo backfill del panel: asignados y fallidos POR SEPARADO,
 * con el detalle de quiénes quedaron sin arreglar. Un backfill que corrige la
 * mitad y reporta solo los éxitos es peor que uno que no corre, porque deja
 * creer que terminó.
 */
export type ResultadoBackfill = {
  asignados: number
  fallidos: number
  detalle: string[]
  error?: string
}

type Mensaje = { tono: 'ok' | 'error' | 'aviso'; texto: string; detalle?: string[] } | null

/**
 * Botón de backfill con su reporte. Lo comparten "Asignar alias" y "Asignar
 * códigos": son el mismo gesto sobre columnas distintas, y tenerlo dos veces es
 * cómo se llegó a que uno de los dos se tragara los errores en silencio.
 */
export function BackfillBtn({
  icono,
  label,
  labelCorriendo,
  titulo,
  textoVacio,
  sustantivo,
  pendientes,
  ejecutar,
}: {
  icono: ReactNode
  label: string
  labelCorriendo: string
  titulo: string
  /** Qué decir cuando no había nada que hacer. Ej: "Todos tienen código ✓" */
  textoVacio: string
  /** Para el mensaje de éxito. Ej: "códigos asignados" */
  sustantivo: string
  /** Contador en el botón. Omitido si no se sabe. */
  pendientes?: number
  ejecutar: () => Promise<ResultadoBackfill>
}) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<Mensaje>(null)

  const handleClick = () => {
    startTransition(async () => {
      const res = await ejecutar()

      if (res.error) {
        setMsg({ tono: 'error', texto: `Error: ${res.error}` })
      } else if (res.fallidos > 0) {
        // Con fallidos el mensaje NO se autodescarta: si quedó gente afuera, el
        // admin tiene que verlo y volver a intentar.
        setMsg({
          tono: 'aviso',
          texto: `${res.asignados} asignados, ${res.fallidos} sin resolver`,
          detalle: res.detalle,
        })
        return
      } else if (res.asignados === 0) {
        setMsg({ tono: 'ok', texto: textoVacio })
      } else {
        setMsg({ tono: 'ok', texto: `✓ ${res.asignados} ${sustantivo}` })
      }
      setTimeout(() => setMsg(null), 4000)
    })
  }

  const colorChip =
    msg?.tono === 'error' ? 'bg-red-100 text-red-700'
    : msg?.tono === 'aviso' ? 'bg-amber-100 text-amber-800'
    : 'bg-green-100 text-green-700'

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${colorChip}`}>
          {msg.texto}
          {msg.detalle && msg.detalle.length > 0 && (
            <span className="block font-normal mt-0.5">
              Sin resolver: {msg.detalle.join(', ')}
            </span>
          )}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        title={titulo}
      >
        {isPending ? <Loader2 size={13} className="animate-spin" /> : icono}
        {isPending ? labelCorriendo : label}
        {!isPending && pendientes !== undefined && pendientes > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
            {pendientes}
          </span>
        )}
      </button>
    </div>
  )
}
