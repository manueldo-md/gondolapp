/**
 * lib/mensaje-desvinculacion.ts
 * Lo que se le dice al gondolero cuando se corta el vínculo.
 *
 * Client-safe, sin dependencias: lo usan la notificación del servidor y la
 * confirmación del panel.
 *
 * Está acá y no escrito en cada camino porque son DOS —la distri lo desvincula,
 * o él se va— y los dos cierran lo mismo. El texto viejo decía solo *"tu
 * relación con X fue terminada"* y omitía las dos consecuencias que le importan:
 * que las campañas en curso se cerraron, y que los puntos que estaban retenidos
 * se le pagaron. Enterarse de que cobró por un movimiento suelto en el historial
 * es la peor forma de enterarse.
 */

import type { ResumenCierre } from './cerrar-vinculacion'

/** El mensaje de la notificación `desvinculacion_distri`. */
export function mensajeDesvinculacion(
  distriNombre: string,
  resumen: ResumenCierre,
): string {
  const partes: string[] = [`Tu relación con ${distriNombre} fue terminada.`]

  if (resumen.participacionesCerradas === 1) {
    partes.push(`Se cerró tu participación en "${resumen.campanasCerradas[0]}".`)
  } else if (resumen.participacionesCerradas > 1) {
    partes.push(`Se cerraron tus ${resumen.participacionesCerradas} campañas en curso.`)
  }

  if (resumen.puntosLiberados > 0) {
    // "aunque no llegaras al mínimo" va explícito: es la pregunta que se iba a
    // hacer al ver el movimiento, y la respuesta es que el trabajo ya estaba
    // aprobado. Ver lib/cerrar-vinculacion.ts.
    partes.push(
      `Se te acreditaron ${resumen.puntosLiberados} puntos que estaban retenidos, ` +
      `aunque no llegaras al mínimo: ese trabajo ya estaba aprobado.`
    )
  }

  partes.push('Podés vincularte a otra distribuidora desde tu perfil.')
  return partes.join(' ')
}

/** El texto de la confirmación, antes de desvincular. */
export function resumenParaConfirmar(
  quien: string,
  resumen: ResumenCierre,
): string | null {
  const partes: string[] = []

  if (resumen.participacionesCerradas === 1) {
    partes.push(`se va a cerrar su participación en "${resumen.campanasCerradas[0]}"`)
  } else if (resumen.participacionesCerradas > 1) {
    partes.push(`se van a cerrar sus ${resumen.participacionesCerradas} campañas en curso`)
  }

  if (resumen.puntosLiberados > 0) {
    partes.push(
      `se le van a acreditar ${resumen.puntosLiberados} puntos retenidos ` +
      `(${resumen.misionesLiberadas} ${resumen.misionesLiberadas === 1 ? 'misión aprobada' : 'misiones aprobadas'} por debajo del mínimo)`
    )
  }

  if (partes.length === 0) return null
  return `Al desvincular a ${quien}, ${partes.join(' y ')}.`
}
