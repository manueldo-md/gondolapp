'use client'

import { useTransition } from 'react'
import { ignorarAlerta } from './actions'

export function IgnorarAlertaBoton({
  tipo,
  referenciaId,
}: {
  tipo: string
  referenciaId: string
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => {
      ignorarAlerta(tipo, referenciaId).then(res => {
        if (res?.error) console.error('[IgnorarAlertaBoton] error:', res.error)
      })
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title="Ignorar por 7 días — se reactiva automáticamente"
      className="shrink-0 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Ignorando...' : '🔕 Ignorar 7 días'}
    </button>
  )
}
