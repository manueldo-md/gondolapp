'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarFotoAdmin, rechazarFotoAdmin } from './actions'
import { SelectorMotivoRechazo } from '@/components/shared/selector-motivo-rechazo'

export function FotoAccionesAdmin({ fotoId }: { fotoId: string }) {
  const [pendingAprobar, startAprobar] = useTransition()
  const [pendingRechazar, startRechazar] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)

  const ocupado = pendingAprobar || pendingRechazar

  const handleConfirmarRechazo = () => {
    startRechazar(async () => {
      await rechazarFotoAdmin(fotoId, motivo ?? undefined)
    })
  }

  if (rechazando) {
    return (
      <div className="pt-1 space-y-2">
        <SelectorMotivoRechazo onChange={setMotivo} disabled={ocupado} />
        <div className="flex gap-2">
          <button
            onClick={handleConfirmarRechazo}
            disabled={ocupado || !motivo}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {pendingRechazar ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
            Confirmar rechazo
          </button>
          <button
            onClick={() => { setRechazando(false); setMotivo(null) }}
            disabled={ocupado}
            className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 pt-1">
      <button
        disabled={ocupado}
        onClick={() => startAprobar(async () => { await aprobarFotoAdmin(fotoId) })}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        {pendingAprobar ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Aprobar
      </button>
      <button
        disabled={ocupado}
        onClick={() => setRechazando(true)}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        {pendingRechazar ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
        Rechazar
      </button>
    </div>
  )
}
