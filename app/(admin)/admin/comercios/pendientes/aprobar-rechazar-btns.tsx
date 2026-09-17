'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { aprobarComercio, rechazarComercio } from './actions'
import { SelectorMotivoRechazo } from '@/components/shared/selector-motivo-rechazo'
import { MOTIVOS_RECHAZO_COMERCIO } from '@/lib/motivos-rechazo-comercio'

/**
 * Aprobar o rechazar el alta de un comercio.
 *
 * El rechazo ya no es un "¿estás seguro?": pide el MOTIVO y el botón queda
 * deshabilitado hasta que haya uno. Es el mismo criterio que el rechazo de
 * fotos — del otro lado hay alguien que salió a la calle, cargó el comercio y
 * no va a cobrar. Enterarse sin saber por qué es la peor de las dos mitades.
 */
export function AprobarRechazarBtns({ comercioId, nombreComercio }: { comercioId: string; nombreComercio?: string }) {
  const [estado, setEstado] = useState<'idle' | 'aprobado' | 'rechazado'>('idle')
  const [isPending, startTransition] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [puntos, setPuntos] = useState<number>(0)

  if (estado === 'aprobado') {
    return (
      <div className="flex items-center gap-1 text-green-600">
        <CheckCircle2 size={14} />
        <span className="text-xs font-medium">
          Aprobado{puntos > 0 ? ` · +${puntos} pts al gondolero` : ''}
        </span>
      </div>
    )
  }
  if (estado === 'rechazado') {
    return (
      <div className="flex items-center gap-1 text-red-500">
        <XCircle size={14} />
        <span className="text-xs font-medium">Rechazado</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {!rechazando && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => startTransition(async () => {
              setError(null)
              const r = await aprobarComercio(comercioId)
              if (r?.error) { setError(r.error); return }
              setPuntos(r?.puntos ?? 0)
              setEstado('aprobado')
            })}
            disabled={isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            Aprobar
          </button>
          <button
            onClick={() => setRechazando(true)}
            disabled={isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-400 disabled:opacity-50 transition-colors"
          >
            <XCircle size={11} />
            Rechazar
          </button>
        </div>
      )}

      {rechazando && (
        <div className="p-3 border border-red-200 bg-red-50/40 rounded-xl space-y-3 min-w-[260px]">
          <p className="text-xs text-gray-600">
            {nombreComercio ? `Vas a rechazar "${nombreComercio}".` : 'Vas a rechazar este comercio.'}{' '}
            El gondolero recibe el motivo y no cobra el alta.
          </p>

          <SelectorMotivoRechazo
            onChange={setMotivo}
            disabled={isPending}
            motivos={MOTIVOS_RECHAZO_COMERCIO}
            label="Motivo del rechazo del alta"
            placeholder="Contale por qué no sirvió y qué puede hacer"
          />

          <div className="flex gap-2">
            <button
              disabled={isPending || !motivo}
              onClick={() => startTransition(async () => {
                setError(null)
                const r = await rechazarComercio(comercioId, motivo ?? undefined)
                if (r?.error) { setError(r.error); return }
                setEstado('rechazado')
                setRechazando(false)
              })}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Confirmar rechazo
            </button>
            <button
              disabled={isPending}
              onClick={() => { setRechazando(false); setMotivo(null) }}
              className="px-3 py-2 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-red-600 max-w-[280px]">{error}</p>}
    </div>
  )
}
