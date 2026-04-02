'use client'

import { useTransition } from 'react'
import { BellOff, Loader2 } from 'lucide-react'
import { ignorarAlerta } from './actions'

export function IgnorarAlertaBoton({
  tipo,
  referenciaId,
}: {
  tipo: string
  referenciaId: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await ignorarAlerta(tipo, referenciaId)
        })
      }
      disabled={pending}
      title="Ignorar por 7 días — se reactiva automáticamente"
      className="shrink-0 ml-1 p-1 text-gray-300 hover:text-gray-500 transition-colors disabled:opacity-40 rounded"
    >
      {pending ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <BellOff size={13} />
      )}
    </button>
  )
}
