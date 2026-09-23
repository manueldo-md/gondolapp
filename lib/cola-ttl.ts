/**
 * lib/cola-ttl.ts
 * Cuánto vive una misión en la cola offline, y cuándo hay que drenarla.
 *
 * ── POR QUÉ UN ARCHIVO PARA UN NÚMERO ───────────────────────────────────────
 * Los 7 días estaban escritos en TRES lugares que tienen que moverse juntos, y
 * dos de ellos mentían sobre dónde vivía el tercero:
 *
 *   cola-sync-offline.tsx   `SIETE_DIAS_MS`, el que efectivamente borra
 *   mision-queue.ts         un comentario que decía "TTL de 7 días en 3.4"
 *   campana-vigencia.ts     `DIAS_GRACIA_COLA`, el tope anti-falseo del SERVIDOR
 *
 * El tercero es el que hace que esto no sea cosmético. El gate del servidor
 * rechaza una captura más vieja que el TTL con el argumento de que "una misión
 * legítima nunca puede haber esperado más que eso". Si alguien sube el TTL a 14
 * y no toca el gate, la cola guarda siete días de misiones que el servidor va a
 * rechazar por viejas — trabajo hecho, conservado, y muerto al llegar. Si lo
 * baja y no toca el gate, el gate deja de proteger de nada.
 *
 * ── SIN DEPENDENCIAS, A PROPÓSITO ───────────────────────────────────────────
 * Este archivo lo importa `campana-vigencia.ts`, que corre en el SERVIDOR. Por
 * eso no importa `mision-queue.ts`: ese módulo trae `idb-keyval`, que no tiene
 * nada que hacer del lado del servidor. Los tipos de acá son estructurales.
 */

import { rechazoEsDefinitivo, type CodigoRechazoMision } from './rechazo-mision'

/**
 * Días que una misión sobrevive en la cola antes de vencer.
 *
 * Lo usan el TTL del cliente (`venceEnCola`) y el tope anti-falseo del servidor
 * (`DIAS_GRACIA_COLA` en `campana-vigencia.ts`). Son la misma regla mirada
 * desde los dos lados: el cliente no guarda más que esto, el servidor no acepta
 * una captura más vieja que esto.
 */
export const DIAS_TTL_COLA = 7

export const MS_TTL_COLA = DIAS_TTL_COLA * 24 * 60 * 60 * 1000

/** Lo mínimo de una entrada de la cola para decidir si vence. */
export interface EntradaConTTL {
  guardadaAt: number
  estado: 'pendiente' | 'rechazada'
  codigoRechazo?: CodigoRechazoMision | null
}

/**
 * ¿Esta entrada ya venció?
 *
 * ── LOS RECHAZOS DEFINITIVOS NO VENCEN (18/9/2026) ──────────────────────────
 * El TTL existe para que la cola no crezca sola: protege del caso "una misión
 * que se reintenta para siempre". Una misión con rechazo DEFINITIVO no se
 * reintenta nunca —no hay botón que la mande— así que no hay nada de qué
 * proteger, y borrarla tiene un costo real: si la única acción posible es
 * descartar y la descartamos nosotros por él, le sacamos el único registro de
 * que trabajó y de por qué no le sirvió.
 */
export function venceEnCola(entrada: EntradaConTTL, ahora: number = Date.now()): boolean {
  if (ahora - entrada.guardadaAt <= MS_TTL_COLA) return false
  if (entrada.estado === 'rechazada' && rechazoEsDefinitivo(entrada.codigoRechazo)) return false
  return true
}

/**
 * ¿Vale la pena intentar drenar la cola ahora?
 *
 * ── LA CONDICIÓN ES DE ESTADO, NO DE EVENTO ─────────────────────────────────
 * Es lo que arregla el bug del 24/9/2026. El único disparador automático era el
 * evento `'online'`, y un evento se PIERDE: si la señal vuelve mientras el
 * navegador tiene la pestaña congelada en segundo plano —lo normal en Android
 * después de unos minutos— ese evento no llega a nadie y NO se vuelve a emitir
 * al despertar. El gondolero podía pasar el día entero con misiones sin subir
 * leyendo "se enviará automáticamente".
 *
 * Un estado no se pierde: al volver la app al frente se PREGUNTA si hay cola y
 * si hay red, y la respuesta es la misma sin importar cuántos eventos se hayan
 * perdido en el medio.
 *
 * `navigator.onLine` en `false` es la única señal confiable de las dos: `true`
 * significa "hay interfaz de red", no "hay internet". Por eso sirve para NO
 * intentar, y no para prometer que va a funcionar.
 */
export function debeDrenar(estado: { hayCola: boolean; online: boolean }): boolean {
  return estado.hayCola && estado.online
}
