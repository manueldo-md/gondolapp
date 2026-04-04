'use client'

import { useState, useTransition } from 'react'
import { Loader2, Truck, CheckCircle2 } from 'lucide-react'
import { desvincularseDeDistri, aceptarVinculacionDistri, rechazarVinculacionDistri } from './distri-actions'

interface Invitacion {
  id: string
  distri_id: string
  distri_nombre: string
}

interface DistriSectionProps {
  distriActual: { id: string; nombre: string } | null
  solicitudPendiente: { distri_id: string; distri_nombre: string } | null
  invitacionesPendientes: Invitacion[]
  gondoleroId: string
}

export function DistriSection({ distriActual, solicitudPendiente, invitacionesPendientes, gondoleroId }: DistriSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false)
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>(invitacionesPendientes)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  const showFeedback = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg })
    if (ok) setTimeout(() => setFeedback(null), 4000)
  }

  const handleDesvincular = () => {
    startTransition(async () => {
      const res = await desvincularseDeDistri()
      if (res.error) {
        showFeedback(false, res.error)
      } else {
        setConfirmarDesvincular(false)
        showFeedback(true, 'Te desvinculaste correctamente')
      }
    })
  }

  const handleAceptar = (inv: Invitacion) => {
    setProcesandoId(inv.id)
    startTransition(async () => {
      const res = await aceptarVinculacionDistri(inv.id, gondoleroId, inv.distri_id)
      setProcesandoId(null)
      if (res.error) {
        showFeedback(false, res.error)
      } else {
        setInvitaciones(prev => prev.filter(i => i.id !== inv.id))
        showFeedback(true, `¡Vinculado a ${inv.distri_nombre}!`)
      }
    })
  }

  const handleRechazar = (inv: Invitacion) => {
    setProcesandoId(inv.id)
    startTransition(async () => {
      const res = await rechazarVinculacionDistri(inv.id)
      setProcesandoId(null)
      if (res.error) {
        showFeedback(false, res.error)
      } else {
        setInvitaciones(prev => prev.filter(i => i.id !== inv.id))
        showFeedback(true, `Invitación de ${inv.distri_nombre} rechazada`)
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Truck size={16} className="text-gondo-amber-400" />
        <h2 className="text-sm font-semibold text-gray-700">Mi distribuidora</h2>
        {invitaciones.length > 0 && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">
            {invitaciones.length}
          </span>
        )}
      </div>

      {/* ── Invitaciones pendientes de distribuidoras ── */}
      {invitaciones.length > 0 && (
        <div className="space-y-2 mb-3">
          {invitaciones.map(inv => (
            <div key={inv.id} className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-800 mb-1">📦 Invitación de {inv.distri_nombre}</p>
              <p className="text-xs text-blue-700 mb-3">
                {inv.distri_nombre} quiere que te unas a su equipo.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRechazar(inv)}
                  disabled={procesandoId === inv.id || isPending}
                  className="flex-1 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  {procesandoId === inv.id ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Rechazar'}
                </button>
                <button
                  onClick={() => handleAceptar(inv)}
                  disabled={procesandoId === inv.id || isPending}
                  className="flex-1 py-1.5 text-xs font-semibold bg-gondo-verde-400 text-white rounded-lg hover:bg-gondo-verde-600 transition-colors flex items-center justify-center gap-1"
                >
                  {procesandoId === inv.id ? <Loader2 size={12} className="animate-spin" /> : '✓ Aceptar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Vinculado ── */}
      {distriActual ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-green-500 shrink-0" />
              <span className="text-sm font-medium text-gray-800">{distriActual.nombre}</span>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
              Vinculado ✓
            </span>
          </div>

          {!confirmarDesvincular ? (
            <button
              onClick={() => setConfirmarDesvincular(true)}
              disabled={isPending}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Desvincularme
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-red-700 font-medium mb-2">
                ¿Confirmás que querés desvincularte de {distriActual.nombre}?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmarDesvincular(false)}
                  disabled={isPending}
                  className="flex-1 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDesvincular}
                  disabled={isPending}
                  className="flex-1 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
                >
                  {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Desvincularme'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Sin distri ── */
        <div className="space-y-3">
          {/* Solicitud propia pendiente */}
          {solicitudPendiente ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800 mb-0.5">⏳ Solicitud pendiente</p>
              <p className="text-xs text-amber-700">
                Esperando que <span className="font-medium">{solicitudPendiente.distri_nombre}</span> apruebe tu solicitud.
              </p>
            </div>
          ) : invitaciones.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-400">Sin distribuidora vinculada</p>
              <p className="text-xs text-gray-400">
                Pedile a tu distribuidora que te invite por link o que ingrese tu código personal para vincularte.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`mt-3 p-3 rounded-xl text-xs font-medium ${
          feedback.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
