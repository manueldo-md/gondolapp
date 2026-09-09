'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarFoto, rechazarFoto } from './actions'
import { SelectorMotivoRechazo } from '@/components/shared/selector-motivo-rechazo'

export function FotoAccionesRepo({ fotoId }: { fotoId: string }) {
  const [pendingAprobar, startAprobar] = useTransition()
  const [pendingRechazar, startRechazar] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)

  const ocupado = pendingAprobar || pendingRechazar

  const handleConfirmarRechazo = () => {
    startRechazar(async () => {
      await rechazarFoto(fotoId, motivo ?? undefined)
    })
  }

  if (rechazando) {
    return (
      <div className="space-y-2">
        <SelectorMotivoRechazo onChange={setMotivo} disabled={ocupado} />
        <div className="flex gap-2">
          <button
            onClick={handleConfirmarRechazo}
            disabled={ocupado || !motivo}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {pendingRechazar ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Confirmar rechazo
          </button>
          <button
            onClick={() => { setRechazando(false); setMotivo(null) }}
            disabled={ocupado}
            className="px-4 py-2.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => startAprobar(async () => { await aprobarFoto(fotoId) })}
        disabled={ocupado}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {pendingAprobar ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        Aprobar
      </button>
      <button
        onClick={() => setRechazando(true)}
        disabled={ocupado}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        {pendingRechazar ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
        Rechazar
      </button>
    </div>
  )
}
