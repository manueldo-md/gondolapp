'use client'

import { useState, useTransition } from 'react'
import { X, Loader2, Plus } from 'lucide-react'
import { crearMarca } from './actions'

export function NuevaMarcaModal() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [razonSocial, setRazonSocial] = useState('')
  const [cuit, setCuit] = useState('')

  const handleSubmit = () => {
    setError(null)
    if (!razonSocial.trim()) { setError('La razón social es obligatoria.'); return }
    startTransition(async () => {
      const result = await crearMarca({ razon_social: razonSocial.trim(), cuit: cuit.trim() || null })
      if (result.error) { setError(result.error); return }
      setOpen(false)
      setRazonSocial('')
      setCuit('')
    })
  }

  return (
    <>
      <button
        onClick={() => { setError(null); setOpen(true) }}
        className="flex items-center gap-2 px-4 py-2 bg-[#1E1B4B] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
      >
        <Plus size={15} />
        Nueva marca
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
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 text-base">Nueva marca</h3>
              <button onClick={() => setOpen(false)} disabled={isPending} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Razón social
                </label>
                <input
                  type="text"
                  value={razonSocial}
                  onChange={e => setRazonSocial(e.target.value)}
                  placeholder="Ej: Georgalos S.A."
                  autoFocus
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  CUIT <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={cuit}
                  onChange={e => setCuit(e.target.value)}
                  placeholder="30-12345678-9"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 disabled:opacity-50 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 py-2.5 bg-[#1E1B4B] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90"
              >
                {isPending ? <Loader2 size={15} className="animate-spin" /> : 'Crear marca'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
