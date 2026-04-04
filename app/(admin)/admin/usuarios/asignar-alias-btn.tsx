'use client'

import { useState, useTransition } from 'react'
import { Wand2, Loader2 } from 'lucide-react'
import { asignarAliasExistentes } from './actions'

export function AsignarAliasBtn() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  const handleClick = () => {
    startTransition(async () => {
      const res = await asignarAliasExistentes()
      if (res.error) {
        setResult(`Error: ${res.error}`)
      } else if (res.asignados === 0) {
        setResult('Todos los gondoleros ya tienen alias ✓')
      } else {
        setResult(`✓ ${res.asignados} alias asignados`)
      }
      setTimeout(() => setResult(null), 4000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
          result.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {result}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Asignar alias únicos a gondoleros que no tienen uno"
      >
        {isPending
          ? <Loader2 size={13} className="animate-spin" />
          : <Wand2 size={13} />
        }
        {isPending ? 'Asignando...' : 'Asignar alias'}
      </button>
    </div>
  )
}
