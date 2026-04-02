'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { pausarCampana, cerrarCampana, activarCampana } from './actions'

export function CampanaAccionesAdmin({
  campanaId,
  estadoActual,
}: {
  campanaId: string
  estadoActual: string
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex gap-1.5 flex-wrap">
      {estadoActual === 'activa' && (
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => { await pausarCampana(campanaId) })}
          className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Pausar'}
        </button>
      )}
      {estadoActual === 'pausada' && (
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => { await activarCampana(campanaId) })}
          className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Activar'}
        </button>
      )}
      {(estadoActual === 'activa' || estadoActual === 'pausada' || estadoActual === 'borrador') && (
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => { await cerrarCampana(campanaId) })}
          className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Cerrar'}
        </button>
      )}
    </div>
  )
}
