'use client'

import { useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { solicitarReinicioMarca } from './reinicio-actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'

interface Props {
  relacionId: string
  distriNombre: string
  /** Estado actual de la solicitud pendiente, si existe */
  solicitudEstado?: 'pendiente' | 'rechazada' | null
}

export function ReiniciarRelacionBtnMarca({ relacionId, distriNombre, solicitudEstado }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  const yaPendiente = solicitudEstado === 'pendiente' || enviado

  function handleConfirmar() {
    startTransition(async () => {
      const res = await solicitarReinicioMarca(relacionId)
      if (res.error) {
        setError(res.error)
        setConfirmOpen(false)
      } else {
        setEnviado(true)
        setConfirmOpen(false)
      }
    })
  }

  if (yaPendiente) {
    return (
      <span className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
        <RefreshCw size={11} className="animate-spin" />
        Solicitud pendiente
      </span>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => { setError(null); setConfirmOpen(true) }}
          disabled={isPending}
          className="text-xs text-[#1E1B4B] hover:text-[#2d2a6e] font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {isPending
            ? <><Loader2 size={11} className="animate-spin" />Enviando...</>
            : <><RefreshCw size={11} />Reiniciar relación</>
          }
        </button>
        {solicitudEstado === 'rechazada' && (
          <span className="text-[10px] text-gray-400">Solicitud anterior rechazada</span>
        )}
        {error && <p className="text-[10px] text-red-500">{error}</p>}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="¿Reiniciar relación?"
        description={`Vas a enviar una solicitud de reinicio a ${distriNombre}. Ellos deberán aceptar para que la relación vuelva a estar activa.`}
        confirmLabel="Enviar solicitud"
        onConfirm={handleConfirmar}
        onCancel={() => setConfirmOpen(false)}
        loading={isPending}
      />
    </>
  )
}
