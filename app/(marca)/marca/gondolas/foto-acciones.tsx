'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { aprobarFotoMarca, rechazarFotoMarca } from './actions'

export function MarcaFotoAcciones({ fotoId, estado }: { fotoId: string; estado: string }) {
  const [isPending, startTransition] = useTransition()
  const [accion, setAccion] = useState<'aprobar' | 'rechazar' | null>(null)

  if (estado !== 'pendiente') return null

  const handleAprobar = () => {
    setAccion('aprobar')
    startTransition(async () => { await aprobarFotoMarca(fotoId) })
  }

  const handleRechazar = () => {
    setAccion('rechazar')
    startTransition(() => rechazarFotoMarca(fotoId))
  }

  return (
    <div className="flex gap-1.5 mt-2">
      <button
        onClick={handleAprobar}
        disabled={isPending}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        <CheckCircle2 size={12} />
        {isPending && accion === 'aprobar' ? '...' : 'Aprobar'}
      </button>
      <button
        onClick={handleRechazar}
        disabled={isPending}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-50 text-red-600 text-[11px] font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        <XCircle size={12} />
        {isPending && accion === 'rechazar' ? '...' : 'Rechazar'}
      </button>
    </div>
  )
}
