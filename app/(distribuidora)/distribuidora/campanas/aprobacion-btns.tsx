'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarCampana, rechazarCampana } from './actions'

export function AprobacionBtns({ campanaId }: { campanaId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')

  function handleAprobar() {
    setError(null)
    startTransition(async () => {
      const result = await aprobarCampana(campanaId)
      if (result?.error) setError(result.error)
    })
  }

  function handleConfirmarRechazo() {
    setError(null)
    startTransition(async () => {
      const result = await rechazarCampana(campanaId, motivo.trim() || undefined)
      if (result?.error) setError(result.error)
      else setRechazando(false)
    })
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">{error}</p>
      )}

      {rechazando ? (
        <div className="space-y-2">
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo del rechazo (opcional)..."
            rows={2}
            className="w-full px-2.5 py-2 text-xs border border-red-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-red-400 focus:border-red-400 bg-white"
          />
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={handleConfirmarRechazo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Confirmar rechazo
            </button>
            <button
              disabled={pending}
              onClick={() => { setRechazando(false); setMotivo('') }}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={handleAprobar}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Aprobar campaña
          </button>
          <button
            disabled={pending}
            onClick={() => setRechazando(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <XCircle size={13} />
            Rechazar
          </button>
        </div>
      )}
    </div>
  )
}
