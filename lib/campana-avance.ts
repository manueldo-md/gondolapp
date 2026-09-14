/**
 * lib/campana-avance.ts
 * El estado de avance del relevamiento, derivado.
 *
 * DERIVADO, NO GUARDADO. Es una función pura de cuatro valores que ya existen
 * —PDV aprobados, mínimo, tope y estado de la campaña— así que no hay fuente de
 * verdad nueva que mantener. Guardarlo obligaría a escribir en cinco lugares
 * (crear misión, descartarla, retirar foto, cerrar campaña, y editar el mínimo,
 * que además tendría que recalcular todas las campañas afectadas).
 *
 * El precedente está en esta misma tabla: `comercios_relevados` es un estado
 * derivado que se guardó, se desincronizó, y tuvo una alerta rota durante meses
 * sin que nadie lo notara. Si alguna vez hace falta consultarlo —"dame las
 * campañas que cerraron sin alcanzar el mínimo"— va una vista SQL, nunca una
 * columna.
 *
 * NO CONFUNDIR con `campanas.estado` (borrador, activa, pausada, cerrada…), que
 * es el estado administrativo y no se toca. Este es el del relevamiento.
 */

export type EstadoAvance = 'en_desarrollo' | 'parcial' | 'completa' | 'incompleta'

export interface Avance {
  /** `null` cuando la campaña no tiene mínimo cargado: no hay nada que derivar. */
  estado: EstadoAvance | null
  pdv: number
  minimo: number | null
  tope: number | null
  /** Denominador de la barra: el tope, o el mínimo si no hay tope. */
  denominador: number | null
  /** Posición de la marca del mínimo sobre la barra, 0-100. `null` si no va. */
  marcaMinimoPct: number | null
  /** Porcentaje de llenado, 0-100. `null` cuando no corresponde dibujar barra. */
  porcentaje: number | null
  minimoAlcanzado: boolean
}

export const AVANCE_LABEL: Record<EstadoAvance, string> = {
  en_desarrollo: 'En desarrollo',
  parcial:       'Parcial',
  completa:      'Completa',
  incompleta:    'Incompleta',
}

export const AVANCE_COLOR: Record<EstadoAvance, string> = {
  en_desarrollo: 'bg-amber-50 text-amber-700 border-amber-200',
  parcial:       'bg-blue-50 text-blue-700 border-blue-200',
  completa:      'bg-green-50 text-green-700 border-green-200',
  incompleta:    'bg-gray-100 text-gray-600 border-gray-200',
}

const CERRADAS = ['cerrada', 'cancelada']

export function derivarAvance(params: {
  /** PDV con al menos una misión APROBADA. La representatividad se mide sobre lo validado. */
  pdvAprobados: number
  minimo: number | null | undefined
  tope: number | null | undefined
  /** `campanas.estado` — el administrativo. */
  estadoCampana: string | null | undefined
}): Avance {
  const pdv    = params.pdvAprobados
  const minimo = params.minimo ?? null
  const tope   = params.tope ?? null
  const cerrada = CERRADAS.includes(params.estadoCampana ?? '')

  const minimoAlcanzado = minimo !== null && pdv >= minimo

  // Sin mínimo no hay estado de avance: no se inventa uno. Las 19 campañas
  // anteriores al cambio caen acá y no muestran badge.
  let estado: EstadoAvance | null = null
  if (minimo !== null) {
    if (cerrada) {
      // Una campaña cerrada ya no puede crecer, así que no tiene sentido que
      // quede "parcial": o cumplió el piso o no lo cumplió.
      estado = minimoAlcanzado ? 'completa' : 'incompleta'
    } else if (tope !== null && pdv >= tope) {
      estado = 'completa'
    } else if (minimoAlcanzado) {
      estado = 'parcial'
    } else {
      estado = 'en_desarrollo'
    }
  }

  // El denominador es el TOPE, no el mínimo. El mínimo es un piso que se supera,
  // y usarlo de denominador da fracciones como "56 de 40" — un 140% dibujado
  // como 100%. Con tope, el mínimo pasa a ser una marca sobre la barra.
  let denominador: number | null = null
  let porcentaje: number | null = null
  let marcaMinimoPct: number | null = null

  if (tope !== null && tope > 0) {
    denominador = tope
    porcentaje = Math.min(100, Math.round((pdv / tope) * 100))
    if (minimo !== null && minimo > 0 && minimo < tope) {
      marcaMinimoPct = Math.round((minimo / tope) * 100)
    }
  } else if (minimo !== null && minimo > 0 && !minimoAlcanzado) {
    // Sin tope, mientras no se alcance el mínimo, él es la única referencia.
    denominador = minimo
    porcentaje = Math.min(100, Math.round((pdv / minimo) * 100))
  }
  // Sin tope y por encima del mínimo no queda contra qué medir: no se dibuja
  // barra. El absoluto con el visto del mínimo es más honesto que un 100% falso.

  return { estado, pdv, minimo, tope, denominador, marcaMinimoPct, porcentaje, minimoAlcanzado }
}
