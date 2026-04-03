'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { retirarFoto } from '../actions'
import { BotonReportarError } from '@/components/shared/boton-reportar-error'

export function RetirarFotoBtn({ fotoId }: { fotoId: string }) {
  const [mostrando, setMostrando] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function confirmar() {
    setError(null)
    startTransition(async () => {
      const result = await retirarFoto(fotoId)
      if (result.error) {
        setError(result.error)
      } else {
        setMostrando(false)
      }
    })
  }

  if (!mostrando) {
    return (
      <button
        onClick={() => setMostrando(true)}
        className="text-[11px] font-medium text-red-400 hover:text-red-600 transition-colors mt-0.5"
      >
        Retirar foto
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8">
      <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3 shadow-xl">
        <h3 className="text-base font-bold text-gray-900">¿Retirar esta foto?</h3>
        <ul className="space-y-1 text-sm text-gray-500">
          <li>· La foto se eliminará del sistema</li>
          <li>· Los puntos pendientes no se acreditarán</li>
          <li>· Podés volver a fotografiar este comercio</li>
        </ul>

        {error && (
          <div className="bg-red-50 rounded-lg px-3 py-2">
            <p className="text-xs font-medium text-red-600">{error}</p>
            <BotonReportarError errorTecnico={error} />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => { setMostrando(false); setError(null) }}
            disabled={isPending}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={isPending}
            className="flex-1 py-3 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Sí, retirar
          </button>
        </div>
      </div>
    </div>
  )
}
