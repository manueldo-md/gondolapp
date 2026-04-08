'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { verificarDesvincularFixer, desvincularFixer } from './desvincular-actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'

type Estado = 'idle' | 'verificando' | 'bloqueado' | 'confirmando'

interface Props {
  fixerId: string
  distriId: string
  distriNombre: string
  fixerAlias: string
}

export function FixerDesvincularBtn({ fixerId, distriId, distriNombre, fixerAlias }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [campanasBloqueantes, setCampanasBloqueantes] = useState<{ id: string; nombre: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleClickDesvincular() {
    setEstado('verificando')
    setError(null)
    const res = await verificarDesvincularFixer(fixerId, distriId)
    if (res.campanasBloqueantes.length > 0) {
      setCampanasBloqueantes(res.campanasBloqueantes)
      setEstado('bloqueado')
    } else {
      setEstado('confirmando')
    }
  }

  function handleConfirmar() {
    startTransition(async () => {
      const res = await desvincularFixer(fixerId, distriId, distriNombre)
      if (res.error) {
        setError(res.error)
        setEstado('idle')
      } else {
        setEstado('idle')
      }
    })
  }

  const descBloqueado = campanasBloqueantes.length === 1
    ? `${fixerAlias} está activo en la campaña "${campanasBloqueantes[0].nombre}". Debe darse de baja de la campaña antes de ser desvinculado.`
    : `${fixerAlias} está activo en ${campanasBloqueantes.length} campañas: ${campanasBloqueantes.map(c => `"${c.nombre}"`).join(', ')}. Debe darse de baja primero.`

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

      {/* Modal bloqueante */}
      <ConfirmModal
        open={estado === 'bloqueado'}
        mode="alert"
        title="No se puede desvincular"
        description={descBloqueado}
        onConfirm={() => {}}
        onCancel={() => setEstado('idle')}
      />

      {/* Modal de confirmación */}
      <ConfirmModal
        open={estado === 'confirmando'}
        title="¿Desvincular este fixer?"
        description={`Vas a desvincular a ${fixerAlias} de ${distriNombre}. El fixer perderá acceso a las campañas de esta distribuidora. Esta acción puede revertirse si el fixer solicita vinculación nuevamente.`}
        confirmLabel="Desvincular"
        onConfirm={handleConfirmar}
        onCancel={() => setEstado('idle')}
        loading={isPending}
      />
    </>
  )
}
