'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { terminarRelacionDistri } from './actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'

interface Props {
  relacionId: string
  nombreMarca: string
  nombreDistri: string
}

export function TerminarRelacionBtn({ relacionId, nombreMarca, nombreDistri }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleConfirmar() {
    startTransition(async () => {
      await terminarRelacionDistri(relacionId)
      setConfirming(false)
    })
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={isPending}
        className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
      >
        {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Terminar'}
      </button>

      <ConfirmModal
        open={confirming}
        title="¿Terminar esta relación?"
        description={`Vas a terminar la relación entre ${nombreDistri} y ${nombreMarca}. Los gondoleros de esta distribuidora dejarán de ver las campañas de la marca. Esta acción no se puede deshacer.`}
        confirmLabel="Terminar relación"
        onConfirm={handleConfirmar}
        onCancel={() => setConfirming(false)}
        loading={isPending}
      />
    </>
  )
}
