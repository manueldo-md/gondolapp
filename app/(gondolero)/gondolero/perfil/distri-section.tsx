'use client'

import { useState, useTransition } from 'react'
import { Loader2, Truck, CheckCircle2, ChevronDown } from 'lucide-react'
import { solicitarVinculacion, desvincularseDeDistri } from './distri-actions'

interface DistriSectionProps {
  distriActual: { id: string; nombre: string } | null
  distribuidoras: { id: string; razon_social: string }[]
  solicitudPendiente: { distri_id: string; distri_nombre: string } | null
}

export function DistriSection({ distriActual, distribuidoras, solicitudPendiente }: DistriSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false)
  const [distriSeleccionada, setDistriSeleccionada] = useState('')
  const [mostrarSelector, setMostrarSelector] = useState(false)

  const showFeedback = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg })
    if (ok) setTimeout(() => setFeedback(null), 4000)
  }

  const handleSolicitar = () => {
    if (!distriSeleccionada) return
    startTransition(async () => {
      const res = await solicitarVinculacion(distriSeleccionada)
      if (res.error) {
        showFeedback(false, res.error)
      } else {
        setMostrarSelector(false)
        setDistriSeleccionada('')
        showFeedback(true, 'Solicitud enviada — la distribuidora debe aprobarla para quedar vinculado')
      }
    })
  }

  const handleDesvincular = () => {
    startTransition(async () => {
      const res = await desvincularseDeDistri()
      if (res.error) {
        showFeedback(false, res.error)
      } else {
        setConfirmarDesvincular(false)
        showFeedback(true, 'Te desvinculaste correctamente')
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Truck size={16} className="text-gondo-amber-400" />
        <h2 className="text-sm font-semibold text-gray-700">Mi distribuidora</h2>
      </div>

      {/* ── Vinculado ── */}
      {distriActual ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-green-500 shrink-0" />
              <span className="text-sm font-medium text-gray-800">{distriActual.nombre}</span>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
              Vinculado ✓
            </span>
          </div>

          {!confirmarDesvincular ? (
            <button
              onClick={() => setConfirmarDesvincular(true)}
              disabled={isPending}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Desvincularme
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-red-700 font-medium mb-2">
                ¿Confirmás que querés desvincularte de {distriActual.nombre}?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmarDesvincular(false)}
                  disabled={isPending}
                  className="flex-1 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDesvincular}
                  disabled={isPending}
                  className="flex-1 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
                >
                  {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Desvincularme'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Sin distri ── */
        <div className="space-y-3">
          {/* Solicitud pendiente */}
          {solicitudPendiente ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800 mb-0.5">⏳ Solicitud pendiente</p>
              <p className="text-xs text-amber-700">
                Esperando que <span className="font-medium">{solicitudPendiente.distri_nombre}</span> apruebe tu solicitud.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin distribuidora vinculada</p>
          )}

          {/* Selector */}
          {!solicitudPendiente && (
            <>
              {!mostrarSelector ? (
                <button
                  onClick={() => setMostrarSelector(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gondo-verde-400 hover:text-gondo-verde-600 transition-colors"
                >
                  <span>+ Solicitar vinculación</span>
                  <ChevronDown size={12} />
                </button>
              ) : (
                <div className="space-y-2">
                  <select
                    value={distriSeleccionada}
                    onChange={e => setDistriSeleccionada(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 bg-white"
                  >
                    <option value="">Elegí una distribuidora</option>
                    {distribuidoras.map(d => (
                      <option key={d.id} value={d.id}>{d.razon_social}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setMostrarSelector(false); setDistriSeleccionada('') }}
                      disabled={isPending}
                      className="flex-1 py-2 text-xs font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSolicitar}
                      disabled={isPending || !distriSeleccionada}
                      className="flex-1 py-2 text-xs font-semibold bg-gondo-verde-400 text-white rounded-xl hover:bg-gondo-verde-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enviar solicitud'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`mt-3 p-3 rounded-xl text-xs font-medium ${
          feedback.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
