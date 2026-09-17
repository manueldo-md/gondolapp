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
  esErrorDeRed,
} from '@/lib/mision-queue'
import { mensajeErrorInfra } from '@/lib/error-infra'
import { rechazoEsDefinitivo } from '@/lib/rechazo-mision'
import { enviarReportesPendientes } from '@/lib/reporte-ubicacion-queue'
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
        const resultado = await registrarMision({
          campanaId: mision.campanaId, comercioId: mision.comercioId,
          deviceId: mision.deviceId, lat: mision.lat, lng: mision.lng,
          puntosTotal: mision.puntosTotal, fotos,
          respuestasDirectas: mision.respuestasDirectas,
          idempotenciaKey: mision.idempotenciaKey,
          // Explícito: el servidor no puede deducirlo (el envío en vivo también
          // manda idempotenciaKey). Cambia el trato del bloqueo por distancia —
          // desde la cola se marca en vez de rechazar, porque el gondolero
          // validó contra las coordenadas cacheadas y pueden haber cambiado.
          desdeCola: true,
          // Cuándo se capturó, no cuándo llega. El gate de vencimiento juzga por
          // esto: una misión hecha el último día válido que sincroniza dos días
          // después es trabajo en plazo.
          capturadoAt: mision.guardadaAt,
        })

        // ── Rechazo de negocio ──────────────────────────────────────────────
        // Viene DEVUELTO, no lanzado. Es lo que antes caía en el `else` del
        // catch, pero con el texto entero: Next redacta el mensaje de las
        // excepciones en producción, así que hasta el 17/9/2026 el gondolero
        // leía "An error occurred in the Server Components render" como motivo
        // de rechazo y con eso decidía entre Reintentar y Descartar.
        //
        // El `continue` NO es opcional: sin él, el flujo sigue al borrado de
        // abajo y la misión se elimina de IDB como si hubiera entrado.
        if (!resultado.ok) {
          misionesEnviando.delete(mision.idempotenciaKey)
          await actualizarMisionEnCola(mision.idempotenciaKey, {
            ultimoIntentoAt: Date.now(),
            ultimoError:     resultado.motivo,
            estado:          'rechazada',
            motivoRechazo:   resultado.motivo,
            // El código, no el texto: es lo que decide si se ofrece Reintentar
            // y si esta entrada vence a los 7 días. Ver lib/rechazo-mision.ts.
            codigoRechazo:   resultado.codigo,
          }).catch(() => {})
          dispatch()
          console.error('[cola-offline] rechazo del servidor para misión',
            mision.idempotenciaKey, '—', resultado.motivo)
          continue
        }

        // ── Éxito ───────────────────────────────────────────────────────────
        misionesEnviando.delete(mision.idempotenciaKey)
        await borrarMisionDeCola(mision.idempotenciaKey)
        dispatch()

      } catch (err) {
        misionesEnviando.delete(mision.idempotenciaKey)
        const mensajeError = err instanceof Error ? err.message : String(err)
        const esErrorRed = esErrorDeRed(err)

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
          // ── Error INESPERADO: queda pendiente, no rechazada ────────────────
          //
          // Desde el 17/9/2026 los rechazos de negocio no llegan acá: vienen
          // devueltos y se manejan arriba. Lo que queda es infraestructura —un
          // 500, un deploy en el medio, un timeout de Postgres— y eso es
          // transitorio.
          //
          // Antes esta rama marcaba 'rechazada', con un comentario que lo
          // reconocía como limitación conocida: "un 500 transitorio llega aquí
          // también". Era tolerable mientras por acá pasaran también los
          // rechazos reales; ahora sería el ÚNICO caso, y estaría descartando
          // trabajo válido por un error de un segundo.
          //
          // Se deja pendiente con su último error y se reintenta. No hay riesgo
          // de loop infinito: lib/mision-queue.ts borra las entradas a los 7
          // días, así que el reintento está acotado.
          await actualizarMisionEnCola(mision.idempotenciaKey, {
            ultimoIntentoAt: Date.now(),
            ultimoError: mensajeErrorInfra(mensajeError, true),
          }).catch(() => {})
          dispatch()
          console.error('[cola-offline] error inesperado en misión',
            mision.idempotenciaKey, '—', mensajeError)
          programarReintento()
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
 *
 * ── LOS RECHAZOS DEFINITIVOS NO VENCEN (18/9/2026) ─────────────────────────
 * El TTL existe para que la cola no crezca sola: protege del caso "una misión
 * que se reintenta para siempre". Una misión con rechazo DEFINITIVO no se
 * reintenta nunca —no hay botón que la mande— así que no hay nada de qué
 * proteger, y borrarla tiene un costo real.
 *
 * Si la única acción posible es descartar y la descartamos nosotros por él, le
 * sacamos el único registro de que trabajó y de por qué no le sirvió. Un día va
 * a mirar la lista y no va a estar: sin aviso, sin rastro, y sin forma de
 * reclamar. Esa entrada se queda hasta que él decida borrarla.
 *
 * Las reintentables sí vencen, que es donde el TTL hace su trabajo.
 */
async function limpiarMisionesVencidas() {
  const ahora = Date.now()
  let pendientes
  try {
    pendientes = await listarMisionesPendientes()
  } catch { return }

  const vencidas = pendientes.filter(m =>
    ahora - m.guardadaAt > SIETE_DIAS_MS &&
    !(m.estado === 'rechazada' && rechazoEsDefinitivo(m.codigoRechazo))
  )
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
    // Los reportes de ubicación tienen su propia cola —son tres números, no
    // justifican la maquinaria de esta— pero comparten el disparador: sin esto
    // solo se enviarían si el gondolero vuelve a entrar a captura.
    enviarReportesPendientes().catch(() => {})

    const triggerCola = () => {
      procesarColaOffline()
      enviarReportesPendientes().catch(() => {})
    }
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
