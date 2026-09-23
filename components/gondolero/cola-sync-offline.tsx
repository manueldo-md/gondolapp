'use client'

/**
 * ColaSyncOffline
 *
 * Componente sin UI que escucha el evento 'online' y drena la cola de
 * misiones guardadas en IDB. Vive en el layout del gondolero para que
 * corra en cualquier pantalla, no solo en captura.
 *
 * Disparadores externos (todos resetean el backoff):
 *   1. Mount del layout — corre UNA sola vez por sesión: App Router no remonta
 *      un layout al navegar entre sus hijos
 *   2. Evento 'online' — se PIERDE si la pestaña está congelada en segundo
 *      plano, y no se vuelve a emitir al despertar
 *   3. 'visibilitychange' y 'focus' — preguntan por el ESTADO al volver la app
 *      al frente. Es lo único que cubre el 'online' perdido, y es el arreglo
 *      del 24/9/2026
 *   4. Evento 'gondolapp:trigger-cola' (botón Reintentar del módulo)
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
import { listarDescartesPendientes } from '@/lib/mision-queue'
import { mensajeErrorInfra } from '@/lib/error-infra'
import { venceEnCola, debeDrenar, DIAS_TTL_COLA } from '@/lib/cola-ttl'
import { descartarMision, enviarDescartesPendientes } from '@/lib/descarte-cola'
import { enviarReportesPendientes } from '@/lib/reporte-ubicacion-queue'
import type { FotoMisionInput } from '@/app/(gondolero)/gondolero/captura/actions'
import {
  subirFoto,
  registrarMision,
  obtenerConfigCompresion,
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

// ── TTL ───────────────────────────────────────────────────────────────────────

/**
 * Elimina de IDB las misiones vencidas, dejando la lápida de cada una.
 *
 * El plazo y la regla de qué vence viven en `lib/cola-ttl.ts`, porque el tope
 * anti-falseo del SERVIDOR está atado al mismo número desde el otro lado. El
 * descarte en sí lo hace `descartarMision`, que es el mismo que usa el botón.
 */
async function limpiarMisionesVencidas() {
  const ahora = Date.now()
  let pendientes
  try {
    pendientes = await listarMisionesPendientes()
  } catch { return }

  const vencidas = pendientes.filter(m => venceEnCola(m, ahora))
  if (vencidas.length === 0) return

  for (const mision of vencidas) {
    await descartarMision(mision, `TTL de ${DIAS_TTL_COLA} días alcanzado`, ahora)
    dispatch()
  }
}

// ── Disparadores ──────────────────────────────────────────────────────────────

/**
 * Drena todo lo que espera: misiones, lápidas de descarte y reportes de GPS.
 *
 * ── LA CONDICIÓN SE PREGUNTA, NO SE ESPERA ──────────────────────────────────
 * Ver `debeDrenar` en `lib/cola-ttl.ts`. El punto es que este trigger se puede
 * llamar cuantas veces se quiera y desde cualquier lado: si no hay nada que
 * mandar o no hay red, no hace nada y no cuesta nada.
 */
async function drenarTodo() {
  // Si IDB no contesta, se asume que HAY cola y se intenta igual. Falla
  // abierto: el intento sobre una cola vacía es un no-op —`procesarColaOffline`
  // vuelve a listar y sale— mientras que asumir que está vacía por un error de
  // lectura dejaría trabajo sin enviar por la misma clase de fallo silencioso
  // que este tramo vino a cerrar.
  let hayCola = true
  try {
    hayCola = (await listarMisionesPendientes()).length > 0
             || (await listarDescartesPendientes()).length > 0
  } catch { /* se queda en true */ }

  if (!debeDrenar({ hayCola, online: navigator.onLine })) return

  procesarColaOffline()
  enviarDescartesPendientes().catch(() => {})
  // Los reportes de ubicación tienen su propia cola —son tres números, no
  // justifican la maquinaria de esta— pero comparten el disparador: sin esto
  // solo se enviarían si el gondolero vuelve a entrar a captura.
  enviarReportesPendientes().catch(() => {})
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ColaSyncOffline() {
  useEffect(() => {
    // Limpiar vencidas antes de intentar envíos
    limpiarMisionesVencidas()
    // Drene inicial: cubre "app abierta ya con señal". El mount de ESTE efecto
    // corre una sola vez por sesión: el componente vive en el layout del grupo
    // y App Router no remonta un layout al navegar entre sus hijos.
    drenarTodo()

    // ── OJO CON PASAR `drenarTodo` DIRECTO A addEventListener ────────────────
    // Sería `procesarColaOffline(evento)`, y ese primer parámetro es
    // `fromBackoff`: un Event es truthy, así que el contador de reintentos NO
    // se resetearía y el drenaje quedaría con el backoff agotado. El wrapper
    // no es estilo, es lo que hace que el punto 2 funcione.
    const trigger = () => { drenarTodo() }

    // El evento de transición. Se pierde si la pestaña está congelada, que es
    // exactamente por lo que no puede ser el único.
    window.addEventListener('online', trigger)

    // Los dos que preguntan por el ESTADO al volver la app al frente. Cubren el
    // caso que `online` no puede cubrir: la señal volvió mientras el navegador
    // tenía la pestaña en segundo plano, ese evento no llegó, y nadie lo repite
    // al despertar.
    const alVolverAlFrente = () => {
      if (document.visibilityState !== 'visible') return
      drenarTodo()
    }
    document.addEventListener('visibilitychange', alVolverAlFrente)
    window.addEventListener('focus', alVolverAlFrente)

    // Botón Reintentar en el módulo de pendientes
    window.addEventListener('gondolapp:trigger-cola', trigger)

    return () => {
      window.removeEventListener('online', trigger)
      document.removeEventListener('visibilitychange', alVolverAlFrente)
      window.removeEventListener('focus', alVolverAlFrente)
      window.removeEventListener('gondolapp:trigger-cola', trigger)
    }
  }, [])

  return null
}
