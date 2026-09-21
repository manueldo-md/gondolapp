'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Lock, AlertTriangle } from 'lucide-react'
import { metricasCompatibles, cambioDeMetricaPermitido, type Metrica } from '@/lib/metricas'
import { tipificarPregunta } from './actions'

export interface PreguntaFila {
  id: string
  pregunta: string
  tipo: string
  metricaId: string | null
  respuestas: number
  campanaId: string | null
  campanaNombre: string
  campanaEstado: string | null
  campanaCreada: string | null
}

const TIPO_LABEL: Record<string, string> = {
  seleccion_multiple: 'Selección múltiple',
  seleccion_unica:    'Selección única',
  binaria:            'Sí / No',
  numero:             'Número',
  texto:              'Texto libre',
}

export function TablaTipificar({
  filas,
  metricas,
}: {
  filas: PreguntaFila[]
  metricas: Metrica[]
}) {
  // El valor optimista de cada fila. El server action revalida la ruta, pero
  // hasta que vuelve el render el selector tiene que mostrar lo que se eligió.
  const [elegido, setElegido] = useState<Record<string, string | null>>({})
  const [error, setError] = useState<Record<string, string>>({})
  const [guardado, setGuardado] = useState<Record<string, boolean>>({})
  const [pendiente, setPendiente] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function metricaActual(fila: PreguntaFila): string | null {
    return fila.id in elegido ? elegido[fila.id] : fila.metricaId
  }

  function guardar(fila: PreguntaFila, valor: string) {
    const nueva = valor || null
    const actual = metricaActual(fila)
    if (nueva === actual) return

    // El mismo criterio que la action, para no ofrecer algo que va a rebotar.
    const permiso = cambioDeMetricaPermitido({ actual, nueva, respuestas: fila.respuestas })
    if (!permiso.ok) {
      setError(e => ({ ...e, [fila.id]: permiso.motivo }))
      return
    }

    setError(e => ({ ...e, [fila.id]: '' }))
    setPendiente(fila.id)
    startTransition(async () => {
      const res = await tipificarPregunta(fila.id, nueva)
      setPendiente(null)
      if (res.error) {
        setError(e => ({ ...e, [fila.id]: res.error! }))
        return
      }
      setElegido(s => ({ ...s, [fila.id]: nueva }))
      setGuardado(g => ({ ...g, [fila.id]: true }))
      setTimeout(() => setGuardado(g => ({ ...g, [fila.id]: false })), 2500)
    })
  }

  if (filas.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-10 bg-white rounded-xl border border-gray-200">
        No hay preguntas cargadas todavía.
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2.5">Pregunta</th>
            <th className="px-4 py-2.5 w-40">Tipo</th>
            <th className="px-4 py-2.5 w-28 text-right">Respuestas</th>
            <th className="px-4 py-2.5 w-64">¿Qué mide?</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map(fila => {
            const actual = metricaActual(fila)
            const compatibles = metricasCompatibles(metricas, fila.tipo)

            // Con respuestas cargadas, lo único permitido es tipificar lo que
            // está sin tipificar. Una vez puesta, la métrica queda fija.
            const bloqueada = fila.respuestas > 0 && actual !== null
            const msg = error[fila.id]

            return (
              <tr key={fila.id} className="align-top hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-gray-900 font-medium leading-snug">
                    {fila.pregunta || <span className="italic text-gray-400">Sin texto</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fila.campanaNombre}
                    {fila.campanaEstado && (
                      <span className="text-gray-400"> · {fila.campanaEstado}</span>
                    )}
                  </p>
                </td>

                <td className="px-4 py-3 text-gray-600">
                  {TIPO_LABEL[fila.tipo] ?? fila.tipo}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                  {fila.respuestas}
                </td>

                <td className="px-4 py-3">
                  {compatibles.length === 0 ? (
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Ninguna métrica del catálogo se mide con respuestas de este
                      tipo.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={actual ?? ''}
                        disabled={bloqueada || pendiente === fila.id}
                        onChange={e => guardar(fila, e.target.value)}
                        className={`flex-1 min-w-0 px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition ${
                          bloqueada
                            ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'border-gray-300 bg-white text-gray-900 cursor-pointer'
                        }`}
                      >
                        <option value="">Sin métrica</option>
                        {compatibles.map(m => (
                          <option key={m.id} value={m.id}>{m.nombre}</option>
                        ))}
                      </select>
                      {pendiente === fila.id && (
                        <Loader2 size={15} className="animate-spin text-gray-400 shrink-0" />
                      )}
                      {guardado[fila.id] && pendiente !== fila.id && (
                        <Check size={15} className="text-emerald-600 shrink-0" />
                      )}
                      {bloqueada && !guardado[fila.id] && pendiente !== fila.id && (
                        <Lock size={13} className="text-gray-400 shrink-0" />
                      )}
                    </div>
                  )}

                  {bloqueada && !msg && (
                    <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                      Ya tiene {fila.respuestas}{' '}
                      {fila.respuestas === 1 ? 'respuesta' : 'respuestas'}: cambiarla
                      cambiaría qué significan.
                    </p>
                  )}

                  {msg && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5 leading-relaxed">
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      <span>{msg}</span>
                    </p>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
