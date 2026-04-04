'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarCampana, rechazarCampana } from './actions'

export function AprobacionBtns({ campanaId }: { campanaId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAprobar() {
    setError(null)
    startTransition(async () => {
      const result = await aprobarCampana(campanaId)
      if (result?.error) setError(result.error)
    })
  }

  function handleRechazar() {
    setError(null)
    startTransition(async () => {
      const result = await rechazarCampana(campanaId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-1.5">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={handleAprobar}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
          Aprobar campaña
        </button>
        <button
          disabled={pending}
          onClick={handleRechazar}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={13} />}
          Rechazar
        </button>
      </div>
    </div>
  )
}
