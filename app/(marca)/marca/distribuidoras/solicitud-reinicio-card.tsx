'use client'

import { useState, useTransition } from 'react'
import { Loader2, RefreshCw, Check, X } from 'lucide-react'
import { aceptarReinicioMarca, rechazarReinicioMarca } from './reinicio-actions'

interface Props {
  solicitudId: string
  relacionId: string
  distriNombre: string
  relacionFechaInicio: string
}

export function SolicitudReinicioCardMarca({
  solicitudId, relacionId, distriNombre, relacionFechaInicio,
}: Props) {
  const [aceptaTyc, setAceptaTyc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPendingAceptar, startAceptar] = useTransition()
  const [isPendingRechazar, startRechazar] = useTransition()

  function handleAceptar() {
    if (!aceptaTyc) {
      setError('Debés aceptar los términos y condiciones para continuar.')
      return
    }
    startAceptar(async () => {
      const res = await aceptarReinicioMarca(solicitudId, relacionId)
      if (res.error) setError(res.error)
    })
  }

  function handleRechazar() {
    startRechazar(async () => {
      const res = await rechazarReinicioMarca(solicitudId, relacionId)
      if (res.error) setError(res.error)
    })
  }

  const isPending = isPendingAceptar || isPendingRechazar

  return (
    <div className="bg-[#1E1B4B]/5 border border-[#1E1B4B]/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-[#1E1B4B]/10 rounded-full flex items-center justify-center shrink-0">
          <RefreshCw size={14} className="text-[#1E1B4B]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            <span className="text-[#1E1B4B]">{distriNombre}</span> quiere reiniciar la relación
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Relación anterior activa desde {new Date(relacionFechaInicio).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>

          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={aceptaTyc}
              onChange={e => { setAceptaTyc(e.target.checked); setError(null) }}
              className="mt-0.5 w-4 h-4 accent-[#1E1B4B]"
              disabled={isPending}
            />
            <span className="text-xs text-gray-600">
              Acepto los <span className="text-[#1E1B4B] underline">términos y condiciones</span> y autorizo el intercambio de información comercial entre las partes.
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-600 mt-2 bg-red-50 px-3 py-1.5 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRechazar}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isPendingRechazar ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              Rechazar
            </button>
            <button
              onClick={handleAceptar}
              disabled={isPending || !aceptaTyc}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E1B4B] rounded-lg hover:bg-[#2d2a6e] transition-colors disabled:opacity-50"
            >
              {isPendingAceptar ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Aceptar y reiniciar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
