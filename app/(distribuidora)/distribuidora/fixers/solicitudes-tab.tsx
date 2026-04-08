'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2, Clock } from 'lucide-react'
import { aprobarSolicitudFixer, rechazarSolicitudFixer } from './solicitudes-actions'
import { tiempoRelativo } from '@/lib/utils'

interface SolicitudRow {
  id: string
  fixer_id: string
  fixer_alias: string | null
  fixer_nombre: string | null
  created_at: string
}

export function SolicitudesFixerTab({
  solicitudes,
  distriId,
  distriNombre,
}: {
  solicitudes: SolicitudRow[]
  distriId: string
  distriNombre: string
}) {
  const [procesadas, setProcesadas] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; msg: string }>>({})

  const handleAprobar = (s: SolicitudRow) => {
    startTransition(async () => {
      const res = await aprobarSolicitudFixer(s.id, s.fixer_id, distriId, distriNombre)
      if (res.error) {
        setFeedback(f => ({ ...f, [s.id]: { ok: false, msg: res.error! } }))
      } else {
        setProcesadas(p => new Set([...p, s.id]))
      }
    })
  }

  const handleRechazar = (s: SolicitudRow) => {
    startTransition(async () => {
      const res = await rechazarSolicitudFixer(s.id, s.fixer_id, distriNombre)
      if (res.error) {
        setFeedback(f => ({ ...f, [s.id]: { ok: false, msg: res.error! } }))
      } else {
        setProcesadas(p => new Set([...p, s.id]))
      }
    })
  }

  const pendientes = solicitudes.filter(s => !procesadas.has(s.id))

  if (pendientes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4">
          <Check size={28} className="text-green-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">Sin solicitudes pendientes</h3>
        <p className="text-sm text-gray-400">Cuando un fixer solicite unirse, aparecerá acá.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Fixer</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Solicitud</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {pendientes.map(s => {
            const nombre = s.fixer_alias ?? s.fixer_nombre ?? 'Fixer'
            const fb = feedback[s.id]
            return (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gondo-amber-50 flex items-center justify-center shrink-0">
                      <span className="text-gondo-amber-400 font-bold text-xs">
                        {nombre.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{nombre}</p>
                      {s.fixer_alias && s.fixer_nombre && (
                        <p className="text-xs text-gray-400">{s.fixer_nombre}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock size={12} />
                    {tiempoRelativo(s.created_at)}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-2">
                    {fb && (
                      <span className={`text-xs font-medium ${fb.ok ? 'text-green-600' : 'text-red-500'}`}>
                        {fb.msg}
                      </span>
                    )}
                    <button
                      onClick={() => handleRechazar(s)}
                      disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleAprobar(s)}
                      disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gondo-verde-400 text-white rounded-lg hover:bg-gondo-verde-600 transition-colors disabled:opacity-50"
                    >
                      {isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Aprobar
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
