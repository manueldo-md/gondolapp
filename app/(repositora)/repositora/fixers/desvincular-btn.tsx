'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { desvincularFixer } from './invitar-actions'

interface Props {
  fixerId: string
  repoId: string
  repoNombre: string
  fixerAlias: string
}

export function FixerRepoDesvincularBtn({ fixerId, repoId, repoNombre, fixerAlias }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirmar() {
    startTransition(async () => {
      const res = await desvincularFixer(fixerId, repoId, repoNombre)
      if (res.error) {
        setError(res.error)
        setConfirmando(false)
      }
    })
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">¿Confirmar?</span>
        <button
          onClick={() => setConfirmando(false)}
          disabled={isPending}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirmar}
          disabled={isPending}
          className="text-xs text-red-600 font-semibold hover:text-red-800 transition-colors flex items-center gap-1"
        >
          {isPending ? <Loader2 size={11} className="animate-spin" /> : null}
          Sí, desvincular
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => setConfirmando(true)}
        className="text-xs text-red-500 hover:text-red-700 transition-colors"
      >
        Desvincular
      </button>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}
