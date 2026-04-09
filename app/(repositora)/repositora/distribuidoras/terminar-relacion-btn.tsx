'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { terminarRelacionDistriRepo } from './actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'

interface Props {
  relacionId: string
  nombreDistri: string
  nombreRepo: string
}

export function TerminarRelacionRepoDistriBtn({ relacionId, nombreDistri, nombreRepo }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirmar = () => {
    startTransition(async () => {
      await terminarRelacionDistriRepo(relacionId)
      setConfirmando(false)
    })
  }

  return (
    <>
      <button
        onClick={() => setConfirmando(true)}
        disabled={isPending}
        className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
      >
        {isPending ? <><Loader2 size={11} className="animate-spin" /> Terminando...</> : 'Terminar'}
      </button>

      <ConfirmModal
        open={confirmando}
        title="¿Terminar esta relación?"
        description={`Vas a terminar la relación entre ${nombreDistri} y ${nombreRepo}. Esta acción no se puede deshacer.`}
        confirmLabel="Terminar relación"
        onConfirm={handleConfirmar}
        onCancel={() => setConfirmando(false)}
        loading={isPending}
      />
    </>
  )
}
