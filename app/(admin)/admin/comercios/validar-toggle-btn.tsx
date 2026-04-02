'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toggleValidarComercio } from './actions'

export function ValidarToggleBtn({ comercioId, validado }: { comercioId: string; validado: boolean }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await toggleValidarComercio(comercioId, !validado) })}
      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
        validado
          ? 'bg-red-50 text-red-600 hover:bg-red-100'
          : 'bg-gondo-amber-50 text-gondo-amber-400 hover:bg-gondo-amber-100'
      }`}
    >
      {isPending ? <Loader2 size={11} className="animate-spin" /> : validado ? 'Invalidar' : 'Validar'}
    </button>
  )
}
