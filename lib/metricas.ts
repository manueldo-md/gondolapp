/**
 * Las métricas base, en código.
 *
 * El CATÁLOGO vive en la tabla `metricas` —para que agregar una no necesite un
 * deploy— pero los SLUGS de las cinco iniciales están acá porque el panel tiene
 * que hacer algo distinto con cada una: 'precio' se promedia, 'presencia' se
 * cuenta como porcentaje, 'frentes' se suma. Ese `switch` no puede leer filas
 * arbitrarias de una tabla.
 *
 * La consecuencia, que es deliberada: una métrica que alguien agregue a la
 * tabla y que no esté acá **se muestra como dato crudo**, sin agregación. No
 * rompe nada; simplemente no tiene lectura propia hasta que alguien la escriba.
 *
 * Ver `supabase/migrations/20260921200000_metricas_catalogo.sql`.
 */

/** Los slugs que el código conoce. La tabla puede tener más. */
export const METRICAS_BASE = [
  'presencia',
  'quiebre_stock',
  'frentes',
  'precio',
  'exhibicion_pop',
] as const

export type MetricaBase = (typeof METRICAS_BASE)[number]

/**
 * De dónde puede salir el dato de una métrica.
 *
 * Una métrica puede tener MÁS DE UNA fuente, hoy y mañana. Es lo que obligó el
 * piloto de Georgalos: 112 fotos con `fotos.declaracion` cargada y cero
 * preguntas, así que sin la segunda fuente el panel arranca sin la campaña que
 * más vale mostrar.
 *
 * - `respuestas`       — preguntas tipificadas (`bloque_campos.metrica_id`)
 * - `declaracion_foto` — `fotos.declaracion`, HISTORIA CONGELADA: `registrarMision`
 *                        no la escribe desde que las preguntas tomaron ese
 *                        trabajo (migración 20260407124015), así que lo que hay
 *                        es todo lo que va a haber
 */
export type FuenteMetrica = 'respuestas' | 'declaracion_foto'

/** Una fila del catálogo. El slug es `string` porque la tabla puede tener métricas que el código no conoce. */
export interface Metrica {
  id: string
  slug: string
  nombre: string
  descripcion: string | null
  tipo_respuesta: 'seleccion_multiple' | 'seleccion_unica' | 'binaria' | 'numero' | 'texto'
  fuentes: FuenteMetrica[]
  orden: number
  activa: boolean
}

/** True si el panel sabe leer esta métrica. Si no, se muestra cruda. */
export function esMetricaConocida(slug: string | null | undefined): slug is MetricaBase {
  return !!slug && (METRICAS_BASE as readonly string[]).includes(slug)
}

/**
 * Filtro para leer `fotos` como fuente de presencia.
 *
 * Los dos descartes no son lo mismo y los dos hacen falta:
 *
 * - **Sin `mision_id`** — es la foto de fachada del alta de un comercio, que
 *   `actions-comercios.ts` escribe con `declaracion = 'producto_presente'`
 *   FIJO. Esa foto no mira ninguna góndola: es el único uso de la columna con
 *   otro sentido. 1 fila en prod, 0 en dev al 21/9/2026.
 * - **Sin `declaracion`** — las fotos capturadas por la app hoy, que dejan la
 *   columna en NULL.
 *
 * Y `'solo_competencia'` cuenta como AUSENCIA, no se excluye: significa que el
 * producto de la campaña no está y además hay competencia. Es una observación
 * con información de más, no una visita fallida. (0 filas hoy en las dos bases;
 * no hay ningún valor para "comercio cerrado" — eso vive en el estado de la
 * misión.)
 */
export function declaracionEsObservacion(foto: {
  mision_id?: string | null
  declaracion?: string | null
}): boolean {
  return !!foto.mision_id && !!foto.declaracion
}

/** `true` = el producto estaba. Solo tiene sentido sobre una foto que pasó `declaracionEsObservacion`. */
export function presenciaSegunDeclaracion(declaracion: string): boolean {
  return declaracion === 'producto_presente'
}

// ── Elegir una métrica fija el tipo ──────────────────────────────────────────

/**
 * Las métricas que admiten respuestas de ese tipo.
 *
 * Es el mismo hecho que "la métrica fija el tipo", leído al revés. Sirve para
 * las dos superficies: el constructor filtra el tipo cuando ya se eligió la
 * métrica, y la pantalla de tipificar filtra la métrica porque el tipo de una
 * pregunta que ya existe no se toca.
 *
 * Un campo `foto` no admite ninguna: una foto no es una medición comparable, y
 * el CHECK de `metricas.tipo_respuesta` tampoco la acepta.
 */
export function metricasCompatibles(metricas: Metrica[], tipo: string): Metrica[] {
  return metricas.filter(m => m.activa && m.tipo_respuesta === tipo)
}

/**
 * Las tres reglas de cambio. Son TRES casos, no dos.
 *
 * | De | A | Con respuestas |
 * |---|---|---|
 * | sin métrica | una métrica | **permitido** |
 * | métrica A | métrica B | bloqueado |
 * | una métrica | sin métrica | bloqueado |
 *
 * La asimetría del primer caso es el punto: tipificar una pregunta que ya tiene
 * respuestas **no reinterpreta nada**. Las respuestas siempre quisieron decir lo
 * mismo; lo único que cambia es que ahora el sistema lo sabe. Es exactamente lo
 * que necesitan las cuatro preguntas que ya están en producción, y sin esa regla
 * el catálogo arrancaría sin una sola serie.
 *
 * Los otros dos sí reinterpretan: una respuesta cargada como "frentes" pasaría a
 * leerse como "precio", o saldría de una serie en la que ya figura.
 */
export type ResultadoCambioMetrica =
  | { ok: true }
  | { ok: false; motivo: string }

export function cambioDeMetricaPermitido(params: {
  actual: string | null
  nueva: string | null
  respuestas: number
}): ResultadoCambioMetrica {
  const { actual, nueva, respuestas } = params

  if (actual === nueva) return { ok: true }
  if (respuestas === 0) return { ok: true }

  // Tipificar lo que estaba sin tipificar: siempre.
  if (actual === null) return { ok: true }

  const cuantas = `${respuestas} ${respuestas === 1 ? 'respuesta' : 'respuestas'}`
  return {
    ok: false,
    motivo: nueva === null
      ? `Esta pregunta ya tiene ${cuantas}. Sacarle la métrica las dejaría fuera de una serie en la que ya figuran.`
      : `Esta pregunta ya tiene ${cuantas}. Cambiarle la métrica cambiaría qué significan.`,
  }
}
