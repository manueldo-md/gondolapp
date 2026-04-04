'use client'

import { useTransition } from 'react'
import { terminarRelacion } from './actions'

interface Props {
  relacionId: string
}

export function TerminarRelacionBtn({ relacionId }: Props) {
  const [isPending, startTransition] = useTransition()

  const handleTerminar = () => {
    startTransition(async () => {
      await terminarRelacion(relacionId)
    })
  }

  return (
    <button
      onClick={handleTerminar}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
    >
      {isPending ? 'Terminando...' : 'Terminar'}
    </button>
  )
}
