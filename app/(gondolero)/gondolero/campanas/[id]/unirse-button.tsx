'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { XCircle } from 'lucide-react'
import { unirseACampana } from './actions'
import { AbandonarBtn } from '../../misiones/abandonar-btn'

export function UnirseButton({
  campanaId,
  yaUnido,
  inscripcionCerrada,
  cupoLleno,
}: {
  campanaId: string
  yaUnido: boolean
  inscripcionCerrada?: boolean
  cupoLleno?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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

  if (cupoLleno) {
    return (
      <div className="w-full py-4 bg-gray-100 text-gray-500 font-semibold rounded-2xl text-center text-base">
        Campaña completa — sin cupos disponibles
      </div>
    )
  }

  if (inscripcionCerrada) {
    return (
      <div className="w-full py-4 bg-gray-100 text-gray-500 font-semibold rounded-2xl text-center text-base">
        El período de inscripción ya cerró
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
          <XCircle size={14} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await unirseACampana(campanaId)
            if (result?.error) setError(result.error)
          })
        }}
        className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl shadow-lg text-base transition-colors hover:bg-gondo-verde-600 disabled:opacity-60 min-h-touch"
      >
        {pending ? 'Uniéndose...' : 'Unirme a esta campaña'}
      </button>
    </div>
  )
}
