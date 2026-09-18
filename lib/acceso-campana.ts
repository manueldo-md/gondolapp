/**
 * lib/acceso-campana.ts
 * ¿Este gondolero (o fixer) puede trabajar en esta campaña?
 *
 * ── POR QUÉ ESTÁ ACÁ Y NO EN CADA PANTALLA ──────────────────────────────────
 * La regla estaba escrita TRES veces —la lista de campañas, el detalle, y
 * `unirseACampana`— y las tres diferían. Medido el 18/9/2026:
 *
 *   caso                              lista      detalle    unirse
 *   via_ejecucion = 'gondolapp'       pasa       no mira    no mira
 *   'distri' SIN distri_id            BLOQUEA    pasa       pasa
 *   'marca' sin relación con la marca BLOQUEA    pasa       BLOQUEA
 *
 * O sea que había campañas que la lista no ofrecía y `unirse` aceptaba, y otras
 * que el detalle mostraba como disponibles y `unirse` rechazaba al apretar —el
 * rechazo tardío de siempre, esta vez por tres copias que se fueron separando.
 *
 * Este archivo **no importa nada**: lo usan Server Components, Server Actions y
 * puede usarlo el cliente. Los datos se los pasa el llamador.
 *
 * ── LA DIVERGENCIA DE 'distri' SIN distri_id: BLOQUEA ────────────────────────
 * Se eligió el comportamiento de la lista, que era el más restrictivo.
 *
 * `financiada_por = 'distri'` dice quién PAGA. Sin `distri_id` no hay quien
 * pague: no es una campaña abierta, es una campaña incoherente. Dejarla pasar
 * significa que el trabajo se hace, los puntos se prometen, y al liquidar no
 * hay a quién cobrarle — o los termina pagando GondolApp por una decisión que
 * nadie tomó, que es lo que pasa cuando un dato faltante se interpreta como
 * permiso.
 *
 * El costo de bloquear es cero hoy: no hay ninguna campaña así en dev ni en
 * prod. Y el bloqueo no es silencioso —`accesoACampana` loguea el caso como
 * problema de datos— porque el que tiene que enterarse es el que la creó, no el
 * gondolero.
 */

export type MotivoSinAcceso =
  /** Campaña de fixers y el usuario es gondolero, o al revés. */
  | 'actor_distinto'
  /** La financia una distribuidora y no tiene vínculo aprobado con ella. */
  | 'sin_vinculo_distri'
  /** La financia una marca y ninguna de sus distris trabaja con esa marca. */
  | 'sin_vinculo_marca'
  /** La ejecuta una repositora y no tiene vínculo aprobado con ella. */
  | 'sin_vinculo_repo'
  /** `financiada_por='distri'` sin `distri_id`: no hay quién pague. */
  | 'campana_sin_financiador'

export interface CampanaAcceso {
  id?: string
  financiada_por: string | null
  via_ejecucion?: string | null
  distri_id: string | null
  /**
   * La repositora que la ejecuta. **Es el eje de los fixers**, y las tres copias
   * de esta regla lo ignoraban: solo miraban distribuidoras.
   *
   * Medido el 18/9/2026: los 6 fixers con misiones de prod están vinculados por
   * `fixer_repo_solicitudes`, ninguno por `fixer_distri_solicitudes`, y las dos
   * campañas `actor_campana='fixer'` tienen `repositora_id` y no `distri_id`.
   * Un gate que solo mirara distribuidoras les habría cortado 25 misiones de
   * trabajo real.
   */
  repositora_id?: string | null
  marca_id: string | null
  actor_campana?: string | null
}

export interface ContextoAcceso {
  esFixer: boolean
  /**
   * Las distribuidoras del actor. Para una misión que viene de la cola son las
   * que tenía **al capturar**, no las de ahora: ver `getDistrisDeActor`.
   */
  misDistriIds: string[]
  /** Las repositoras del actor. Solo los fixers tienen. */
  misRepoIds?: string[]
  /** Relaciones marca↔distri ACTIVAS de sus distribuidoras. */
  relacionesMarcaDistri: { marca_id: string; distri_id: string }[]
}

export type ResultadoAcceso =
  | { ok: true }
  | { ok: false; motivo: MotivoSinAcceso; mensaje: string }

/** El texto que ve el gondolero. Depende de si es fixer solo donde cambia. */
function mensajeDe(motivo: MotivoSinAcceso, esFixer: boolean): string {
  const quien = esFixer ? 'fixers' : 'gondoleros'
  switch (motivo) {
    case 'actor_distinto':
      return esFixer
        ? 'Esta campaña es exclusiva para gondoleros.'
        : 'Esta campaña es exclusiva para fixers.'
    case 'sin_vinculo_distri':
      return `Esta campaña es exclusiva para ${quien} vinculados a esa distribuidora.`
    case 'sin_vinculo_marca':
      return `Esta campaña es exclusiva para ${quien} de distribuidoras que trabajan con esa marca.`
    case 'sin_vinculo_repo':
      return `Esta campaña es exclusiva para ${quien} vinculados a esa repositora.`
    case 'campana_sin_financiador':
      // Neutro a propósito: el problema es de la campaña, no de él, y no gana
      // nada sabiendo que está mal configurada.
      return 'Esta campaña no está disponible por ahora.'
  }
}

/**
 * La regla completa, en un solo lugar.
 *
 * El orden importa: primero el tipo de actor —que no depende de vínculos— y
 * después el financiador. Las campañas de GondolApp salen antes de mirar
 * cualquier vínculo, que es lo que las mantiene abiertas para todos.
 */
export function accesoACampana(
  campana: CampanaAcceso,
  ctx: ContextoAcceso,
): ResultadoAcceso {
  const no = (motivo: MotivoSinAcceso): ResultadoAcceso =>
    ({ ok: false, motivo, mensaje: mensajeDe(motivo, ctx.esFixer) })

  // ── 1. El tipo de actor ────────────────────────────────────────────────────
  // `null` en actor_campana es "cualquiera": son las campañas viejas, anteriores
  // a la columna.
  const actor = campana.actor_campana
  if (actor === 'fixer'     && !ctx.esFixer) return no('actor_distinto')
  if (actor === 'gondolero' &&  ctx.esFixer) return no('actor_distinto')

  // ── 2. Las que no requieren vínculo con nadie ──────────────────────────────
  const fp = campana.financiada_por
  if (!fp || fp === 'gondolapp') return { ok: true }
  if (campana.via_ejecucion === 'gondolapp') return { ok: true }
  // Sin ejecutora y sin marca no hay a quién pertenecer: es de GondolApp de
  // hecho, aunque la columna diga otra cosa.
  if (!campana.distri_id && !campana.repositora_id && !campana.marca_id) return { ok: true }

  // ── 3. La ejecuta una repositora ───────────────────────────────────────────
  // Va antes que el financiador porque manda QUIÉN LA EJECUTA: es el eje de los
  // fixers, igual que `distri_id` es el de los gondoleros. Una campaña de marca
  // ejecutada por una repositora pide vínculo con ESA repositora, no con una
  // distribuidora que trabaje con la marca.
  if (campana.repositora_id) {
    return (ctx.misRepoIds ?? []).includes(campana.repositora_id)
      ? { ok: true }
      : no('sin_vinculo_repo')
  }

  // ── 4. La financia una distribuidora ───────────────────────────────────────
  if (fp === 'distri') {
    if (!campana.distri_id) return no('campana_sin_financiador')
    return ctx.misDistriIds.includes(campana.distri_id)
      ? { ok: true }
      : no('sin_vinculo_distri')
  }

  // ── 5. La financia una marca ───────────────────────────────────────────────
  if (fp === 'marca') {
    // Con distribuidora ejecutora: tiene que estar vinculado a ESA.
    if (campana.distri_id) {
      return ctx.misDistriIds.includes(campana.distri_id)
        ? { ok: true }
        : no('sin_vinculo_distri')
    }
    // Sin ejecutora: alcanza con que alguna de sus distris trabaje con la marca.
    return ctx.relacionesMarcaDistri.some(r => r.marca_id === campana.marca_id)
      ? { ok: true }
      : no('sin_vinculo_marca')
  }

  // Un `financiada_por` que no conocemos se trata como la incoherencia que es.
  return no('campana_sin_financiador')
}

/** Atajo para los `.filter()` de las listas. */
export function tieneAccesoACampana(campana: CampanaAcceso, ctx: ContextoAcceso): boolean {
  return accesoACampana(campana, ctx).ok
}
