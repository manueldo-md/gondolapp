'use client'

import { useState, useTransition } from 'react'
import { Loader2, X } from 'lucide-react'
import { procesarCanje } from './actions'
import type { TipoPremio } from '@/types'

const PREMIO_LABEL: Record<TipoPremio, string> = {
  nafta_ypf:       '⛽ Nafta YPF',
  giftcard_ml:     '🛒 Gift Card ML',
  credito_celular: '📱 Crédito celular',
  transferencia:   '🏦 Transferencia',
}

export function ProcesarCanjeBtn({ canjeId, premio }: { canjeId: string; premio: string }) {
  const [open, setOpen] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleProcesar = () => {
    startTransition(async () => {
      await procesarCanje(canjeId, codigo.trim() || null)
      setOpen(false)
      setCodigo('')
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-[#1E1B4B] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
      >
        Procesar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-base">Procesar canje</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Premio: <span className="font-medium">{PREMIO_LABEL[premio as TipoPremio] ?? premio}</span>
            </p>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Código entregado <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                placeholder="Ej: GC-12345-ABCDE"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcesar}
                disabled={isPending}
                className="flex-1 py-2.5 bg-[#1E1B4B] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isPending ? <Loader2 size={15} className="animate-spin" /> : 'Marcar procesado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
