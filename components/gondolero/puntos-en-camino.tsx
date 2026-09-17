'use client'

/**
 * PuntosEnCamino
 *
 * Los puntos que el gondolero ganó y todavía no puede canjear, separados en los
 * casos que importan: los que esperan revisión, los que esperan VALIDACIÓN del
 * comercio (una campaña de altas: es otro acto y lo hace otra persona) y los que
 * esperan el mínimo, que es el único donde puede accionar.
 * Ver lib/puntos-retenidos.ts.
 *
 * "En camino" y no "retenidos": *retenido* suena a castigo y esto es plata suya
 * que va a llegar.
 *
 * NO se renderiza nada cuando no hay puntos en camino. Un "todo al día"
 * permanente es ruido que el gondolero deja de leer, y el saldo disponible ya
 * está arriba.
 */

import { useState } from 'react'
import { ChevronDown, Hourglass } from 'lucide-react'
import { formatearPuntos } from '@/lib/utils'
import { frasePuntosRetenidos, type ResumenRetenidos } from '@/lib/puntos-retenidos'

/** Cuántas campañas arrancan abiertas. Las dos más accionables. */
const ABIERTAS_POR_DEFECTO = 2

export function PuntosEnCamino({ resumen }: { resumen: ResumenRetenidos }) {
  const [expandidas, setExpandidas] = useState<Set<string>>(
    () => new Set(resumen.campanas.slice(0, ABIERTAS_POR_DEFECTO).map(c => c.campanaId))
  )

  if (resumen.total === 0) return null

  const toggle = (id: string) =>
    setExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Encabezado: el total responde "¿cuánto tengo en camino?" */}
      <div className="px-4 py-3 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <Hourglass size={15} className="text-amber-500 shrink-0" />
          <p className="text-base font-bold text-amber-900">
            {formatearPuntos(resumen.total)} pts en camino
          </p>
        </div>
        <p className="text-xs text-amber-700 mt-0.5">
          Ganados, todavía no disponibles para canjear.
        </p>
        {/* El desglose solo si hay más de un motivo: con uno solo repetiría el
            total de arriba. "Validación" va aparte de "aprobación" a propósito —
            son dos actos distintos que hace otra persona. */}
        {(() => {
          const partes: string[] = []
          if (resumen.totalEsperandoAprobacion > 0) partes.push(`${formatearPuntos(resumen.totalEsperandoAprobacion)} esperando aprobación`)
          if (resumen.totalEsperandoValidacion > 0) partes.push(`${formatearPuntos(resumen.totalEsperandoValidacion)} esperando validación`)
          if (resumen.totalEsperandoMinimo > 0)     partes.push(`${formatearPuntos(resumen.totalEsperandoMinimo)} esperando el mínimo`)
          if (partes.length < 2) return null
          return <p className="text-[11px] text-amber-600 mt-1">{partes.join(' · ')}</p>
        })()}
      </div>

      {/* Detalle por campaña. Cada una tiene su propio mínimo, así que el
          "faltan" NO se puede sumar entre campañas: completar el mínimo de una
          no desbloquea las otras. Por eso el total va arriba en puntos y la
          acción va acá, campaña por campaña. */}
      <ul className="divide-y divide-amber-100">
        {resumen.campanas.map(c => {
          const abierta = expandidas.has(c.campanaId)
          const frase = frasePuntosRetenidos(c)
          const puntos = c.puntosEsperandoAprobacion + c.puntosEsperandoMinimo + c.puntosEsperandoValidacion

          return (
            <li key={c.campanaId}>
              <button
                onClick={() => toggle(c.campanaId)}
                className="w-full px-4 py-2.5 flex items-center gap-2 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900 truncate">{c.nombre}</p>
                  {!abierta && (
                    <p className="text-xs text-amber-700">
                      {formatearPuntos(puntos)} pts · {frase.principal}
                    </p>
                  )}
                </div>
                <ChevronDown
                  size={15}
                  className={`text-amber-500 shrink-0 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`}
                />
              </button>

              {abierta && (
                <div className="px-4 pb-3 -mt-1">
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">{formatearPuntos(puntos)} pts</span> · {frase.principal}
                  </p>
                  {frase.detalle && (
                    <p className="text-xs text-amber-600 mt-0.5">{frase.detalle}</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
