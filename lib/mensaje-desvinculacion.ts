/**
 * lib/mensaje-desvinculacion.ts
 * Lo que se le dice al gondolero cuando se corta el vínculo.
 *
 * Client-safe, sin dependencias: lo usan la notificación del servidor y las dos
 * confirmaciones (la del panel de la distri y la del perfil del gondolero).
 *
 * ── POR QUÉ ESTÁ EN UN SOLO LUGAR ───────────────────────────────────────────
 * Son TRES caminos que cortan el mismo vínculo, y los textos dicen cosas
 * OPUESTAS según quién corta:
 *
 *   · corta la distri     → "se te acreditaron N puntos que estaban retenidos"
 *   · se va el gondolero  → "los N puntos que tenés retenidos se quedan retenidos"
 *
 * Escribir eso en cada pantalla es garantizar que un día una diga lo contrario
 * de lo que hace el servidor. La condición es `resumen.seLiquidan`, que viene
 * calculada de `lib/cerrar-vinculacion.ts` y no se deduce acá.
 *
 * ── LA DECISIÓN TIENE QUE SER INFORMADA ANTES DE CONFIRMAR ──────────────────
 * El gondolero que se va por su cuenta **deja plata retenida**, y tiene que
 * saberlo mientras todavía puede no apretar. Enterarse después es la misma
 * trampa del rechazo tardío: una consecuencia que nadie le mostró cuando podía
 * hacer algo al respecto.
 *
 * El texto también dice **por qué** —no llegó al mínimo— porque sin eso parece
 * un castigo arbitrario, y no lo es: esos puntos se liberan al completar el
 * mínimo, y él eligió irse antes.
 */

import type { ResumenCierre } from './cerrar-vinculacion'

/** El mensaje de la notificación `desvinculacion_distri`. Siempre lo corta la
 *  distri: es la única que notifica. */
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

  if (resumen.puntosRetenidos > 0 && resumen.seLiquidan) {
    // "aunque no llegaras al mínimo" va explícito: es la pregunta que se iba a
    // hacer al ver el movimiento, y la respuesta es que el trabajo ya estaba
    // aprobado. Ver lib/cerrar-vinculacion.ts.
    partes.push(
      `Se te acreditaron ${resumen.puntosRetenidos} puntos que estaban retenidos, ` +
      `aunque no llegaras al mínimo: ese trabajo ya estaba aprobado.`
    )
  }

  partes.push('Podés vincularte a otra distribuidora desde tu perfil.')
  return partes.join(' ')
}

/**
 * La confirmación del panel de la DISTRI, en tercera persona.
 * `null` cuando no hay nada que contar.
 */
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

  if (resumen.puntosRetenidos > 0) {
    // Del lado de la distri SIEMPRE se pagan, y el que desvincula es el que
    // paga: por eso el monto va en la confirmación y no como sorpresa después.
    partes.push(
      `se le van a acreditar ${resumen.puntosRetenidos} puntos retenidos ` +
      `(${resumen.misionesRetenidas} ${resumen.misionesRetenidas === 1 ? 'misión aprobada' : 'misiones aprobadas'} por debajo del mínimo)`
    )
  }

  if (partes.length === 0) return null
  return `Al desvincular a ${quien}, ${partes.join(' y ')}.`
}

/**
 * La confirmación del GONDOLERO que se va por su cuenta, en primera persona.
 *
 * La diferencia con la de arriba no es de tono: **acá los puntos NO se pagan**,
 * y esa es la consecuencia que tiene que ver antes de apretar. Si el texto se
 * limitara a "vas a dejar de ver sus campañas", se enteraría de la plata por un
 * saldo que no se movió.
 */
export function resumenParaDesvincularme(
  distriNombre: string,
  resumen: ResumenCierre,
): string[] {
  const partes: string[] = []

  if (resumen.participacionesCerradas === 1) {
    partes.push(`Se va a cerrar tu participación en "${resumen.campanasCerradas[0]}".`)
  } else if (resumen.participacionesCerradas > 1) {
    partes.push(`Se van a cerrar tus ${resumen.participacionesCerradas} campañas en curso con ${distriNombre}.`)
  }

  if (resumen.puntosRetenidos > 0 && !resumen.seLiquidan) {
    partes.push(
      `Si te vas ahora, los ${resumen.puntosRetenidos} puntos que tenés retenidos ` +
      `en ${resumen.participacionesCerradas === 1 ? 'esa campaña' : 'esas campañas'} ` +
      `se quedan retenidos, porque no llegaste al mínimo para cobrarlos.`
    )
  }

  return partes
}
