'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { guardarConfigCompresion } from './actions'

export function ConfigForm({
  maxKb,
  maxWidth,
  calidad,
}: {
  maxKb: number
  maxWidth: number
  calidad: number
}) {
  const [valMaxKb,    setValMaxKb]    = useState(maxKb)
  const [valMaxWidth, setValMaxWidth] = useState(maxWidth)
  const [valCalidad,  setValCalidad]  = useState(calidad)
  const [guardado,    setGuardado]    = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  function handleGuardar() {
    setError(null)
    setGuardado(false)
    startTransition(async () => {
      const result = await guardarConfigCompresion(valMaxKb, valMaxWidth, valCalidad)
      if (result.error) {
        setError(result.error)
      } else {
        setGuardado(true)
        setTimeout(() => setGuardado(false), 3000)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">
            Tamaño máximo (KB)
          </label>
          <input
            type="number"
            value={valMaxKb}
            onChange={e => setValMaxKb(Number(e.target.value))}
            min={50}
            max={2000}
            step={50}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/30"
          />
          <p className="text-[11px] text-gray-400">50–2000 KB</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">
            Ancho máximo (px)
          </label>
          <input
            type="number"
            value={valMaxWidth}
            onChange={e => setValMaxWidth(Number(e.target.value))}
            min={640}
            max={4000}
            step={128}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/30"
          />
          <p className="text-[11px] text-gray-400">640–4000 px</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">
            Calidad JPEG inicial
          </label>
          <input
            type="number"
            value={valCalidad}
            onChange={e => setValCalidad(Number(e.target.value))}
            min={0.3}
            max={1.0}
            step={0.05}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/30"
          />
          <p className="text-[11px] text-gray-400">0.3–1.0</p>
        </div>
      </div>

      <div className="pt-1 border-t border-gray-100 text-[11px] text-gray-400 space-y-0.5">
        <p>Resultado estimado con ajustes actuales: <span className="font-medium text-gray-600">~{Math.round(valMaxKb * 0.6)}–{valMaxKb} KB</span></p>
        <p>La calidad baja iterativamente (−0.1 por paso) hasta alcanzar el tamaño máximo.</p>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={handleGuardar}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 bg-[#1E1B4B] text-white text-sm font-semibold rounded-lg hover:bg-[#2d2a6e] disabled:opacity-50 transition-colors"
      >
        {isPending
          ? <Loader2 size={14} className="animate-spin" />
          : guardado
            ? <CheckCircle2 size={14} className="text-green-400" />
            : null
        }
        {guardado ? 'Guardado' : 'Guardar cambios'}
      </button>
    </div>
  )
}
