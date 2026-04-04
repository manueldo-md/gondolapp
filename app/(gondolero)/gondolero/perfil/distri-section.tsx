'use client'

import { useState, useTransition } from 'react'
import { Loader2, Truck, CheckCircle2 } from 'lucide-react'
import { desvincularseDeDistri } from './distri-actions'

interface DistriSectionProps {
  distriActual: { id: string; nombre: string } | null
  solicitudPendiente: { distri_id: string; distri_nombre: string } | null
}

export function DistriSection({ distriActual, solicitudPendiente }: DistriSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false)

  const showFeedback = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg })
    if (ok) setTimeout(() => setFeedback(null), 4000)
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
            <div className="space-y-2">
              <p className="text-sm text-gray-400">Sin distribuidora vinculada</p>
              <p className="text-xs text-gray-400">
                Pedile a tu distribuidora que te invite por link o que ingrese tu código personal para vincularte.
              </p>
            </div>
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
