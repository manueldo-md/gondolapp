'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { desvincularseDeDistri, aceptarVinculacionDistri, rechazarVinculacionDistri } from './distri-actions'

interface DistriActiva {
  solicitudId: string
  distri_id: string
  distri_nombre: string
}

interface Invitacion {
  id: string
  distri_id: string
  distri_nombre: string
}

interface DistriSectionProps {
  distrisActivas: DistriActiva[]
  solicitudPendiente: { distri_id: string; distri_nombre: string } | null
  invitacionesPendientes: Invitacion[]
  gondoleroId: string
}

export function DistriSection({ distrisActivas: initialDistrisActivas, solicitudPendiente, invitacionesPendientes: initialInvitaciones, gondoleroId }: DistriSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirmDesvincular, setConfirmDesvincular] = useState<string | null>(null) // distri_id confirmando
  const [distrisActivas, setDistrisActivas] = useState<DistriActiva[]>(initialDistrisActivas)
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>(initialInvitaciones)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  const showFeedback = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg })
    if (ok) setTimeout(() => setFeedback(null), 4000)
  }

  const handleDesvincular = (distri: DistriActiva) => {
    setProcesandoId(distri.distri_id)
    startTransition(async () => {
      const res = await desvincularseDeDistri(distri.distri_id)
      setProcesandoId(null)
      if (res.error) {
        showFeedback(false, res.error)
      } else {
        setConfirmDesvincular(null)
        setDistrisActivas(prev => prev.filter(d => d.distri_id !== distri.distri_id))
        showFeedback(true, `Te desvinculaste de ${distri.distri_nombre}`)
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
        setDistrisActivas(prev => [...prev, { solicitudId: inv.id, distri_id: inv.distri_id, distri_nombre: inv.distri_nombre }])
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
    <div>

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

      {/* ── Distribuidoras activas ── */}
      {distrisActivas.length > 0 ? (
        <div className="space-y-3">
          {distrisActivas.map(distri => (
            <div key={distri.distri_id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-800">{distri.distri_nombre}</span>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                  Vinculado ✓
                </span>
              </div>

              {confirmDesvincular !== distri.distri_id ? (
                <button
                  onClick={() => setConfirmDesvincular(distri.distri_id)}
                  disabled={isPending}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Desvincularme
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs text-red-700 font-medium mb-2">
                    ¿Confirmás que querés desvincularte de {distri.distri_nombre}?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDesvincular(null)}
                      disabled={procesandoId === distri.distri_id}
                      className="flex-1 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleDesvincular(distri)}
                      disabled={procesandoId === distri.distri_id}
                      className="flex-1 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
                    >
                      {procesandoId === distri.distri_id ? <Loader2 size={12} className="animate-spin" /> : 'Desvincularme'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── Sin distri ── */
        <div className="space-y-3">
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
