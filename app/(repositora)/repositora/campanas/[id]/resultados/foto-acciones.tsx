'use client'

import { useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarFoto, rechazarFoto } from './actions'

export function FotoAccionesRepo({ fotoId }: { fotoId: string }) {
  const [pendingAprobar, startAprobar] = useTransition()
  const [pendingRechazar, startRechazar] = useTransition()

  const ocupado = pendingAprobar || pendingRechazar

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
        onClick={() => startRechazar(() => rechazarFoto(fotoId))}
        disabled={ocupado}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        {pendingRechazar ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
        Rechazar
      </button>
    </div>
  )
}
