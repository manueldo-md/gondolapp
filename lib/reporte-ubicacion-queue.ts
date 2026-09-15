/**
 * lib/reporte-ubicacion-queue.ts
 *
 * Cola offline de reportes de ubicación de comercios.
 *
 * POR QUÉ NO REUSA mision-queue: esa cola sube blobs comprimidos, maneja
 * idempotencia con UUID, reintenta con backoff y distingue error de red de
 * rechazo del servidor. Para tres números y dos ids es un cañón. Una key propia
 * y envío best-effort alcanza, y si un reporte se pierde no pasa nada: el
 * próximo gondolero que llegue a ese comercio reporta igual.
 *
 * TAMPOCO LLEVA CLAVE DE IDEMPOTENCIA, y es una decisión, no un olvido: un
 * reporte duplicado por un reintento no hace daño porque la dispersión se mide
 * sobre gondoleros DISTINTOS, no sobre filas. La misma defensa que ya
 * necesitábamos para el gondolero que reporta el mismo comercio dos veces cubre
 * este caso sin agregar nada.
 */

import { get, set, del, keys } from 'idb-keyval'

const PREFIX = 'reporte_ubicacion:'
/** Comercios que este dispositivo ya reportó. Solo para avisar en la UI. */
const REPORTADOS_KEY = 'comercios_reportados'

export interface ReportePendiente {
  comercioId: string
  lat: number
  lng: number
  distanciaMetros: number | null
  creadoAt: number
}

export async function encolarReporte(r: ReportePendiente): Promise<void> {
  await set(`${PREFIX}${r.comercioId}:${r.creadoAt}`, r)
}

export async function listarReportesPendientes(): Promise<{ key: string; reporte: ReportePendiente }[]> {
  const allKeys = await keys()
  const propias = allKeys.filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
  const out: { key: string; reporte: ReportePendiente }[] = []
  for (const k of propias) {
    const reporte = await get<ReportePendiente>(k)
    if (reporte) out.push({ key: k, reporte })
  }
  return out
}

export async function borrarReporte(key: string): Promise<void> {
  await del(key)
}

/**
 * Marca local de "ya reporté este comercio".
 *
 * Vive en el dispositivo y no en el servidor a propósito: sirve para avisarle al
 * gondolero, no para impedirle nada, y tiene que funcionar sin señal — que es
 * justo cuando no se puede consultar la base. Guarda la fecha para poder decir
 * cuándo fue.
 */
export async function marcarComercioReportado(comercioId: string): Promise<void> {
  const actual = (await get<Record<string, number>>(REPORTADOS_KEY)) ?? {}
  actual[comercioId] = Date.now()
  await set(REPORTADOS_KEY, actual)
}

export async function leerComerciosReportados(): Promise<Record<string, number>> {
  return (await get<Record<string, number>>(REPORTADOS_KEY)) ?? {}
}

/**
 * Vacía la cola. Best-effort: lo que no sale queda para el próximo intento.
 *
 * Solo borra la entry cuando el servidor confirma. Un reporte que falla se
 * reintenta; uno que se duplica no hace daño, porque la dispersión se cuenta
 * por gondoleros distintos.
 */
export async function enviarReportesPendientes(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  const pendientes = await listarReportesPendientes()
  if (pendientes.length === 0) return

  const { reportarUbicacionComercio } = await import(
    '@/app/(gondolero)/gondolero/captura/actions-comercios'
  )

  for (const { key, reporte } of pendientes) {
    try {
      const { ok } = await reportarUbicacionComercio({
        comercioId: reporte.comercioId,
        lat:        reporte.lat,
        lng:        reporte.lng,
      })
      if (ok) await borrarReporte(key)
    } catch {
      // Sin señal o servidor caído: queda encolado y se reintenta después.
      return
    }
  }
}
