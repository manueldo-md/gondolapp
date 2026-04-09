'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { XCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { unirseACampana, soloUnirse } from './actions'
import { AbandonarBtn } from '../../misiones/abandonar-btn'
import { BotonReportarError } from '@/components/shared/boton-reportar-error'

const NIVEL_LABEL: Record<string, string> = { casual: 'Casual', activo: 'Activo', pro: 'Pro' }

export function UnirseButton({
  campanaId,
  yaUnido,
  inscripcionCerrada,
  cupoLleno,
  nivelOk = true,
  nivelMinimo = 'casual',
  gondoleroNivel = 'casual',
  participacionAnteriorEstado,
  sinAcceso = false,
  motivoSinAcceso,
}: {
  campanaId: string
  yaUnido: boolean
  inscripcionCerrada?: boolean
  cupoLleno?: boolean
  nivelOk?: boolean
  nivelMinimo?: string
  gondoleroNivel?: string
  participacionAnteriorEstado?: 'completada' | 'abandonada' | null
  sinAcceso?: boolean
  motivoSinAcceso?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [soloUnidoPending, setSoloUnidoPending] = useState(false)
  const [soloUnidoOk, setSoloUnidoOk] = useState(false)
  const router = useRouter()

  function handleUnirse() {
    setError(null)
    startTransition(async () => {
      const result = await unirseACampana(campanaId)
      if (result?.error) setError(result.error)
    })
  }

  async function handleSoloUnirse() {
    setError(null)
    setSoloUnidoPending(true)
    try {
      const result = await soloUnirse(campanaId)
      if ('error' in result) {
        setError(result.error)
      } else {
        setSoloUnidoOk(true)
        router.refresh()
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setSoloUnidoPending(false)
    }
  }

  // Sin acceso por regla de financiador
  if (sinAcceso) {
    return (
      <div className="space-y-2">
        <div className="w-full py-4 bg-gray-100 text-gray-500 font-semibold rounded-2xl text-center text-base">
          🔒 No disponible para vos
        </div>
        {motivoSinAcceso && (
          <p className="text-xs text-center text-gray-400">{motivoSinAcceso}</p>
        )}
      </div>
    )
  }

  // Ya participando activamente
  if (yaUnido) {
    return (
      <div className="space-y-1">
        <Link
          href={`/gondolero/captura?campana=${campanaId}`}
          className="block w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl text-center shadow-lg text-base transition-all duration-100 hover:bg-gondo-verde-600 active:scale-[0.98]"
        >
          Ir a capturar →
        </Link>
        <AbandonarBtn campanaId={campanaId} />
      </div>
    )
  }

  // Sin cupos
  if (cupoLleno) {
    return (
      <div className="w-full py-4 bg-gray-100 text-gray-500 font-semibold rounded-2xl text-center text-base">
        Campaña completa — sin cupos disponibles
      </div>
    )
  }

  // Inscripción cerrada
  if (inscripcionCerrada) {
    return (
      <div className="w-full py-4 bg-gray-100 text-gray-500 font-semibold rounded-2xl text-center text-base">
        El período de inscripción ya cerró
      </div>
    )
  }

  // Nivel insuficiente
  if (!nivelOk) {
    return (
      <div className="space-y-2">
        <div className="w-full py-4 bg-gray-100 text-gray-500 font-semibold rounded-2xl text-center text-base">
          Requiere nivel {NIVEL_LABEL[nivelMinimo] ?? nivelMinimo}
        </div>
        <p className="text-xs text-center text-gray-400">
          Tu nivel actual es <span className="font-semibold">{NIVEL_LABEL[gondoleroNivel] ?? gondoleroNivel}</span>.
          Aprobá más fotos para subir de nivel.
        </p>
      </div>
    )
  }

  // Re-unirse (completada / abandonada)
  const esReunion = !!participacionAnteriorEstado

  return (
    <div className="space-y-2">
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <BotonReportarError errorTecnico={error} contexto="Unirse a campaña" />
        </div>
      )}
      <button
        disabled={pending}
        onClick={handleUnirse}
        className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl shadow-lg text-base transition-all duration-100 hover:bg-gondo-verde-600 active:scale-[0.98] disabled:opacity-60 min-h-touch"
      >
        {pending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" />
            Procesando...
          </span>
        ) : esReunion
            ? participacionAnteriorEstado === 'completada'
              ? 'Volver a participar'
              : 'Volver a unirme'
            : 'Unirme a esta campaña'}
      </button>

      {/* Botón temporal de prueba */}
      {soloUnidoOk ? (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-green-700 font-medium">
          <CheckCircle2 size={16} className="text-green-600" />
          Te uniste a la campaña
        </div>
      ) : (
        <button
          type="button"
          disabled={soloUnidoPending}
          onClick={handleSoloUnirse}
          className="w-full py-3 border border-gray-300 text-gray-600 font-medium rounded-2xl text-sm hover:bg-gray-50 active:scale-[0.98] disabled:opacity-60"
        >
          {soloUnidoPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Procesando...
            </span>
          ) : 'Solo unirme'}
        </button>
      )}
    </div>
  )
}
