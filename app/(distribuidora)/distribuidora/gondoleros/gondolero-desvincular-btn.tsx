'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { previsualizarDesvincularGondolero, desvincularGondolero } from './desvincular-actions'
import { resumenParaConfirmar } from '@/lib/mensaje-desvinculacion'
import type { ResumenCierre } from '@/lib/cerrar-vinculacion'
import { ConfirmModal } from '@/components/shared/confirm-modal'

// Sin 'bloqueado': el trabajo en curso ya no impide desvincular, se cierra.
// Ver lib/cerrar-vinculacion.ts.
type Estado = 'idle' | 'verificando' | 'confirmando'

interface Props {
  gondoleroId: string
  distriId: string
  distriNombre: string
  gondoleroAlias: string
}

export function GondoleroDesvincularBtn({ gondoleroId, distriId, distriNombre, gondoleroAlias }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [resumen, setResumen] = useState<ResumenCierre | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleClickDesvincular() {
    setEstado('verificando')
    setError(null)
    // La previsualización ya no decide si se puede: decide qué se le avisa.
    setResumen(await previsualizarDesvincularGondolero(gondoleroId, distriId))
    setEstado('confirmando')
  }

  function handleConfirmar() {
    startTransition(async () => {
      const res = await desvincularGondolero(gondoleroId, distriId, distriNombre)
      if (res.error) {
        setError(res.error)
        setEstado('idle')
      } else {
        setEstado('idle')
      }
    })
  }

  // Las consecuencias concretas van en la confirmación, no después: quien
  // desvincula tiene que saber qué campañas cierra y cuántos puntos paga ANTES
  // de apretar, no enterarse por un movimiento suelto en el historial.
  const consecuencias = resumen ? resumenParaConfirmar(gondoleroAlias, resumen) : null
  const descConfirmar = [
    `Vas a desvincular a ${gondoleroAlias} de ${distriNombre}.`,
    consecuencias,
    `Puede revertirse si volvés a vincularlo.`,
  ].filter(Boolean).join(' ')

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={handleClickDesvincular}
          disabled={isPending || estado === 'verificando'}
          className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {estado === 'verificando'
            ? <><Loader2 size={11} className="animate-spin" />Verificando...</>
            : 'Desvincular'
          }
        </button>
        {error && <p className="text-[10px] text-red-500">{error}</p>}
      </div>

      {/* Modal de confirmación */}
      <ConfirmModal
        open={estado === 'confirmando'}
        title="¿Desvincular este gondolero?"
        description={descConfirmar}
        confirmLabel="Desvincular"
        onConfirm={handleConfirmar}
        onCancel={() => setEstado('idle')}
        loading={isPending}
      />
    </>
  )
}
