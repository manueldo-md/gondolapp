'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { previsualizarDesvincularFixer, desvincularFixer } from './desvincular-actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'
import { descripcionConfirmarDesvincular } from '@/lib/mensaje-desvinculacion'
import type { ResumenCierre } from '@/lib/cerrar-vinculacion'

// Sin 'bloqueado': el trabajo en curso ya no impide desvincular, se cierra.
// Ver lib/cerrar-vinculacion.ts.
type Estado = 'idle' | 'verificando' | 'confirmando'

interface Props {
  fixerId: string
  distriNombre: string
  fixerAlias: string
}

export function FixerDesvincularBtn({ fixerId, distriNombre, fixerAlias }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [resumen, setResumen] = useState<ResumenCierre | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleClickDesvincular() {
    setEstado('verificando')
    setError(null)
    // La previsualización ya no decide si se puede: decide qué se le avisa.
    setResumen(await previsualizarDesvincularFixer(fixerId))
    setEstado('confirmando')
  }

  function handleConfirmar() {
    startTransition(async () => {
      const res = await desvincularFixer(fixerId, distriNombre)
      if (res.error) {
        setError(res.error)
        setEstado('idle')
      } else {
        setEstado('idle')
      }
    })
  }

  // Mismo texto que el botón de gondoleros, y de la misma fuente. Los dos lo
  // tenían copiado y los dos terminaban prometiendo que la acción era
  // reversible: revincular devuelve el vínculo, no reabre las campañas cerradas
  // ni vuelve a retener los puntos acreditados.
  const descConfirmar = descripcionConfirmarDesvincular({
    quien: fixerAlias, queEs: 'fixer', distriNombre, resumen,
  })

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
        title="¿Desvincular este fixer?"
        description={descConfirmar}
        confirmLabel="Desvincular"
        onConfirm={handleConfirmar}
        onCancel={() => setEstado('idle')}
        loading={isPending}
      />
    </>
  )
}
