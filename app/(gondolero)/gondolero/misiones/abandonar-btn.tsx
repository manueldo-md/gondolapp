'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { abandonarCampana } from './actions'

export function AbandonarBtn({ campanaId }: { campanaId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirmar = () => {
    startTransition(async () => {
      await abandonarCampana(campanaId)
      setOpen(false)
    })
  }

  return (
    <>
      {/* Trigger — discreto, pequeño */}
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        Abandonar campaña
      </button>

      {/* Dialog de confirmación */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-900 text-base mb-2">
              ¿Abandonar esta campaña?
            </h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Los puntos que ya ganaste se mantienen. Podés volverte a unir cuando quieras.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={isPending}
                className="flex-1 py-3 bg-gray-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPending
                  ? <Loader2 size={15} className="animate-spin" />
                  : 'Sí, abandonar'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
