'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { aprobarFotoMarca, rechazarFotoMarca } from './actions'

export function MarcaFotoAcciones({ fotoId, estado }: { fotoId: string; estado: string }) {
  const [isPending, startTransition] = useTransition()
  const [accion, setAccion] = useState<'aprobar' | 'rechazar' | null>(null)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')

  if (estado !== 'pendiente') return null

  const handleAprobar = () => {
    setAccion('aprobar')
    startTransition(async () => { await aprobarFotoMarca(fotoId) })
  }

  const handleConfirmarRechazo = () => {
    setAccion('rechazar')
    startTransition(() => rechazarFotoMarca(fotoId, motivo.trim() || undefined))
  }

  if (rechazando) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo del rechazo (opcional)"
          rows={2}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-red-300 placeholder:text-gray-400"
        />
        <div className="flex gap-1.5">
          <button
            onClick={handleConfirmarRechazo}
            disabled={isPending}
            className="flex-1 py-1.5 bg-red-600 text-white text-[11px] font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isPending && accion === 'rechazar' ? '...' : 'Confirmar rechazo'}
          </button>
          <button
            onClick={() => { setRechazando(false); setMotivo('') }}
            disabled={isPending}
            className="px-3 py-1.5 border border-gray-200 text-gray-500 text-[11px] rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-1.5 mt-2">
      <button
        onClick={handleAprobar}
        disabled={isPending}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        <CheckCircle2 size={12} />
        {isPending && accion === 'aprobar' ? '...' : 'Aprobar'}
      </button>
      <button
        onClick={() => setRechazando(true)}
        disabled={isPending}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-50 text-red-600 text-[11px] font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        <XCircle size={12} />
        Rechazar
      </button>
    </div>
  )
}
