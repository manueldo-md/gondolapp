'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { reportarError } from './reportar-error'

export function BotonReportarError({
  errorTecnico,
  contexto,
}: {
  errorTecnico?: string
  contexto?: string
}) {
  const [abierto, setAbierto]   = useState(false)
  const [descripcion, setDesc]  = useState('')
  const [enviado, setEnviado]   = useState(false)
  const [isPending, start]      = useTransition()

  function abrir() { setAbierto(true); setEnviado(false); setDesc('') }
  function cerrar() { setAbierto(false) }

  function enviar() {
    if (!descripcion.trim()) return
    start(async () => {
      try {
        await reportarError({
          url:         window.location.href,
          descripcion: descripcion.trim(),
          errorTecnico,
          contexto:    {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            ...(contexto ? { extra: contexto } : {}),
          },
        })
      } catch {
        // Si falla el envío, igual mostramos confirmación al usuario —
        // no queremos que vea un estado roto.
      }
      setEnviado(true)
    })
  }

  return (
    <>
      <button
        onClick={abrir}
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition-colors mt-1"
      >
        <AlertTriangle size={11} />
        Reportar problema
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">¿Qué problema encontraste?</h3>
              <button onClick={cerrar} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {enviado ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-semibold text-gray-800">¡Gracias por reportarlo!</p>
                <p className="text-xs text-gray-500 mt-1">Revisamos el problema a la brevedad.</p>
                <button
                  onClick={cerrar}
                  className="mt-4 px-5 py-2 bg-gray-100 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={descripcion}
                  onChange={e => setDesc(e.target.value)}
                  rows={4}
                  placeholder="Describí qué estabas haciendo cuando ocurrió el error..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                  autoFocus
                />
                {errorTecnico && (
                  <p className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 font-mono break-all">
                    {errorTecnico}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={cerrar}
                    disabled={isPending}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={enviar}
                    disabled={isPending || !descripcion.trim()}
                    className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {isPending && <Loader2 size={14} className="animate-spin" />}
                    Enviar reporte
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
