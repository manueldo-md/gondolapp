'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { verificarTerminarRelacion, terminarRelacion } from './actions'
import { ConfirmModal } from '@/components/shared/confirm-modal'

type Estado = 'idle' | 'verificando' | 'bloqueado' | 'confirmando'

interface Props {
  relacionId: string
  nombreMarca: string
  nombreDistri: string
}

export function TerminarRelacionBtn({ relacionId, nombreMarca, nombreDistri }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [campanasBloqueantes, setCampanasBloqueantes] = useState<{ id: string; nombre: string }[]>([])
  const [isPending, startTransition] = useTransition()

  async function handleClickTerminar() {
    setEstado('verificando')
    const res = await verificarTerminarRelacion(relacionId)
    if (res.campanasBloqueantes.length > 0) {
      setCampanasBloqueantes(res.campanasBloqueantes)
      setEstado('bloqueado')
    } else {
      setEstado('confirmando')
    }
  }

  function handleConfirmar() {
    startTransition(async () => {
      await terminarRelacion(relacionId)
      setEstado('idle')
    })
  }

  const descBloqueado = campanasBloqueantes.length === 1
    ? `Existe una campaña activa entre ${nombreMarca} y ${nombreDistri}: "${campanasBloqueantes[0].nombre}". Cerrala antes de terminar la relación.`
    : `Existen ${campanasBloqueantes.length} campañas activas entre ${nombreMarca} y ${nombreDistri}: ${campanasBloqueantes.map(c => `"${c.nombre}"`).join(', ')}. Cerrralas antes de terminar la relación.`

  return (
    <>
      <button
        onClick={handleClickTerminar}
        disabled={isPending || estado === 'verificando'}
        className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
      >
        {estado === 'verificando'
          ? <><Loader2 size={11} className="animate-spin" /> Verificando...</>
          : 'Terminar'
        }
      </button>

      {/* Modal bloqueante: no se puede terminar */}
      <ConfirmModal
        open={estado === 'bloqueado'}
        mode="alert"
        title="No se puede terminar la relación"
        description={descBloqueado}
        onConfirm={() => {}}
        onCancel={() => setEstado('idle')}
      />

      {/* Modal de confirmación: libre para terminar */}
      <ConfirmModal
        open={estado === 'confirmando'}
        title="¿Terminar esta relación?"
        description={`Vas a terminar la relación entre ${nombreMarca} y ${nombreDistri}. Esta acción no se puede deshacer. Asegurate de que no haya pagos pendientes antes de continuar.`}
        confirmLabel="Terminar relación"
        onConfirm={handleConfirmar}
        onCancel={() => setEstado('idle')}
        loading={isPending}
      />
    </>
  )
}
