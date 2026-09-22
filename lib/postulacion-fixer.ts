/**
 * lib/postulacion-fixer.ts
 * En qué estado está la postulación de un fixer a un ejecutor.
 *
 * ── POR QUÉ ACÁ Y NO EN LA PANTALLA ─────────────────────────────────────────
 * La misma regla la necesitan tres lugares: la tarjeta de la oferta (para saber
 * qué botón dibujar), la action de postularse (para rechazar el reintento
 * temprano) y, el día que exista, cualquier pantalla del ejecutor que muestre el
 * historial. Escrita tres veces se separa, y acá la que decide es la action —
 * así que la pantalla quedaría ofreciendo un botón que el servidor rechaza.
 *
 * Este archivo **no importa nada**: lo usan Server Components, Server Actions y
 * el cliente.
 *
 * ── LA VENTANA DE 30 DÍAS ───────────────────────────────────────────────────
 * Un rechazo que no frena nada es un trámite que el fixer repite y el ejecutor
 * vuelve a rechazar. Pero tampoco puede ser para siempre: un rechazo por error,
 * o una repositora que el mes que viene sí necesita gente, dejarían a alguien
 * afuera de forma permanente por un click.
 *
 * Pasados los 30 días puede volver a intentar. Y mientras tanto le queda la
 * puerta que no depende de esto: que el ejecutor lo busque por su código o le
 * mande el link de invitación.
 *
 * ── ES UNA DURACIÓN, NO UN DÍA CALENDARIO ───────────────────────────────────
 * 30 días desde el instante del rechazo, no "el día 30 a partir de mañana". Por
 * eso se restan milisegundos y NO se usa `lib/fecha-ar.ts`: acá no hay ningún
 * día que decidir, y meter la zona sería agregarle una frontera a algo que no
 * la tiene.
 */

export const DIAS_ESPERA_REPOSTULACION = 30
const MS_ESPERA = DIAS_ESPERA_REPOSTULACION * 86_400_000

/** Lo que hace falta de la fila de solicitud. Sirve para las dos tablas. */
export interface SolicitudDeFixer {
  estado: string | null
  motivo_rechazo?: string | null
  rechazada_at?: string | null
}

export type EstadoPostulacion =
  /** Nunca se postuló, o el rechazo ya cumplió la espera. */
  | { estado: 'puede' }
  /** Ya la mandó y el ejecutor no la miró todavía. */
  | { estado: 'pendiente' }
  /** Ya está vinculado: no debería ni ver la oferta. */
  | { estado: 'vinculado' }
  /**
   * Lo rechazaron y todavía no puede volver a intentar.
   * `diasRestantes` es siempre ≥ 1: si diera 0, el botón diría "esperá 0 días".
   */
  | { estado: 'rechazada'; motivo: string | null; diasRestantes: number }

/**
 * `sol` es la fila del par (fixer, ejecutor), o `null` si nunca hubo una.
 *
 * ── SIN `rechazada_at` SE DEJA PASAR ────────────────────────────────────────
 * Las filas rechazadas antes de la migración `20260924100000` no tienen esa
 * marca. Bloquear "por las dudas" dejaría a alguien afuera por un dato que
 * nosotros no guardamos, y sin forma de saber cuánto falta ni de explicárselo.
 * Falla ABIERTO, que acá es el lado barato: lo peor que pasa es una postulación
 * de más que el ejecutor rechaza en un click.
 */
export function estadoPostulacion(
  sol: SolicitudDeFixer | null | undefined,
  ahora: Date = new Date(),
): EstadoPostulacion {
  if (!sol) return { estado: 'puede' }

  if (sol.estado === 'aprobada')  return { estado: 'vinculado' }
  if (sol.estado === 'pendiente') return { estado: 'pendiente' }

  // 'rechazada' y 'terminada' comparten camino: en las dos el vínculo no está.
  // 'terminada' es una desvinculación, y esa no tiene por qué esperar 30 días —
  // no hubo un "no" a una postulación. Sin `rechazada_at`, cae en 'puede'.
  if (!sol.rechazada_at) return { estado: 'puede' }

  const desde = Date.parse(sol.rechazada_at)
  if (!Number.isFinite(desde)) return { estado: 'puede' }

  const faltanMs = desde + MS_ESPERA - ahora.getTime()
  if (faltanMs <= 0) return { estado: 'puede' }

  return {
    estado: 'rechazada',
    motivo: sol.motivo_rechazo ?? null,
    // `ceil` y no `round`: con 12 horas restantes la respuesta correcta es "1
    // día", no "0". Un contador en cero al lado de un botón deshabilitado es la
    // clase de detalle que hace que alguien crea que la app está rota.
    diasRestantes: Math.max(1, Math.ceil(faltanMs / 86_400_000)),
  }
}

/** El texto del botón / del cartel, en un solo lugar. */
export function textoPostulacion(e: EstadoPostulacion): string {
  switch (e.estado) {
    case 'puede':     return 'Postularme'
    case 'pendiente': return 'Postulación enviada'
    case 'vinculado': return 'Ya trabajás con ellos'
    case 'rechazada':
      return e.diasRestantes === 1
        ? 'Podés volver a postularte mañana'
        : `Podés volver a postularte en ${e.diasRestantes} días`
  }
}
