'use client'

/**
 * MisionesPendientes
 *
 * Widget informativo que aparece arriba de la lista de campañas cuando hay
 * misiones guardadas offline en IDB. Sin botón de enviar — la subida es
 * automática (ColaSyncOffline en el layout). Este módulo solo muestra estado.
 *
 * Estados por misión:
 *   - 'esperando'  → en IDB, sin error reciente, no se está enviando ahora
 *   - 'enviando'   → en misionesEnviando (transitorio, en vuelo)
 *   - 'error'      → ultimoError en IDB (persiste al cerrar la app)
 *
 * Se actualiza sin recarga escuchando el evento 'gondolapp:cola-update'
 * disparado por ColaSyncOffline al cambiar el estado de la cola.
 */

import { useEffect, useState } from 'react'
import { WifiOff, Loader2, AlertCircle, Clock } from 'lucide-react'
import {
  listarMisionesPendientes,
  misionesEnviando,
  type MisionPendienteIDB,
} from '@/lib/mision-queue'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Timestamp de captura: mínimo timestampDispositivo entre bloques (= cuando
 * se sacó la primera foto). Cae a guardadaAt si no hay bloques con timestamp.
 */
function calcularTimestampCaptura(mision: MisionPendienteIDB): number {
  const ts = mision.bloquesCompletados
    .map(b => new Date(b.timestampDispositivo).getTime())
    .filter(t => Number.isFinite(t) && t > 0)
  return ts.length > 0 ? Math.min(...ts) : mision.guardadaAt
}

function formatearFecha(ts: number): string {
  const diffMs = Date.now() - ts
  const mins  = Math.floor(diffMs / 60_000)
  const horas = Math.floor(diffMs / 3_600_000)
  const dias  = Math.floor(diffMs / 86_400_000)
  if (mins  <  1) return 'hace un momento'
  if (mins  < 60) return `hace ${mins} min`
  if (horas < 24) return `hace ${horas}h`
  if (dias  === 1) return 'ayer'
  return `hace ${dias} días`
}

type EstadoUI = 'esperando' | 'enviando' | 'error'

function getEstadoUI(mision: MisionPendienteIDB): EstadoUI {
  if (misionesEnviando.has(mision.idempotenciaKey)) return 'enviando'
  if (mision.ultimoError)                           return 'error'
  return 'esperando'
}

// ── Componente ────────────────────────────────────────────────────────────────

export function MisionesPendientes() {
  const [pendientes, setPendientes] = useState<MisionPendienteIDB[]>([])

  async function actualizar() {
    try {
      const lista = await listarMisionesPendientes()
      setPendientes(lista)
    } catch {
      // idb-keyval no disponible (SSR accidental u otro entorno) — ignorar
    }
  }

  useEffect(() => {
    // Leer IDB al montar: cubre el caso "gondolero navega a campañas
    // con misiones ya guardadas offline".
    actualizar()

    // Evento de la cola: se dispara desde cola-sync-offline (al enviar)
    // y desde captura (al guardar en IDB). Actualiza sin recarga.
    window.addEventListener('gondolapp:cola-update', actualizar)

    // Releer cuando la pestaña vuelve al frente: cubre el caso donde
    // Next.js reutiliza el árbol de componentes desde el router cache
    // sin remontar (useEffect con [] no vuelve a correr en ese caso).
    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', actualizar)

    return () => {
      window.removeEventListener('gondolapp:cola-update', actualizar)
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', actualizar)
    }
  }, [])

  if (pendientes.length === 0) return null

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Cabecera */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-amber-200">
        <WifiOff size={16} className="text-amber-500 shrink-0" />
        <p className="text-sm font-semibold text-amber-800">
          {pendientes.length === 1
            ? '1 misión guardada offline'
            : `${pendientes.length} misiones guardadas offline`}
        </p>
      </div>

      {/* Lista */}
      <ul className="divide-y divide-amber-100">
        {pendientes.map(mision => {
          const estado = getEstadoUI(mision)
          const tsCaptura = calcularTimestampCaptura(mision)

          return (
            <li key={mision.idempotenciaKey} className="px-4 py-3">
              {/* Comercio + campaña */}
              <p className="text-sm font-medium text-gray-900 leading-snug">
                {mision.comercioNombre}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {mision.campanaNombre}
              </p>

              {/* Timestamp de captura */}
              <div className="flex items-center gap-1 mt-1.5">
                <Clock size={11} className="text-gray-400 shrink-0" />
                <p className="text-xs text-gray-400">
                  Capturada {formatearFecha(tsCaptura)}
                </p>
              </div>

              {/* Estado */}
              <div className="mt-2">
                {estado === 'enviando' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                    <Loader2 size={12} className="animate-spin" />
                    Enviando…
                  </span>
                )}
                {estado === 'esperando' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <WifiOff size={12} />
                    Esperando señal
                  </span>
                )}
                {estado === 'error' && (
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                      <AlertCircle size={12} />
                      Error al enviar — se reintentará automáticamente
                    </span>
                    {mision.ultimoIntentoAt && (
                      <p className="text-xs text-red-400 mt-0.5 pl-4">
                        Último intento {formatearFecha(mision.ultimoIntentoAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Pie */}
      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
        <p className="text-xs text-amber-700">
          Tu trabajo está guardado. Se enviará automáticamente cuando recuperes señal.
        </p>
      </div>
    </div>
  )
}
