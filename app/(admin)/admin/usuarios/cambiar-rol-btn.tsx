'use client'

import { useState, useTransition } from 'react'
import { cambiarTipoActor } from './actions'
import type { TipoActor } from '@/types'

const TIPOS: TipoActor[] = ['gondolero', 'fixer', 'distribuidora', 'marca', 'admin']

/**
 * NO LA MONTA NADIE — verificado con grep el 23/9/2026: la única mención de
 * `CambiarRolBtn` en todo el repo es esta declaración. El cambio de rol que se
 * usa vive en `acciones-usuario.tsx`, adentro del modal del usuario.
 *
 * Se deja porque borrar archivos se consulta, pero **es candidata a borrarse**:
 * una segunda copia de la misma acción es la que alguien va a "arreglar" algún
 * día creyendo que es la que corre, como pasó con `unirseACampana`.
 *
 * Mientras exista, que al menos no se trague el error.
 */
export function CambiarRolBtn({ userId, tipoActual }: { userId: string; tipoActual: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCambiar = (nuevoTipo: TipoActor) => {
    startTransition(async () => {
      const res = await cambiarTipoActor(userId, nuevoTipo)
      if (res?.error) { setError(res.error); return }
      setError(null)
      setOpen(false)
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs text-[#1E1B4B] hover:underline font-medium"
      >
        Cambiar rol
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[140px]">
          {TIPOS.filter(t => t !== tipoActual).map(tipo => (
            <button
              key={tipo}
              disabled={isPending}
              onClick={() => handleCambiar(tipo)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
            >
              → {tipo}
            </button>
          ))}
          {error && <p className="px-3 py-1.5 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
