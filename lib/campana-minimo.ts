/**
 * lib/campana-minimo.ts
 * La regla del mínimo de comercios, en un solo lugar.
 *
 * Los tres editores de campaña están duplicados (ver CLAUDE.md, "Deuda conocida
 * — formularios de campaña duplicados"), y las tres server actions también. Sin
 * esto la misma validación se escribiría seis veces y divergiría a la primera
 * corrección, que es exactamente lo que nos viene mordiendo.
 *
 * QUÉ ES minimo_comercios: el piso de PDV para que el relevamiento sea
 * representativo. Por debajo, los resultados no se le muestran a una marca como
 * conclusión. No confundir con `min_comercios_para_cobrar` (misiones que un
 * gondolero completa para cobrar) ni con `tope_total_comercios` (techo que
 * cierra la campaña sola).
 */

export interface MinimoValidacion {
  ok: boolean
  /** Mensaje para mostrar. `null` cuando ok. */
  error: string | null
}

/**
 * Valida el mínimo contra el tope.
 *
 * El mínimo es obligatorio; el tope sigue siendo opcional. Un mínimo mayor que
 * el tope define una campaña imposible: se cerraría sola al llegar al tope sin
 * haber alcanzado nunca el piso de representatividad.
 */
export function validarMinimoComercios(
  minimoRaw: string | number | null | undefined,
  topeRaw: string | number | null | undefined
): MinimoValidacion {
  const minimo = typeof minimoRaw === 'number' ? minimoRaw : parseInt(String(minimoRaw ?? ''), 10)
  const tope   = typeof topeRaw === 'number'   ? topeRaw   : parseInt(String(topeRaw ?? ''), 10)

  if (!Number.isFinite(minimo)) {
    return { ok: false, error: 'Indicá el mínimo de comercios para que el relevamiento sea representativo.' }
  }
  if (minimo < 1) {
    return { ok: false, error: 'El mínimo tiene que ser al menos 1 comercio.' }
  }
  if (Number.isFinite(tope) && minimo > tope) {
    return {
      ok: false,
      error: `El mínimo (${minimo}) no puede superar el tope (${tope}): la campaña se cerraría antes de ser representativa.`,
    }
  }
  return { ok: true, error: null }
}
