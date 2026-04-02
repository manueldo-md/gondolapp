'use client'

import { useState, useTransition } from 'react'
import { cambiarTipoActor } from './actions'
import type { TipoActor } from '@/types'

const TIPOS: TipoActor[] = ['gondolero', 'fixer', 'distribuidora', 'marca', 'admin']

export function CambiarRolBtn({ userId, tipoActual }: { userId: string; tipoActual: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleCambiar = (nuevoTipo: TipoActor) => {
    startTransition(async () => {
      await cambiarTipoActor(userId, nuevoTipo)
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
        </div>
      )}
    </div>
  )
}
