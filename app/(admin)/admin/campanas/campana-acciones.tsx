'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { pausarCampana, cerrarCampana, activarCampana, aprobarCampanaPendiente, rechazarCampanaPendiente } from './actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'

export function CampanaAccionesAdmin({
  campanaId,
  estadoActual,
}: {
  campanaId: string
  estadoActual: string
}) {
  const [isPending, startTransition] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [confirmCierre, setConfirmCierre] = useState(false)

  function handleRechazar() {
    startTransition(async () => {
      await rechazarCampanaPendiente(campanaId, motivo.trim() || undefined)
      setRechazando(false)
      setMotivo('')
    })
  }

  function handleCerrar() {
    startTransition(async () => {
      await cerrarCampana(campanaId)
      setConfirmCierre(false)
    })
  }

  if (rechazando) {
    return (
      <div className="space-y-1.5 min-w-[220px]">
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)..."
          rows={2}
          className="w-full px-2 py-1.5 text-xs border border-red-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
        />
        <div className="flex gap-1.5">
          <button
            disabled={isPending}
            onClick={handleRechazar}
            className="px-2.5 py-1 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Confirmar'}
          </button>
          <button
            disabled={isPending}
            onClick={() => { setRechazando(false); setMotivo('') }}
            className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-1.5 flex-wrap">
        {estadoActual === 'pendiente_aprobacion' && (
          <>
            <button
              disabled={isPending}
              onClick={() => startTransition(async () => { await aprobarCampanaPendiente(campanaId) })}
              className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Aprobar'}
            </button>
            <button
              disabled={isPending}
              onClick={() => setRechazando(true)}
              className="px-2.5 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              Rechazar
            </button>
          </>
        )}
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
            onClick={() => setConfirmCierre(true)}
            className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cerrar
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmCierre}
        title="¿Cerrar esta campaña?"
        description="Los gondoleros no podrán seguir enviando fotos. Esta acción no se puede deshacer."
        confirmLabel="Cerrar campaña"
        onConfirm={handleCerrar}
        onCancel={() => setConfirmCierre(false)}
        loading={isPending}
      />
    </>
  )
}
