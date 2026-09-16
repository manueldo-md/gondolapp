/**
 * lib/campana-fechas.ts
 * La regla de las fechas de campaña, en un solo lugar.
 *
 * Mismo motivo que lib/campana-minimo.ts: los tres editores de campaña están
 * duplicados (ver CLAUDE.md, "Deuda conocida") y sus tres server actions
 * también. Sin esto la misma validación se escribe seis veces y diverge a la
 * primera corrección.
 *
 * ── POR QUÉ NO SE USA schemaCampanaPaso2 ────────────────────────────────────
 * Se intentó conectarlo con safeParse el 16/9/2026 y NO SE PUEDE: el schema
 * exige `fecha_limite_inscripcion` y `es_abierta`, y **ninguno de los tres
 * editores manda esos campos** — ni los formularios los piden ni las actions los
 * insertan. Conectarlo tal cual haría fallar el 100% de las creaciones.
 *
 * El schema describe un formulario que ya no existe. Quedó escrito en abril,
 * nunca se llamó, y los editores siguieron cambiando sin él. Está anotado en
 * CLAUDE.md junto con los otros seis schemas muertos.
 *
 * Lo que sí se rescata acá es la regla que ese schema tenía y nadie corría: que
 * la fecha de fin sea posterior al inicio. Hoy nada lo impide, y con el gate de
 * vencimiento una campaña con fin anterior al inicio **nace vencida**.
 */

export interface FechasValidacion {
  ok: boolean
  /** Mensaje para mostrar. `null` cuando ok. */
  error: string | null
}

/** Las dos modalidades de `campanas.modalidad`. */
export type Modalidad = 'puntual' | 'seguimiento'

/**
 * Valida las fechas de una campaña, según su modalidad.
 *
 * PUNTUAL: `fecha_fin` es obligatoria. Sin fecha de fin no vence nunca, y el
 * gate de registrarMision no dispararía jamás para ella.
 *
 * SEGUIMIENTO: `fecha_fin` está PROHIBIDA. Una campaña de seguimiento es
 * continua por definición — esa es toda la diferencia entre las dos
 * modalidades— y ponerle una fecha de fin la convierte en una puntual con otro
 * nombre.
 *
 * La base respalda las dos mitades con el CHECK
 * `campanas_fecha_fin_por_modalidad`, pero sin esta validación el usuario vería
 * un error de constraint de Postgres en lugar de una frase que se entienda.
 *
 * El parámetro `modalidad` es obligatorio a propósito: dejarlo opcional con
 * default 'puntual' haría que un llamador nuevo que se olvide de pasarlo
 * rechace en silencio todas las campañas de seguimiento. Que no compile es
 * mejor que que falle callado.
 */
export function validarFechasCampana(
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined,
  modalidad: Modalidad,
): FechasValidacion {
  const inicio = (fechaInicio ?? '').trim()
  const fin    = (fechaFin ?? '').trim()

  if (modalidad === 'seguimiento') {
    if (fin) {
      return {
        ok: false,
        error: 'Una campaña de seguimiento no lleva fecha de cierre: es continua hasta que la cierres a mano.',
      }
    }
    return { ok: true, error: null }
  }

  if (!fin) {
    return { ok: false, error: 'La fecha de cierre es obligatoria: sin ella la campaña no termina nunca.' }
  }
  if (inicio && fin <= inicio) {
    // Comparación de strings YYYY-MM-DD: es lexicográfica y ordena igual que
    // cronológicamente, así que no hace falta parsear a Date.
    return { ok: false, error: 'La fecha de cierre tiene que ser posterior a la de inicio.' }
  }
  return { ok: true, error: null }
}
