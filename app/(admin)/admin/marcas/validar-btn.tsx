'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { validarMarca } from './actions'

export function ValidarMarcaBtn({ marcaId }: { marcaId: string }) {
  const [hecho, setHecho] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (hecho) {
    return (
      <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
        <CheckCircle2 size={13} />
        Validada
      </div>
    )
  }

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => {
        await validarMarca(marcaId)
        setHecho(true)
      })}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-gondo-indigo-50 text-gondo-indigo-600 text-xs font-semibold rounded-lg hover:bg-gondo-indigo-100 transition-colors disabled:opacity-60"
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
      Validar
    </button>
  )
}
