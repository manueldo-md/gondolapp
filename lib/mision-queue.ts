/**
 * lib/mision-queue.ts
 *
 * Cola offline de misiones en IndexedDB.
 *
 * Una misión se guarda aquí ANTES de intentar el envío al servidor.
 * Si el envío tiene éxito, se borra. Si falla (sin señal o error del servidor),
 * queda persistida para ser reintentada en 3.2 (envío automático al recuperar señal).
 *
 * Estructura de keys: "mision_pendiente:{idempotenciaKey}"
 * Una key por misión — atómica, sin riesgo de corrupción cruzada entre entradas.
 */

import { get, set, del, keys } from 'idb-keyval'

export const MISION_QUEUE_PREFIX = 'mision_pendiente:'

/**
 * Bloque completado serializable en IDB.
 * Mismo shape que BloqueCompletadoLocal en captura/page.tsx pero sin previewUrl
 * — los object URLs son efímeros y no sobreviven entre sesiones de la app.
 * Se regeneran con URL.createObjectURL(blob) al leer de IDB cuando haga falta.
 *
 * Los Blob values dentro de `respuestas` (campos tipo='foto') se serializan
 * correctamente vía structured clone, igual que el blob de bloque.
 */
export interface BloqueCompletadoIDB {
  bloqueIdx: number
  bloqueId: string | null
  /** Foto de bloque (campo_id = null en DB). null en flujo nuevo 5b+. */
  blob: Blob | null
  precio: string
  /** Valores de campos del formulario. Puede contener Blob para campos tipo='foto'. */
  respuestas: Record<string, unknown>
  blurScore: number | null
  timestampDispositivo: string
}

export interface MisionPendienteIDB {
  /** Versión del schema para migración futura. */
  version: 1
  /** UUID generado en el cliente — clave de idempotencia en registrarMision. */
  idempotenciaKey: string
  /** epoch ms de cuando se guardó — usado para TTL de 7 días en 3.4. */
  guardadaAt: number
  /** Estado actual en IDB. 'rechazada' = el servidor la rechazó con un motivo. */
  estado: 'pendiente' | 'rechazada'
  motivoRechazo: string | null
  /**
   * epoch ms del último intento de envío. undefined en entradas que nunca
   * se intentaron aún. Junto con ultimoError permite mostrar "cuándo falló" en UI.
   */
  ultimoIntentoAt?: number
  /**
   * Mensaje del último error de red o del servidor. null/undefined = sin error aún.
   * Se limpia cuando el envío tiene éxito (la entry se borra de IDB en ese caso).
   * Base para 3.4: el rechazo del servidor se guarda aquí también.
   */
  ultimoError?: string | null
  campanaId: string
  campanaNombre: string
  comercioId: string
  comercioNombre: string
  lat: number
  lng: number
  deviceId: string
  puntosTotal: number
  bloquesCompletados: BloqueCompletadoIDB[]
  /** Respuestas de campos no-foto de bloques sin blob (flujo nuevo 5b+). */
  respuestasDirectas: { campo_id: string; valor: unknown }[]
}

export function misionQueueKey(idempotenciaKey: string): string {
  return `${MISION_QUEUE_PREFIX}${idempotenciaKey}`
}

/**
 * Misiones que se están enviando ahora mismo (en memoria, transitorio).
 * Se vacía al cerrar la app. No persiste entre sesiones — usar ultimoIntentoAt
 * y ultimoError en la entry de IDB para estados que sobrevivan un cierre.
 */
export const misionesEnviando = new Set<string>()

/**
 * Guarda la misión en IDB. Puede lanzar QuotaExceededError — el caller
 * debe atraparlo y continuar (intentar enviar igual sin backup).
 */
export async function guardarMisionEnCola(mision: MisionPendienteIDB): Promise<void> {
  await set(misionQueueKey(mision.idempotenciaKey), mision)
}

/**
 * Borra la misión de IDB. Llamar después de un envío exitoso.
 * Best-effort: si falla, el próximo envío será idempotente por la key.
 */
export async function borrarMisionDeCola(idempotenciaKey: string): Promise<void> {
  await del(misionQueueKey(idempotenciaKey))
}

/**
 * Actualiza campos de una entry existente en IDB (merge parcial).
 * Usado por la cola para escribir ultimoIntentoAt y ultimoError sin reemplazar
 * los blobs ni el resto del estado. No hace nada si la key no existe.
 */
export async function actualizarMisionEnCola(
  idempotenciaKey: string,
  campos: Partial<Pick<MisionPendienteIDB, 'ultimoIntentoAt' | 'ultimoError' | 'estado' | 'motivoRechazo'>>,
): Promise<void> {
  const key = misionQueueKey(idempotenciaKey)
  const existente = await get<MisionPendienteIDB>(key)
  if (!existente) return
  await set(key, { ...existente, ...campos })
}

/**
 * Lista todas las misiones pendientes en IDB.
 * Usado en 3.2 (envío automático) y 3.3 (módulo de pendientes en campañas).
 */
export async function listarMisionesPendientes(): Promise<MisionPendienteIDB[]> {
  const allKeys = await keys()
  const misionKeys = allKeys.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(MISION_QUEUE_PREFIX)
  )
  const misiones = await Promise.all(misionKeys.map(k => get<MisionPendienteIDB>(k)))
  return misiones.filter((m): m is MisionPendienteIDB => m != null)
}
