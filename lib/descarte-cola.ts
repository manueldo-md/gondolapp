'use client'

/**
 * lib/descarte-cola.ts
 * Descartar una misión de la cola offline, sin perder el rastro.
 *
 * ── POR QUÉ ACÁ Y NO EN CADA CAMINO ─────────────────────────────────────────
 * Hay DOS formas de que una misión salga de la cola sin haberse enviado, y las
 * dos borran trabajo:
 *
 *   1. El TTL, en `cola-sync-offline.tsx` — vence a los 7 días
 *   2. El botón Descartar, en `misiones-pendientes.tsx` — lo decide el gondolero
 *
 * Hasta el 24/9/2026 cada una tenía su propia copia del mismo bloque: llamar a
 * `registrarDescarte`, tragarse el error, borrar igual. Las copias ya habían
 * empezado a separarse —el `motivoFallo` por defecto era distinto en cada una—
 * que es el primer síntoma de siempre.
 *
 * Es el patrón contra el que advierte CLAUDE.md §20, aplicado al camino que
 * BORRA en vez de al que escribe.
 */

import {
  borrarMisionDeCola,
  guardarDescartePendiente,
  borrarDescartePendiente,
  listarDescartesPendientes,
  type MisionPendienteIDB,
} from './mision-queue'
import { registrarDescarte } from '@/app/(gondolero)/gondolero/captura/actions'

/** Lo que se le manda al servidor. Mismo shape que la lápida, sin los nombres. */
function payload(d: {
  campanaId: string; comercioId: string; puntosTotal: number
  idempotenciaKey: string; motivoFallo: string; descartadaAt: number; capturadoAt: number
}) {
  return d
}

/**
 * Saca la misión de la cola y deja constancia de que se descartó.
 *
 * ── EL ORDEN IMPORTA, Y NO ES EL OBVIO ──────────────────────────────────────
 * Primero se escribe la lápida, DESPUÉS se intenta el servidor, y recién al
 * final se borra la entrada pesada. Si se intentara el servidor primero y el
 * proceso muriera en el medio —la app cerrada, el teléfono sin batería— no
 * quedaría ni el registro remoto ni el local.
 *
 * Con este orden el peor caso es una lápida de más que el próximo drenaje
 * reenvía; `registrarDescarte` es idempotente por `idempotenciaKey`, así que
 * reenviarla no duplica nada.
 *
 * La entrada pesada —los blobs de las fotos— se borra SIEMPRE. Es lo que hace
 * que la cola no crezca, que es para lo que existe el TTL.
 */
export async function descartarMision(
  mision: MisionPendienteIDB,
  motivoPorDefecto: string,
  ahora: number = Date.now(),
): Promise<void> {
  const datos = payload({
    campanaId:       mision.campanaId,
    comercioId:      mision.comercioId,
    puntosTotal:     mision.puntosTotal,
    idempotenciaKey: mision.idempotenciaKey,
    motivoFallo:     mision.motivoRechazo ?? mision.ultimoError ?? motivoPorDefecto,
    descartadaAt:    ahora,
    // Cuándo la CAPTURÓ, que no es cuándo se descartó.
    capturadoAt:     mision.guardadaAt,
  })

  // 1. La lápida primero: es lo único que sobrevive si todo lo demás falla.
  await guardarDescartePendiente({
    version: 1,
    campanaNombre:  mision.campanaNombre,
    comercioNombre: mision.comercioNombre,
    ...datos,
  }).catch(() => { /* IDB lleno: se sigue igual, no hay nada mejor que hacer */ })

  // 2. El servidor. Si contesta, la lápida ya cumplió y se va.
  try {
    await registrarDescarte(datos)
    await borrarDescartePendiente(mision.idempotenciaKey).catch(() => {})
  } catch {
    // Sin señal: la lápida queda y la reenvía `enviarDescartesPendientes`.
  }

  // 3. La entrada pesada se va siempre.
  await borrarMisionDeCola(mision.idempotenciaKey).catch(() => {})
}

/**
 * Reenvía las lápidas que quedaron sin acusar.
 *
 * Corre con los mismos disparadores que el drenaje de misiones. Un fallo no se
 * reintenta acá: la lápida se queda y el próximo disparador la vuelve a
 * intentar. No tiene TTL a propósito —pesa unos cientos de bytes y es la única
 * constancia de un trabajo que se perdió—, así que lo peor que puede pasar es
 * que sobreviva hasta que haya señal.
 */
export async function enviarDescartesPendientes(): Promise<void> {
  let pendientes
  try {
    pendientes = await listarDescartesPendientes()
  } catch { return }
  if (pendientes.length === 0) return

  for (const d of pendientes) {
    try {
      await registrarDescarte({
        campanaId:       d.campanaId,
        comercioId:      d.comercioId,
        puntosTotal:     d.puntosTotal,
        idempotenciaKey: d.idempotenciaKey,
        motivoFallo:     d.motivoFallo,
        descartadaAt:    d.descartadaAt,
        capturadoAt:     d.capturadoAt,
      })
      await borrarDescartePendiente(d.idempotenciaKey).catch(() => {})
    } catch {
      // Sigue sin señal: se reintenta en el próximo disparador.
      return
    }
  }
}
