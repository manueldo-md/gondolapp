'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarComercioDistri, rechazarComercioDistri } from './actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'

export function AprobarRechazarBtnsDistri({ comercioId, nombreComercio }: { comercioId: string; nombreComercio?: string }) {
  const [estado, setEstado] = useState<'idle' | 'aprobado' | 'rechazado'>('idle')
  const [isPending, startTransition] = useTransition()
  const [confirmRechazo, setConfirmRechazo] = useState(false)

  if (estado === 'aprobado') {
    return (
      <div className="flex items-center gap-1 text-green-600">
        <CheckCircle2 size={14} />
        <span className="text-xs font-medium">Aprobado</span>
      </div>
    )
  }
  if (estado === 'rechazado') {
    return (
      <div className="flex items-center gap-1 text-red-500">
        <XCircle size={14} />
        <span className="text-xs font-medium">Rechazado</span>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => startTransition(async () => {
            await aprobarComercioDistri(comercioId)
            setEstado('aprobado')
          })}
          disabled={isPending}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors"
        >
          {isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
          Aprobar
        </button>
        <button
          onClick={() => setConfirmRechazo(true)}
          disabled={isPending}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-400 disabled:opacity-50 transition-colors"
        >
          <XCircle size={11} />
          Rechazar
        </button>
      </div>

      <ConfirmModal
        open={confirmRechazo}
        title="¿Rechazar este comercio?"
        description={`Vas a rechazar ${nombreComercio ? `"${nombreComercio}"` : 'este comercio'}. Las fotos pendientes del gondolero perderán sus puntos retenidos. Esta acción no se puede deshacer.`}
        confirmLabel="Rechazar comercio"
        onConfirm={() => startTransition(async () => {
          await rechazarComercioDistri(comercioId)
          setEstado('rechazado')
          setConfirmRechazo(false)
        })}
        onCancel={() => setConfirmRechazo(false)}
        loading={isPending}
      />
    </>
  )
}
