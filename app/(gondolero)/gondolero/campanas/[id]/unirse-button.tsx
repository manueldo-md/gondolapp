'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { unirseACampana } from './actions'

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
      <Link
        href="/gondolero/misiones"
        className="block w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl text-center shadow-lg text-base transition-colors hover:bg-gondo-verde-600"
      >
        Ir a mis misiones →
      </Link>
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
