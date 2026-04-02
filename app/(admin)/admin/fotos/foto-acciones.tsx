'use client'

import { useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarFotoAdmin, rechazarFotoAdmin } from './actions'

export function FotoAccionesAdmin({ fotoId }: { fotoId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex gap-2 pt-1">
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await aprobarFotoAdmin(fotoId) })}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Aprobar
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await rechazarFotoAdmin(fotoId) })}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
        Rechazar
      </button>
    </div>
  )
}
