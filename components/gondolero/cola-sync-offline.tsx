'use client'

/**
 * ColaSyncOffline
 *
 * Componente sin UI que escucha el evento 'online' y drena la cola de
 * misiones guardadas en IDB. Vive en el layout del gondolero para que
 * corra en cualquier pantalla, no solo en captura.
 *
 * Disparadores:
 *   1. Mount del layout (cubre el caso "app abierta ya con señal").
 *   2. Evento 'online' del navegador (transición offline → online).
 *
 * Guard de módulo: `procesando` impide que dos ejecuciones corran en
 * paralelo si el evento online dispara dos veces seguidas o el layout
 * remonta durante la navegación.
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
} from '@/app/(gondolero)/gondolero/captura/actions'
import { comprimirImagen, generarPathFoto } from '@/lib/utils'

// ── Guard de concurrencia ─────────────────────────────────────────────────────
// Vive a nivel de módulo — sobrevive remounts del componente dentro de la misma
// sesión. Dos llamadas simultáneas a procesarColaOffline() retornan de inmediato.
let procesando = false

/** Notifica al módulo de misiones pendientes (MisionesPendientes en campañas). */
function dispatch() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gondolapp:cola-update'))
  }
}

async function procesarColaOffline() {
  if (procesando) return
  procesando = true

  try {
    const pendientes = await listarMisionesPendientes()

    // TODO: eliminar estos console.log antes de prod (diagnóstico offline 3.2)
    console.log('[cola-offline] drene iniciado —', pendientes.length, 'misiones pendientes')

    if (pendientes.length === 0) return

    const comprConfig = await obtenerConfigCompresion()

    for (const mision of pendientes) {
      // TODO: eliminar antes de prod
      console.log('[cola-offline] procesando misión', mision.idempotenciaKey, {
        campana:  mision.campanaNombre,
        comercio: mision.comercioNombre,
        guardadaAt: new Date(mision.guardadaAt).toISOString(),
      })

      // Marcar como "enviando" y notificar al módulo de campañas
      misionesEnviando.add(mision.idempotenciaKey)
      dispatch()

      try {
        // ── Construir FotoMisionInput[] ───────────────────────────────────────
        const fotos: FotoMisionInput[] = []

        for (const bloque of mision.bloquesCompletados) {
          // 1. Foto principal del bloque (campo_id = null en DB)
          if (bloque.blob) {
            const compressed = await comprimirImagen(
              bloque.blob,
              comprConfig.maxSizeMB,
              comprConfig.maxWidth,
              comprConfig.calidad,
            )
            const storagePath = generarPathFoto(mision.campanaId, mision.deviceId)
            const fd = new FormData()
            fd.append('foto', new File([compressed], 'foto.jpg', { type: 'image/jpeg' }))
            fd.append('storagePath', storagePath)
            const { url } = await subirFoto(fd)
            // Respuestas del bloque: solo las no-Blob (las Blob van como foto de campo aparte)
            const respuestasBloque = Object.entries(bloque.respuestas)
              .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(v instanceof Blob))
              .map(([campo_id, valor]) => ({ campo_id, valor }))

            fotos.push({
              bloqueId:             bloque.bloqueId ?? '',
              storagePath,
              url,
              precioConfirmado:     bloque.precio ? parseFloat(bloque.precio) : null,
              timestampDispositivo: bloque.timestampDispositivo,
              blurScore:            bloque.blurScore,
              respuestas:           respuestasBloque,
            })
          }

          // 2. Fotos de campo (campos tipo='foto' dentro del formulario del bloque)
          for (const [campo_id, valor] of Object.entries(bloque.respuestas)) {
            if (!(valor instanceof Blob)) continue  // File extends Blob — atrapa ambos
            const campoPath = generarPathFoto(mision.campanaId, mision.deviceId)
            const fd = new FormData()
            fd.append(
              'foto',
              valor instanceof File ? valor : new File([valor], 'foto-campo.jpg', { type: 'image/jpeg' }),
            )
            fd.append('storagePath', campoPath)
            const { url } = await subirFoto(fd)
            fotos.push({
              bloqueId:             bloque.bloqueId ?? '',
              storagePath:          campoPath,
              url,
              precioConfirmado:     null,
              timestampDispositivo: bloque.timestampDispositivo,
              blurScore:            null,
              respuestas:           [],  // fotos de campo no tienen respuestas propias
              campoId:              campo_id,
            })
          }
        }

        // ── Enviar al servidor ────────────────────────────────────────────────
        await registrarMision({
          campanaId:          mision.campanaId,
          comercioId:         mision.comercioId,
          deviceId:           mision.deviceId,
          lat:                mision.lat,
          lng:                mision.lng,
          puntosTotal:        mision.puntosTotal,
          fotos,
          respuestasDirectas: mision.respuestasDirectas,
          idempotenciaKey:    mision.idempotenciaKey,
        })

        // ── Éxito: borrar de IDB y notificar ─────────────────────────────────
        misionesEnviando.delete(mision.idempotenciaKey)
        await borrarMisionDeCola(mision.idempotenciaKey)
        dispatch()

        // TODO: eliminar antes de prod
        console.log('[cola-offline] ✓ misión enviada y borrada de IDB:', mision.idempotenciaKey)

      } catch (err) {
        misionesEnviando.delete(mision.idempotenciaKey)
        const mensajeError = err instanceof Error ? err.message : String(err)

        // TypeError = red cortada (fetch falló antes de llegar al servidor).
        // No tiene sentido seguir: las demás misiones también van a fallar.
        // Se reintenta todo en el próximo evento 'online'.
        const esErrorRed = err instanceof TypeError

        // Persistir el error en IDB para que sobreviva un cierre de la app
        await actualizarMisionEnCola(mision.idempotenciaKey, {
          ultimoIntentoAt: Date.now(),
          ultimoError: mensajeError,
        }).catch(() => { /* best-effort */ })
        dispatch()

        if (esErrorRed) {
          // TODO: eliminar antes de prod
          console.warn('[cola-offline] error de red — deteniendo cola:', err)
          break
        }

        // Error del servidor: saltear esta misión y continuar con las demás.
        // En 3.4 se distinguirá el rechazo del servidor con estado='rechazada'.
        // TODO: eliminar antes de prod
        console.error('[cola-offline] error del servidor para misión', mision.idempotenciaKey, '— saltando:', err)
      }
    }

  } finally {
    procesando = false
    // TODO: eliminar antes de prod
    console.log('[cola-offline] drene finalizado')
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ColaSyncOffline() {
  useEffect(() => {
    // Disparador 1: mount del layout.
    // Cubre el caso "gondolero abre la app ya con señal" —
    // el evento 'online' nunca dispara porque no hubo transición.
    procesarColaOffline()

    // Disparador 2: transición offline → online.
    window.addEventListener('online', procesarColaOffline)
    return () => window.removeEventListener('online', procesarColaOffline)
  }, [])

  // Sin UI — este componente solo registra efectos de red.
  return null
}
