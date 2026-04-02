'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { validarComercio } from './actions'

export function ValidarBtn({ comercioId }: { comercioId: string }) {
  const [hecho, setHecho] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (hecho) {
    return (
      <div className="flex items-center justify-center gap-1 text-green-600">
        <CheckCircle2 size={14} />
        <span className="text-xs font-medium">Validado</span>
      </div>
    )
  }

  const handleValidar = () => {
    startTransition(async () => {
      const result = await validarComercio(comercioId)
      if (!result?.error) setHecho(true)
    })
  }

  return (
    <button
      onClick={handleValidar}
      disabled={isPending}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-gondo-amber-400 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {isPending
        ? <Loader2 size={12} className="animate-spin" />
        : <CheckCircle2 size={12} />
      }
      Validar
    </button>
  )
}
