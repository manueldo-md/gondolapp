'use client'

/**
 * ColaSyncOffline
 *
 * Componente sin UI que escucha el evento 'online' y drena la cola de
 * misiones guardadas en IDB. Vive en el layout del gondolero para que
 * corra en cualquier pantalla, no solo en captura.
 *
 * Disparadores externos (resetean el backoff):
 *   1. Mount del layout
 *   2. Evento 'online' del navegador
 *   3. Evento 'gondolapp:trigger-cola' (botón Reintentar en módulo de pendientes)
 *
 * Backoff interno (solo para errores de red, no para rechazos del servidor):
 *   3 reintentos a 30s / 2min / 5min. Al agotar, espera el próximo disparador
 *   externo. Los timers mueren al cerrar la app — al reabrir, el mount reinicia.
 */

import { useEffect } from 'react'
import {
  listarMisionesPendientes,
  borrarMisionDeCola,
  actualizarMisionEnCola,
  misionesEnviando,
} from '@/lib/mision-queue'
import type { FotoMisionInput } from '@/app/(gondolero)/gondolero/captura/actions'
import {
  subirFoto,
  registrarMision,
  obtenerConfigCompresion,
  registrarDescarte,
} from '@/app/(gondolero)/gondolero/captura/actions'
import { comprimirImagen, generarPathFoto } from '@/lib/utils'

// ── Guard de concurrencia ─────────────────────────────────────────────────────
let procesando = false

// ── Backoff (solo errores de red) ─────────────────────────────────────────────
let reintentoProgramado: ReturnType<typeof setTimeout> | null = null
let intentosRestantes = 3
const DELAYS_REINTENTO = [30_000, 2 * 60_000, 5 * 60_000] // 30s, 2min, 5min

/** Notifica al módulo de misiones pendientes (campañas) de un cambio de estado. */
function dispatch() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gondolapp:cola-update'))
  }
}

/**
 * Programa el próximo reintento automático si quedan intentos disponibles.
 * Solo se llama cuando el fallo fue de red (TypeError), no para rechazos del servidor.
 */
function programarReintento() {
  if (intentosRestantes <= 0) {
    return
  }
  const delayIdx = DELAYS_REINTENTO.length - intentosRestantes
  const delay = DELAYS_REINTENTO[delayIdx] ?? DELAYS_REINTENTO[DELAYS_REINTENTO.length - 1]
  intentosRestantes--
  reintentoProgramado = setTimeout(() => {
    reintentoProgramado = null
    procesarColaOffline(true) // fromBackoff = true: no resetear el contador
  }, delay)
}

// ── Cola principal ─────────────────────────────────────────────────────────────

/**
 * @param fromBackoff true cuando la llamada viene del timer de backoff.
 *   Si es false (trigger externo: mount, online, trigger-cola), se resetea el
 *   contador de intentos y se cancela cualquier timer pendiente.
 */
export async function procesarColaOffline(fromBackoff = false) {
  if (procesando) return

  if (!fromBackoff) {
    // Trigger externo: empezar limpio
    if (reintentoProgramado !== null) {
      clearTimeout(reintentoProgramado)
      reintentoProgramado = null
    }
    intentosRestantes = 3
  }

  procesando = true

  try {
    const pendientes = await listarMisionesPendientes()
    // Saltear las ya rechazadas — el gondolero las gestiona manualmente
    const paraEnviar = pendientes.filter(m => m.estado !== 'rechazada')

    if (paraEnviar.length === 0) return

    const comprConfig = await obtenerConfigCompresion()

    for (const mision of paraEnviar) {
      misionesEnviando.add(mision.idempotenciaKey)
      dispatch()

      try {
        // ── Construir FotoMisionInput[] ─────────────────────────────────────
        const fotos: FotoMisionInput[] = []

        for (const bloque of mision.bloquesCompletados) {
          if (bloque.blob) {
            const compressed = await comprimirImagen(
              bloque.blob, comprConfig.maxSizeMB, comprConfig.maxWidth, comprConfig.calidad,
            )
            const storagePath = generarPathFoto(mision.campanaId, mision.deviceId)
            const fd = new FormData()
            fd.append('foto', new File([compressed], 'foto.jpg', { type: 'image/jpeg' }))
            fd.append('storagePath', storagePath)
            const { url } = await subirFoto(fd)
            const respuestasBloque = Object.entries(bloque.respuestas)
              .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(v instanceof Blob))
              .map(([campo_id, valor]) => ({ campo_id, valor }))
            fotos.push({
              bloqueId: bloque.bloqueId ?? '', storagePath, url,
              precioConfirmado: bloque.precio ? parseFloat(bloque.precio) : null,
              timestampDispositivo: bloque.timestampDispositivo,
              blurScore: bloque.blurScore, respuestas: respuestasBloque,
            })
          }

          for (const [campo_id, valor] of Object.entries(bloque.respuestas)) {
            if (!(valor instanceof Blob)) continue
            const campoPath = generarPathFoto(mision.campanaId, mision.deviceId)
            const fd = new FormData()
            fd.append('foto', valor instanceof File ? valor : new File([valor], 'foto-campo.jpg', { type: 'image/jpeg' }))
            fd.append('storagePath', campoPath)
            const { url } = await subirFoto(fd)
            fotos.push({
              bloqueId: bloque.bloqueId ?? '', storagePath: campoPath, url,
              precioConfirmado: null, timestampDispositivo: bloque.timestampDispositivo,
              blurScore: null, respuestas: [], campoId: campo_id,
            })
          }
        }

        // ── Enviar ──────────────────────────────────────────────────────────
        await registrarMision({
          campanaId: mision.campanaId, comercioId: mision.comercioId,
          deviceId: mision.deviceId, lat: mision.lat, lng: mision.lng,
          puntosTotal: mision.puntosTotal, fotos,
          respuestasDirectas: mision.respuestasDirectas,
          idempotenciaKey: mision.idempotenciaKey,
        })

        // ── Éxito ───────────────────────────────────────────────────────────
        misionesEnviando.delete(mision.idempotenciaKey)
        await borrarMisionDeCola(mision.idempotenciaKey)
        dispatch()

      } catch (err) {
        misionesEnviando.delete(mision.idempotenciaKey)
        const mensajeError = err instanceof Error ? err.message : String(err)
        const esErrorRed = err instanceof TypeError

        if (esErrorRed) {
          // ── Error de red: backoff + dejar estado actual en IDB ────────────
          await actualizarMisionEnCola(mision.idempotenciaKey, {
            ultimoIntentoAt: Date.now(),
            ultimoError: mensajeError,
          }).catch(() => {})
          dispatch()
          console.warn('[cola-offline] error de red — programando reintento:', err)
          programarReintento()
          break // Detener la cola: las demás también fallarían
        } else {
          // ── Rechazo del servidor: marcar como rechazada ───────────────────
          // El gondolero verá el motivo en el módulo y podrá Reintentar o Descartar.
          // Nota: un 500 transitorio llega aquí también (known limitation, documentado
          // en CLAUDE.md). El botón Reintentar permite probar de nuevo antes de descartar.
          await actualizarMisionEnCola(mision.idempotenciaKey, {
            ultimoIntentoAt: Date.now(),
            ultimoError: mensajeError,
            estado: 'rechazada',
            motivoRechazo: mensajeError,
          }).catch(() => {})
          dispatch()
          console.error('[cola-offline] rechazo del servidor para misión',
            mision.idempotenciaKey, '—', mensajeError)
          // Continuar con las demás misiones
        }
      }
    }

  } finally {
    procesando = false
  }
}

// ── TTL de 7 días ─────────────────────────────────────────────────────────────

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Elimina de IDB las misiones con más de 7 días de antigüedad (calculado desde
 * guardadaAt). Intenta registrar un registro liviano best-effort antes de borrar.
 * Se llama al montar el layout, una vez por sesión.
 */
async function limpiarMisionesVencidas() {
  const ahora = Date.now()
  let pendientes
  try {
    pendientes = await listarMisionesPendientes()
  } catch { return }

  const vencidas = pendientes.filter(m => ahora - m.guardadaAt > SIETE_DIAS_MS)
  if (vencidas.length === 0) return

  for (const mision of vencidas) {
    try {
      await registrarDescarte({
        campanaId:       mision.campanaId,
        comercioId:      mision.comercioId,
        puntosTotal:     mision.puntosTotal,
        idempotenciaKey: mision.idempotenciaKey,
        motivoFallo:     mision.motivoRechazo ?? mision.ultimoError ?? 'TTL de 7 días alcanzado',
        descartadaAt:    ahora,
      })
    } catch {
      // Best-effort: si falla (sin señal), borrar igual
    }
    await borrarMisionDeCola(mision.idempotenciaKey).catch(() => {})
    dispatch()
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ColaSyncOffline() {
  useEffect(() => {
    // Limpiar vencidas antes de intentar envíos
    limpiarMisionesVencidas()
    // Drene inicial: cubre "app abierta ya con señal"
    procesarColaOffline()

    const triggerCola = () => procesarColaOffline()
    window.addEventListener('online', triggerCola)
    // Botón Reintentar en el módulo de pendientes
    window.addEventListener('gondolapp:trigger-cola', triggerCola)

    return () => {
      window.removeEventListener('online', triggerCola)
      window.removeEventListener('gondolapp:trigger-cola', triggerCola)
    }
  }, [])

  return null
}
