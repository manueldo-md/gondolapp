'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { validarRepositora, desactivarRepositora } from './actions'

export function ValidarRepoBtn({ repoId }: { repoId: string }) {
  const [hecho, setHecho] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (hecho) {
    return (
      <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
        <CheckCircle2 size={13} />
        Validada
      </div>
    )
  }

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => {
        await validarRepositora(repoId)
        setHecho(true)
      })}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-60"
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
      Validar
    </button>
  )
}

export function DesactivarRepoBtn({ repoId }: { repoId: string }) {
  const [confirmando, setConfirmando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (hecho) {
    return (
      <span className="text-xs text-gray-400 font-medium">Desactivada</span>
    )
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">¿Confirmar?</span>
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => {
            await desactivarRepositora(repoId)
            setHecho(true)
          })}
          className="px-2.5 py-1 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-60"
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Sí, desactivar'}
        </button>
        <button
          onClick={() => setConfirmando(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors"
    >
      <XCircle size={12} />
      Desactivar
    </button>
  )
}
