'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { aceptarInvitacionFixer, rechazarInvitacionFixer } from './actions'

export function AceptarInvitacionFixerBtn({
  tokenId,
  fixerId,
  actorId,
  actorNombre,
  actorTipo,
}: {
  tokenId: string
  fixerId: string
  actorId: string
  actorNombre: string
  actorTipo: 'distri' | 'repositora'
}) {
  const [isPendingAceptar, startAceptar] = useTransition()
  const [isPendingRechazar, startRechazar] = useTransition()
  const [acepto, setAcepto] = useState(false)
  const [confirmRechazar, setConfirmRechazar] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  const handleAceptar = () => {
    if (!acepto) return
    setErrorMsg(null)
    startAceptar(async () => {
      const res = await aceptarInvitacionFixer(tokenId, fixerId, actorId, actorNombre, actorTipo)
      if (res.error) {
        setErrorMsg(res.error)
      } else {
        router.push('/gondolero/perfil?vinculado=1')
      }
    })
  }

  const handleRechazar = () => {
    startRechazar(async () => {
      await rechazarInvitacionFixer(tokenId)
      router.push('/gondolero/campanas')
    })
  }

  if (confirmRechazar) {
    return (
      <div className="space-y-3">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">¿Rechazar la invitación?</p>
          <p className="text-xs text-red-600">No te vincularás a {actorNombre}. Podés pedir otro link si cambiás de opinión.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmRechazar(false)}
            disabled={isPendingRechazar}
            className="flex-1 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleRechazar}
            disabled={isPendingRechazar}
            className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
          >
            {isPendingRechazar ? <Loader2 size={16} className="animate-spin" /> : 'Rechazar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* TyC checkbox */}
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <div className="relative mt-0.5 shrink-0">
          <input
            type="checkbox"
            checked={acepto}
            onChange={e => setAcepto(e.target.checked)}
            className="sr-only peer"
          />
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${acepto ? 'bg-gondo-verde-400 border-gondo-verde-400' : 'border-gray-300 bg-white'}`}>
            {acepto && (
              <svg viewBox="0 0 12 10" className="w-3 h-3 fill-none stroke-white stroke-2">
                <polyline points="1,5 4,8 11,1" />
              </svg>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Acepto los términos y condiciones de uso de GondolApp y autorizo el intercambio de información con {actorNombre}.
        </p>
      </label>

      {/* Botones */}
      <button
        onClick={handleAceptar}
        disabled={isPendingAceptar || !acepto}
        className="w-full py-3.5 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2 min-h-touch"
      >
        {isPendingAceptar ? <Loader2 size={18} className="animate-spin" /> : `🤝 Sí, unirme a ${actorNombre}`}
      </button>
      <button
        onClick={() => setConfirmRechazar(true)}
        disabled={isPendingAceptar}
        className="w-full py-2 text-center text-sm text-gray-400 hover:text-red-500 transition-colors"
      >
        Rechazar invitación
      </button>
    </div>
  )
}
