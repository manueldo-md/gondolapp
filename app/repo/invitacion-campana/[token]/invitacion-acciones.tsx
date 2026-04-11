'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2, Check } from 'lucide-react'
import { aceptarInvitacionCampana, rechazarInvitacionCampana } from './actions'

export function InvitacionAccionesRepo({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [resultado, setResultado] = useState<'aceptada' | 'rechazada' | null>(null)

  if (resultado === 'aceptada') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Check size={22} className="text-green-600" />
        </div>
        <p className="text-base font-semibold text-green-800 mb-1">Campaña aceptada</p>
        <p className="text-sm text-green-700">La campaña ya está activa. Podés verla en tu panel de repositora.</p>
      </div>
    )
  }

  if (resultado === 'rechazada') {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <XCircle size={22} className="text-gray-400" />
        </div>
        <p className="text-base font-semibold text-gray-700 mb-1">Invitación rechazada</p>
        <p className="text-sm text-gray-500">La marca fue notificada de tu decisión.</p>
      </div>
    )
  }

  function handleAceptar() {
    setError(null)
    startTransition(async () => {
      const res = await aceptarInvitacionCampana(token)
      if (res.error) setError(res.error)
      else setResultado('aceptada')
    })
  }

  function handleConfirmarRechazo() {
    setError(null)
    startTransition(async () => {
      const res = await rechazarInvitacionCampana(token, motivo)
      if (res.error) setError(res.error)
      else setResultado('rechazada')
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {rechazando ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Motivo del rechazo <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: No tenemos cobertura en esa zona, fechas incompatibles..."
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/20 focus:border-red-400 transition"
            />
          </div>
          <div className="flex gap-3">
            <button
              disabled={pending}
              onClick={handleConfirmarRechazo}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
              Confirmar rechazo
            </button>
            <button
              disabled={pending}
              onClick={() => { setRechazando(false); setMotivo('') }}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 flex-wrap">
          <button
            disabled={pending}
            onClick={handleAceptar}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Aceptar campaña
          </button>
          <button
            disabled={pending}
            onClick={() => setRechazando(true)}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            <XCircle size={15} />
            Rechazar
          </button>
        </div>
      )}
    </div>
  )
}
