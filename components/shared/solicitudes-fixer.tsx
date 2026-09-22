'use client'

/**
 * components/shared/solicitudes-fixer.tsx
 * Las postulaciones de fixers pendientes, para la distribuidora y la repositora.
 *
 * ── POR QUÉ COMPARTIDO ──────────────────────────────────────────────────────
 * Había dos listas que hacían lo mismo y se habían separado: la de la distri en
 * su propia pestaña (`solicitudes-tab.tsx`), y la de la repositora metida dentro
 * del panel de invitación, con la pestaña "Solicitudes" convertida en un cartel
 * que decía "aparecen arriba". Escribir una tercera para las postulaciones
 * habría sido el mismo error una vez más.
 *
 * ── LO QUE ESTA PANTALLA MUESTRA, Y LO QUE NO ───────────────────────────────
 * **Solo las postulaciones del FIXER** (`iniciado_por = 'fixer'`). Las
 * invitaciones que el ejecutor mandó él mismo NO van acá, y ese filtro no es
 * cosmético: sin él, la distri veía su propia invitación en esta lista y podía
 * apretar "Aprobar", escribiendo el vínculo **sin que el fixer aceptara nada**.
 * El consentimiento del fixer se da en su perfil, no acá.
 *
 * ── EL MOTIVO DEL RECHAZO ES OPCIONAL ───────────────────────────────────────
 * A diferencia del rechazo de un comercio, donde es obligatorio porque cada
 * motivo manda al gondolero a hacer algo distinto. Acá el fixer ve "Tu
 * postulación no fue aceptada" y no hay nada que pueda hacer por 30 días:
 * exigir un texto solo produciría textos vacíos.
 */

import { useState, useTransition } from 'react'
import { Check, X, Loader2, Clock, UserCheck } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'

export interface SolicitudFixer {
  id: string
  fixer_id: string
  fixer_alias: string | null
  fixer_nombre: string | null
  fixer_celular?: string | null
  created_at: string
}

type Resultado = { error?: string } | void

const TEMAS = {
  distri: { acento: 'text-gondo-amber-400', chip: 'bg-amber-50' },
  repo:   { acento: 'text-blue-600',        chip: 'bg-blue-50'  },
} as const

export function SolicitudesFixer({
  solicitudes,
  tema = 'distri',
  onAprobar,
  onRechazar,
}: {
  solicitudes: SolicitudFixer[]
  tema?: keyof typeof TEMAS
  onAprobar: (s: SolicitudFixer) => Promise<Resultado>
  /** `motivo` es `null` cuando quien rechaza no escribió nada. */
  onRechazar: (s: SolicitudFixer, motivo: string | null) => Promise<Resultado>
}) {
  const [procesadas, setProcesadas] = useState<Set<string>>(new Set())
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const t = TEMAS[tema]
  const pendientes = solicitudes.filter(s => !procesadas.has(s.id))

  const correr = (s: SolicitudFixer, fn: () => Promise<Resultado>) => {
    startTransition(async () => {
      const res = await fn()
      if (res && 'error' in res && res.error) {
        setErrores(e => ({ ...e, [s.id]: res.error! }))
        return
      }
      setErrores(e => { const n = { ...e }; delete n[s.id]; return n })
      setProcesadas(p => new Set([...p, s.id]))
      setRechazando(null)
      setMotivo('')
    })
  }

  if (pendientes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className={`w-16 h-16 ${t.chip} rounded-2xl flex items-center justify-center mb-4`}>
          <UserCheck size={28} className={t.acento} />
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">Sin postulaciones pendientes</h3>
        {/* Dice lo que de verdad aparece acá. Antes decía "cuando un fixer
            solicite unirse" mientras mostraba las invitaciones propias. */}
        <p className="text-sm text-gray-400 max-w-xs">
          Cuando un fixer se postule a una de tus campañas abiertas, vas a verlo acá.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
      {pendientes.map(s => {
        const nombre = s.fixer_alias ?? s.fixer_nombre ?? 'Fixer sin nombre'
        const enRechazo = rechazando === s.id
        return (
          <div key={s.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{nombre}</p>
                {s.fixer_celular && <p className="text-xs text-gray-500">{s.fixer_celular}</p>}
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock size={11} /> se postuló {tiempoRelativo(s.created_at)}
                </p>
              </div>

              {!enRechazo && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => correr(s, () => onAprobar(s))}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60"
                  >
                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                    Aprobar
                  </button>
                  <button
                    onClick={() => { setRechazando(s.id); setMotivo('') }}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60"
                  >
                    <X size={13} />
                    Rechazar
                  </button>
                </div>
              )}
            </div>

            {enRechazo && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-500">
                  El fixer va a ver que no lo aceptaste, y no va a poder volver a
                  postularse a vos por 30 días.
                </p>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Motivo (opcional, lo ve el fixer)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setRechazando(null); setMotivo('') }}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => correr(s, () => onRechazar(s, motivo.trim() || null))}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={13} />}
                    Confirmar rechazo
                  </button>
                </div>
              </div>
            )}

            {errores[s.id] && <p className="text-xs text-red-600 mt-2">{errores[s.id]}</p>}
          </div>
        )
      })}
    </div>
  )
}
