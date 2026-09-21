/**
 * lib/fecha-ar.ts
 * El día y la semana en hora argentina, en un solo lugar.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * El servidor corre en **UTC** —verificado: `SHOW TimeZone` devuelve UTC— y
 * Argentina es UTC−3. O sea que entre las 21:00 y la medianoche hora de acá, el
 * servidor **ya está en el día siguiente**.
 *
 * Eso no falla ni tira error: contesta distinto según la hora a la que se mire.
 * Una campaña con `fecha_fin = 30` deja de aceptar misiones a las 21:00 del 29
 * hora argentina, y el gondolero que releva a las 22:00 del 29 ve su trabajo
 * rechazado por vencimiento un día antes de lo que dice la campaña. Eso es
 * plata que no cobra por trabajo hecho en plazo.
 *
 * ── POR QUÉ UNA CONSTANTE Y NO UNA ZONA POR CAMPAÑA ─────────────────────────
 * Argentina **no tiene horario de verano** desde 2009: es UTC−3 fijo, todo el
 * año, en todo el país. Guardar la zona por campaña sería modelar una variación
 * que no existe. Si algún día hay clientes en otro país, se revisa — y este
 * archivo es el único lugar donde tocar.
 *
 * ── POR QUÉ `Intl` Y NO RESTAR TRES HORAS ───────────────────────────────────
 * Restar 3 horas a mano funcionaría hoy y quedaría **silenciosamente mal** el
 * día que Argentina reinstaure el horario de verano —ya pasó en 2007— sin que
 * nada falle ni ningún test se ponga rojo. `Intl` lee la base de zonas del
 * runtime, así que un cambio de reglas se absorbe solo.
 *
 * Este archivo **no importa nada**: lo pueden usar el servidor y el cliente.
 */

/** La única zona del sistema. Ver el encabezado antes de agregar una segunda. */
export const ZONA_AR = 'America/Argentina/Buenos_Aires'

/** Lunes = 1 … domingo = 7. El lunes es 1 porque la semana operativa arranca ahí. */
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone:  ZONA_AR,
  year:     'numeric',
  month:    '2-digit',
  day:      '2-digit',
  hour:     '2-digit',
  minute:   '2-digit',
  second:   '2-digit',
  // h23 y no hour12:false: con hour12 algunos runtimes devuelven '24' para la
  // medianoche, y '24:00' rompe cualquier aritmética que se haga después.
  hourCycle: 'h23',
})

interface PartesAR {
  year: number; month: number; day: number
  hour: number; minute: number; second: number
}

function partes(instante: Date): PartesAR {
  const p = Object.fromEntries(
    FORMATO.formatToParts(instante)
      .filter(x => x.type !== 'literal')
      .map(x => [x.type, x.value]),
  ) as Record<string, string>
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, second: +p.second,
  }
}

function aDate(valor: Date | string | number): Date {
  return valor instanceof Date ? valor : new Date(valor)
}

/**
 * El desfasaje de Argentina respecto de UTC, en minutos, PARA ESE INSTANTE.
 *
 * Hoy siempre −180. Se calcula en vez de constantizarse para que el día que
 * cambien las reglas no haya que acordarse de este archivo.
 */
function offsetMinutos(instante: Date): number {
  const p = partes(instante)
  const comoSiFueraUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // El milisegundo se pierde en el formateo; se recupera para no correr el
  // resultado por menos de un segundo.
  const sinMilis = Math.floor(instante.getTime() / 1000) * 1000
  return (comoSiFueraUTC - sinMilis) / 60000
}

/** El día calendario argentino de un instante, como `'YYYY-MM-DD'`. */
export function diaAR(instante: Date | string | number = new Date()): string {
  const p = partes(aDate(instante))
  const dd = String(p.day).padStart(2, '0')
  const mm = String(p.month).padStart(2, '0')
  return `${p.year}-${mm}-${dd}`
}

/** El instante UTC de la medianoche argentina de un día `'YYYY-MM-DD'`. */
export function medianocheAR(dia: string): Date {
  // Se parte de la medianoche UTC de ese día y se corrige por el offset que
  // rige EN ESE MOMENTO, no por uno fijo.
  const tentativo = new Date(`${dia}T00:00:00.000Z`)
  return new Date(tentativo.getTime() - offsetMinutos(tentativo) * 60000)
}

/** Lunes = 1 … domingo = 7, en hora argentina. */
export function diaDeLaSemanaAR(instante: Date | string | number = new Date()): DiaSemana {
  // getUTCDay() sobre la medianoche AR del día: 0 = domingo.
  const d = medianocheAR(diaAR(instante))
  const dow = new Date(d.getTime() + 12 * 3600_000).getUTCDay()
  return (dow === 0 ? 7 : dow) as DiaSemana
}

/** Suma días a un `'YYYY-MM-DD'` y devuelve otro `'YYYY-MM-DD'`. */
export function sumarDias(dia: string, dias: number): string {
  // Se hace sobre el mediodía para no caer nunca en un salto de hora.
  const base = new Date(`${dia}T12:00:00.000Z`)
  return diaAR(new Date(base.getTime() + dias * 86400_000 - offsetMinutos(base) * 60000))
}

export interface SemanaAR {
  /** Lunes, `'YYYY-MM-DD'`. */
  lunes: string
  /** Domingo, `'YYYY-MM-DD'`. */
  domingo: string
  /** Instante UTC de la medianoche del lunes. Para filtrar con `>=`. */
  desde: Date
  /** Instante UTC de la medianoche del lunes SIGUIENTE. Para filtrar con `<`. */
  hasta: Date
}

/**
 * La semana argentina de lunes a domingo que contiene el instante.
 *
 * `desde` y `hasta` son un rango semiabierto `[desde, hasta)` a propósito: con
 * `<=` sobre el domingo a medianoche, una misión capturada el domingo a las
 * 23:59:30 quedaría afuera de las dos semanas.
 */
export function semanaDe(instante: Date | string | number = new Date()): SemanaAR {
  const hoy    = diaAR(instante)
  const lunes  = sumarDias(hoy, -(diaDeLaSemanaAR(instante) - 1))
  const domingo = sumarDias(lunes, 6)
  return {
    lunes,
    domingo,
    desde: medianocheAR(lunes),
    hasta: medianocheAR(sumarDias(lunes, 7)),
  }
}

/**
 * Cuántos días COMPLETOS de la semana pasaron: 0 el lunes, 6 el domingo.
 *
 * El día en curso **no cuenta**, y de ahí sale que un lunes a las 8 de la
 * mañana lo esperado sea cero. Ver `visitasEsperadas`.
 */
export function diasCompletosDeLaSemana(instante: Date | string | number = new Date()): number {
  return diaDeLaSemanaAR(instante) - 1
}

/**
 * Cuántas visitas se esperan a esta altura de la semana.
 *
 * ── LA FÓRMULA, Y POR QUÉ ESTA ──────────────────────────────────────────────
 *     floor(frecuencia × días_COMPLETOS / 7)
 *
 * Con frecuencia 2 da `0 0 0 0 1 1 1` de lunes a domingo, y la semana cierra en
 * 2. La alternativa evaluada —`ceil` contando el día en curso— daba 1 el lunes:
 * o sea que **el lunes a las 8 de la mañana, con cero visitas, el comercio ya
 * figuraba atrasado**, que es exactamente lo que el prorrateo venía a evitar. Y
 * daba 2 el jueves, marcando atrasado a quien hizo una el martes y planeaba la
 * otra el viernes.
 *
 * Se porta bien en los extremos:
 *
 *   frecuencia 1 → 0 toda la semana. Correcto: con una visita semanal cualquier
 *                  día sirve, y nadie está atrasado hasta que la semana cierre.
 *   frecuencia 5 → 0 0 1 2 2 3 4
 *
 * La semana EN CURSO nunca llega a exigir la meta completa: la alcanza recién
 * cuando cierra. Es deliberado — el veredicto es la semana cerrada, la actual
 * es provisoria y la barra tiene que decirlo.
 *
 * `desde` acota los días completos cuando la campaña arrancó a mitad de semana:
 * a nadie se le puede pedir cobertura de días en los que la campaña no existía.
 */
export function visitasEsperadas(params: {
  visitasPorSemana: number
  /** Instante de referencia. Por defecto, ahora. */
  ahora?: Date | string | number
  /** `fecha_inicio` de la campaña, `'YYYY-MM-DD'`. Opcional. */
  desde?: string | null
}): number {
  const { visitasPorSemana, ahora = new Date(), desde } = params
  if (!visitasPorSemana || visitasPorSemana <= 0) return 0

  let completos = diasCompletosDeLaSemana(ahora)

  if (desde) {
    const { lunes } = semanaDe(ahora)
    if (desde > lunes) {
      // La campaña arrancó a mitad de esta semana: solo cuentan los días
      // completos desde que arrancó.
      const diaDeInicio = diaDeLaSemanaAR(medianocheAR(desde)) - 1
      completos = Math.max(0, completos - diaDeInicio)
    }
  }

  return Math.floor((visitasPorSemana * completos) / 7)
}
