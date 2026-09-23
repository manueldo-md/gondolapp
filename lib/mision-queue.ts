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
import type { CodigoRechazoMision } from './rechazo-mision'

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
  /**
   * epoch ms de cuando se guardó. Es el reloj del TTL (`venceEnCola` en
   * `lib/cola-ttl.ts` — NO en este archivo, aunque un comentario viejo de acá
   * decía que sí) y además el `capturadoAt` que se le manda al servidor: el
   * gate juzga por cuándo se hizo el trabajo, no por cuándo llegó.
   */
  guardadaAt: number
  /** Estado actual en IDB. 'rechazada' = el servidor la rechazó con un motivo. */
  estado: 'pendiente' | 'rechazada'
  /** El texto que LEE el gondolero. Se edita; no se usa para decidir nada. */
  motivoRechazo: string | null
  /**
   * El código que DECIDE: si se ofrece "Reintentar" y si la entrada vence a los
   * 7 días. Ver lib/rechazo-mision.ts.
   *
   * Opcional a propósito, y sin bump de `version`: las entradas ya rechazadas en
   * el teléfono de alguien no lo tienen, y `rechazoEsDefinitivo(undefined)` es
   * `false` — o sea el comportamiento de siempre, los dos botones y el TTL
   * corriendo. Un campo ausente no le puede sacar la única salida a nadie.
   */
  codigoRechazo?: CodigoRechazoMision | null
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

// ── Lápidas de descarte ───────────────────────────────────────────────────────

export const DESCARTE_QUEUE_PREFIX = 'mision_descartada:'

/**
 * El rastro que queda cuando una misión se descarta y el servidor no contesta.
 *
 * ── EL MECANISMO QUE BORRA TRABAJO ERA EL QUE PEOR SE AUDITABA ──────────────
 * Hasta el 24/9/2026, los dos caminos de descarte —el TTL y el botón— hacían
 * lo mismo: llamar a `registrarDescarte` dentro de un `try/catch` vacío y
 * **borrar la entrada igual si fallaba**. Y el caso en que falla es
 * precisamente el caso natural: si hubiera señal, la misión se habría enviado
 * en vez de vencer. O sea que el escenario para el que se escribió el rastro
 * era justo aquel en el que el rastro no se escribía.
 *
 * El resultado medido el 24/9/2026: 7 descartes en dev y 1 en prod, **todos
 * manuales y con señal**, y cero rastros de TTL. Ese cero no significa que no
 * haya pasado: significa que si pasó, no quedó escrito en ninguna parte.
 *
 * La lápida cierra ese agujero sin reabrir el que el TTL vino a cerrar. La
 * entrada pesada —con los blobs de las fotos, que es lo que hace que la cola
 * crezca— se borra. Queda esto, que son unos cientos de bytes, y se reintenta
 * contra el servidor en el próximo drenaje con señal. Una vez que el servidor
 * lo acusa, se borra también.
 */
export interface DescarteIDB {
  version: 1
  idempotenciaKey: string
  campanaId: string
  campanaNombre: string
  comercioId: string
  comercioNombre: string
  puntosTotal: number
  motivoFallo: string
  /** epoch ms de cuándo se descartó. */
  descartadaAt: number
  /** epoch ms de cuándo se CAPTURÓ. No es lo mismo y el servidor usa éste. */
  capturadoAt: number
}

export function descarteQueueKey(idempotenciaKey: string): string {
  return `${DESCARTE_QUEUE_PREFIX}${idempotenciaKey}`
}

export async function guardarDescartePendiente(d: DescarteIDB): Promise<void> {
  await set(descarteQueueKey(d.idempotenciaKey), d)
}

export async function borrarDescartePendiente(idempotenciaKey: string): Promise<void> {
  await del(descarteQueueKey(idempotenciaKey))
}

export async function listarDescartesPendientes(): Promise<DescarteIDB[]> {
  const allKeys = await keys()
  const descarteKeys = allKeys.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(DESCARTE_QUEUE_PREFIX)
  )
  const descartes = await Promise.all(descarteKeys.map(k => get<DescarteIDB>(k)))
  return descartes.filter((d): d is DescarteIDB => d != null)
}

/**
 * ¿El envío falló por falta de red, o el servidor lo rechazó?
 *
 * Las dos situaciones necesitan respuestas opuestas: la de red se reintenta y
 * la misión sigue viva; la del servidor es terminal y hay que decírselo al
 * gondolero. Confundirlas le miente — le dijimos "se enviará cuando tengas
 * señal" a una misión que el servidor ya había rechazado definitivamente.
 *
 * Vive acá y no en cada caller porque hay DOS caminos de envío —el primer envío
 * desde captura y el reintento desde la cola— y durante un tiempo solo uno de
 * los dos discriminaba. Es el patrón contra el que advierte CLAUDE.md §20.
 *
 * El criterio: fetch tira TypeError cuando no puede completar la request. Un
 * throw del Server Action llega como Error común.
 */
export function esErrorDeRed(err: unknown): boolean {
  return err instanceof TypeError
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
  campos: Partial<Pick<MisionPendienteIDB, 'ultimoIntentoAt' | 'ultimoError' | 'estado' | 'motivoRechazo' | 'codigoRechazo'>>,
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
