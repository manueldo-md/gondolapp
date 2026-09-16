'use client'

import { useState, useTransition } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { asignarCodigosExistentes } from './actions'

type Resultado =
  | { tono: 'ok' | 'error' | 'aviso'; texto: string; detalle?: string[] }
  | null

export function AsignarCodigosBtn({ pendientes }: { pendientes: number }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Resultado>(null)

  const handleClick = () => {
    startTransition(async () => {
      const res = await asignarCodigosExistentes()

      if (res.error) {
        setResult({ tono: 'error', texto: `Error: ${res.error}` })
      } else if (res.fallidos > 0) {
        // Los fallidos se muestran aparte y NO se autodescartan: si quedó gente
        // sin código, el admin tiene que verlo y volver a intentar.
        setResult({
          tono: 'aviso',
          texto: `${res.asignados} asignados, ${res.fallidos} sin código`,
          detalle: res.detalle,
        })
        return
      } else if (res.asignados === 0) {
        setResult({ tono: 'ok', texto: 'Todos tienen código ✓' })
      } else {
        setResult({ tono: 'ok', texto: `✓ ${res.asignados} códigos asignados` })
      }
      setTimeout(() => setResult(null), 4000)
    })
  }

  const colorChip =
    result?.tono === 'error' ? 'bg-red-100 text-red-700'
    : result?.tono === 'aviso' ? 'bg-amber-100 text-amber-800'
    : 'bg-green-100 text-green-700'

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${colorChip}`}>
          {result.texto}
          {result.detalle && result.detalle.length > 0 && (
            <span className="block font-normal mt-0.5">
              Sin código: {result.detalle.join(', ')}
            </span>
          )}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Asignar código personal a gondoleros y fixers que no tengan uno, o que tengan uno del formato viejo"
      >
        {isPending
          ? <Loader2 size={13} className="animate-spin" />
          : <KeyRound size={13} />
        }
        {isPending ? 'Asignando...' : 'Asignar códigos'}
        {!isPending && pendientes > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
            {pendientes}
          </span>
        )}
      </button>
    </div>
  )
}
