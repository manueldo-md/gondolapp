'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { unirseACampana } from './actions'
import { AbandonarBtn } from '../../misiones/abandonar-btn'

export function UnirseButton({
  campanaId,
  yaUnido,
}: {
  campanaId: string
  yaUnido: boolean
}) {
  const [pending, startTransition] = useTransition()

  if (yaUnido) {
    return (
      <div className="space-y-1">
        <Link
          href={`/gondolero/misiones/${campanaId}`}
          className="block w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl text-center shadow-lg text-base transition-colors hover:bg-gondo-verde-600"
        >
          Continuar esta misión →
        </Link>
        <AbandonarBtn campanaId={campanaId} />
      </div>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => unirseACampana(campanaId))}
      className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl shadow-lg text-base transition-colors hover:bg-gondo-verde-600 disabled:opacity-60 min-h-touch"
    >
      {pending ? 'Uniéndose...' : 'Unirme a esta campaña'}
    </button>
  )
}
