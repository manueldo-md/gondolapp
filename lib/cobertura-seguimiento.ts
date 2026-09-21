/**
 * lib/cobertura-seguimiento.ts
 * ¿Se está cumpliendo la frecuencia que la campaña declara?
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * `campanas.visitas_por_semana` era decorativo: se mostraba en cinco pantallas
 * y **no lo medía una sola línea de código**. Una campaña de seguimiento
 * aceptaba 0 visitas o 50 en la semana y el sistema no notaba la diferencia —
 * declaraba una frecuencia que nadie verificaba. Es justamente lo que la
 * distribuidora está comprando.
 *
 * Función pura: recibe las misiones ya cargadas y no consulta nada. La zona
 * horaria y el prorrateo salen de `lib/fecha-ar.ts`.
 *
 * ── QUÉ CUENTA COMO VISITA ──────────────────────────────────────────────────
 * **Cualquier misión que no esté `'descartada'`.** Lo que se mide es si FUE, no
 * si la foto salió perfecta.
 *
 *   · `'pendiente'` cuenta. Que nadie la haya revisado todavía no significa que
 *     no haya ido. Si solo contaran las aprobadas, la cobertura de esta semana
 *     se vería siempre peor que la de la pasada y mejoraría sola cuando alguien
 *     revisara: un número que se mueve sin que nadie trabaje no sirve para
 *     gestionar.
 *   · `'descartada'` NO cuenta: es la misión que el gondolero resignó porque no
 *     podía volver al comercio. Mismo criterio que el cupo y que
 *     `comerciosTomadosPorGondolero`.
 *   · `'rechazada'` no existe como estado de misión — verificado contra las dos
 *     bases el 21/9/2026.
 *
 * El filtro va en JS y no con `.neq()`: `misiones.estado` es nullable y
 * PostgREST descartaría también las filas con NULL por lógica de tres valores.
 * Mismo motivo que en `lib/comercios-relevados.ts`.
 *
 * ── LA FECHA ES `capturada_at`, NO `created_at` ─────────────────────────────
 * `created_at` es el INSERT: para una misión de la cola offline, cuando el
 * gondolero recuperó señal. Fechar por ahí deja la semana real vacía y la
 * siguiente con dos, y marca en rojo a quien trabajó sin señal — dentro del
 * mismo reporte que la distribuidora usa para juzgarlo. Ver la migración
 * 20260921100000.
 *
 * ── LA LIMITACIÓN ASUMIDA PARA V1 ───────────────────────────────────────────
 * **No hay asignación de comercios**, así que el dashboard no puede ver a quien
 * nunca empezó. El universo son los comercios con al menos una visita EN TODA
 * la campaña — no en la semana: un comercio visitado la semana pasada y no
 * ésta tiene que aparecer en rojo, o el reporte solo mostraría a los que
 * trabajaron y daría 100% siempre.
 *
 * Eso tiene que decirse en pantalla. Un porcentaje de cobertura sobre un
 * universo que se define solo con los visitados es un número que miente sin
 * equivocarse.
 */

import {
  diaAR, semanaDe, visitasEsperadas, diaDeLaSemanaAR, medianocheAR,
  type SemanaAR,
} from './fecha-ar'

/** El estado de un comercio en la semana. */
export type EstadoCobertura =
  /** Ya cumplió las visitas de la semana entera. */
  | 'al_dia'
  /** Todavía no, pero está en lo esperado para el día que es. */
  | 'va_bien'
  /** Por debajo de lo prorrateado a esta altura de la semana. */
  | 'atrasado'

/** Lo mínimo que el cálculo necesita de una misión. */
export interface VisitaMision {
  comercio_id: string | null
  gondolero_id: string | null
  estado: string | null
  /** `misiones.capturada_at`. */
  capturada_at: string | null
  /** Solo para el fallback de las filas anteriores a la migración. */
  created_at?: string | null
}

export interface ComercioCobertura {
  comercioId: string
  nombre: string
  /** Visitas de ESTA semana. */
  visitas: number
  /** Cuántas se esperan a esta altura de la semana. */
  esperadas: number
  estado: EstadoCobertura
  /** Día argentino de la última visita, de toda la campaña. `null` es imposible
   *  por construcción —el universo son los visitados— pero se contempla. */
  ultimaVisita: string | null
  /** Días desde la última visita. 0 = hoy. */
  diasSinVisita: number | null
  /** Quiénes lo visitaron esta semana. Puede ser más de uno. */
  gondoleroIds: string[]
}

export interface CoberturaSemanal {
  semana: SemanaAR
  visitasPorSemana: number
  /** `false` cuando la semana ya cerró: ahí el veredicto es definitivo. */
  enCurso: boolean
  comercios: ComercioCobertura[]
  /** Visitas hechas esta semana, sumando todos los comercios. */
  visitasHechas: number
  /** La meta de la semana completa: comercios × frecuencia. */
  metaSemana: number
  /** Lo esperado a esta altura: comercios × prorrateo. */
  esperadasHoy: number
}

/** Una visita es cualquier misión que no se descartó. */
export function esVisita(m: { estado: string | null }): boolean {
  return m.estado !== 'descartada'
}

/** El día argentino de una misión. Cae a `created_at` solo si falta el otro. */
export function diaDeLaVisita(m: VisitaMision): string | null {
  const iso = m.capturada_at ?? m.created_at
  return iso ? diaAR(iso) : null
}

function diasEntre(diaA: string, diaB: string): number {
  return Math.round(
    (medianocheAR(diaB).getTime() - medianocheAR(diaA).getTime()) / 86400_000,
  )
}

export function calcularCobertura(params: {
  /** TODAS las misiones de la campaña, de todas las semanas. */
  misiones: VisitaMision[]
  /** comercio_id → nombre. Los que no estén salen con el id abreviado. */
  nombresComercio: Map<string, string>
  visitasPorSemana: number
  /** `campanas.fecha_inicio`, para no pedir cobertura de días sin campaña. */
  fechaInicio?: string | null
  /** Instante de referencia. Por defecto, ahora. */
  ahora?: Date
}): CoberturaSemanal {
  const { misiones, nombresComercio, visitasPorSemana, fechaInicio, ahora = new Date() } = params

  const semana = semanaDe(ahora)
  const hoy    = diaAR(ahora)

  // La semana está EN CURSO salvo que se esté mirando una ya cerrada.
  const enCurso = semana.lunes === semanaDe(new Date()).lunes

  const esperadas = visitasEsperadas({
    visitasPorSemana,
    ahora,
    desde: fechaInicio ?? undefined,
  })

  // ── El universo: los comercios con al menos una visita en la campaña ───────
  const visitasPorComercio = new Map<string, VisitaMision[]>()
  for (const m of misiones) {
    if (!m.comercio_id || !esVisita(m)) continue
    const lista = visitasPorComercio.get(m.comercio_id) ?? []
    lista.push(m)
    visitasPorComercio.set(m.comercio_id, lista)
  }

  const comercios: ComercioCobertura[] = []

  for (const [comercioId, todas] of visitasPorComercio) {
    const dias = todas
      .map(diaDeLaVisita)
      .filter((d): d is string => d !== null)

    const deLaSemana = dias.filter(d => d >= semana.lunes && d <= semana.domingo)
    const visitas    = deLaSemana.length
    const ultimaVisita = dias.length > 0 ? dias.reduce((a, b) => (a > b ? a : b)) : null

    // Al día se mide contra la META de la semana, no contra el prorrateo: haber
    // cumplido lo de hoy no es lo mismo que haber terminado la semana.
    const estado: EstadoCobertura =
      visitas >= visitasPorSemana ? 'al_dia'
      : visitas < esperadas       ? 'atrasado'
      : 'va_bien'

    const gondoleroIds = [...new Set(
      todas
        .filter(m => {
          const d = diaDeLaVisita(m)
          return d !== null && d >= semana.lunes && d <= semana.domingo
        })
        .map(m => m.gondolero_id)
        .filter((g): g is string => g !== null),
    )]

    comercios.push({
      comercioId,
      nombre: nombresComercio.get(comercioId) ?? comercioId.slice(0, 8),
      visitas,
      esperadas,
      estado,
      ultimaVisita,
      diasSinVisita: ultimaVisita ? diasEntre(ultimaVisita, hoy) : null,
      gondoleroIds,
    })
  }

  // Los atrasados primero: el dashboard existe para mostrar lo que falta, no
  // para felicitar. Dentro de cada grupo, el que hace más que no se visita.
  const PESO: Record<EstadoCobertura, number> = { atrasado: 0, va_bien: 1, al_dia: 2 }
  comercios.sort((a, b) =>
    PESO[a.estado] - PESO[b.estado]
    || (b.diasSinVisita ?? 0) - (a.diasSinVisita ?? 0)
    || a.nombre.localeCompare(b.nombre, 'es'),
  )

  return {
    semana,
    visitasPorSemana,
    enCurso,
    comercios,
    visitasHechas: comercios.reduce((s, c) => s + c.visitas, 0),
    metaSemana:    comercios.length * visitasPorSemana,
    esperadasHoy:  comercios.length * esperadas,
  }
}

/**
 * El texto del día de la semana, para "Última visita: martes".
 *
 * Se usa el nombre del día solo dentro de la semana en curso; más atrás dice
 * "hace N días", porque "martes" a dos semanas de distancia es ambiguo y suena
 * más reciente de lo que es.
 */
export function etiquetaUltimaVisita(dia: string | null, diasSinVisita: number | null): string {
  if (!dia || diasSinVisita === null) return 'nunca'
  if (diasSinVisita === 0) return 'hoy'
  if (diasSinVisita === 1) return 'ayer'
  if (diasSinVisita < 7) {
    const NOMBRES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
    return NOMBRES[diaDeLaSemanaAR(medianocheAR(dia)) - 1]
  }
  return `hace ${diasSinVisita} días`
}

// ── Tira histórica ───────────────────────────────────────────────────────────

export interface SemanaHistorica {
  /** Lunes de la semana, `'YYYY-MM-DD'`. */
  lunes: string
  visitas: number
  /** ¿Llegó a la frecuencia declarada? Solo para semanas CERRADAS. */
  cumplio: boolean
  /** La semana en curso: su número todavía puede subir. */
  enCurso: boolean
  /** La campaña todavía no existía esa semana. */
  antesDeEmpezar: boolean
}

export interface HistoricoComercio {
  comercioId: string
  nombre: string
  semanas: SemanaHistorica[]
}

/**
 * Las últimas N semanas por comercio, para ver el PATRÓN.
 *
 * Un número de la semana no muestra lo que de verdad importa: *"se cubrió bien
 * en marzo y se abandonó en abril"*. Eso es inteligencia sobre la operación, y
 * es lo que una distribuidora mira para decidir si renueva.
 *
 * No cuesta consultas: son las mismas misiones ya cargadas, agrupadas por
 * semana. El cálculo es el mismo `esVisita` + `diaDeLaVisita` que la semana en
 * curso, así que los dos números no pueden discrepar.
 *
 * `enCurso` y `antesDeEmpezar` van separados de `cumplio` a propósito: una
 * semana en curso con 1 de 2 **no incumplió**, todavía le quedan días; y una
 * anterior al arranque de la campaña no es un incumplimiento, es un vacío. Si
 * las tres se pintaran igual, la tira mostraría rojo donde no hubo falla.
 */
export function calcularHistorico(params: {
  misiones: VisitaMision[]
  nombresComercio: Map<string, string>
  visitasPorSemana: number
  fechaInicio?: string | null
  /** Cuántas semanas mostrar, contando la actual. */
  semanas?: number
  ahora?: Date
}): HistoricoComercio[] {
  const {
    misiones, nombresComercio, visitasPorSemana,
    fechaInicio, semanas = 8, ahora = new Date(),
  } = params

  const actual = semanaDe(ahora)
  // De la más vieja a la más nueva: la tira se lee de izquierda a derecha.
  const lunesDeCada: string[] = []
  for (let i = semanas - 1; i >= 0; i--) {
    lunesDeCada.push(diaAR(new Date(actual.desde.getTime() - i * 7 * 86400_000)))
  }

  const porComercio = new Map<string, Map<string, number>>()
  const universo = new Set<string>()

  for (const m of misiones) {
    if (!m.comercio_id || !esVisita(m)) continue
    universo.add(m.comercio_id)
    const dia = diaDeLaVisita(m)
    if (!dia) continue
    const lunes = semanaDe(medianocheAR(dia)).lunes
    const porSemana = porComercio.get(m.comercio_id) ?? new Map<string, number>()
    porSemana.set(lunes, (porSemana.get(lunes) ?? 0) + 1)
    porComercio.set(m.comercio_id, porSemana)
  }

  // El lunes de la semana en que arrancó la campaña: antes de eso no hubo falla.
  const lunesInicio = fechaInicio ? semanaDe(medianocheAR(fechaInicio)).lunes : null

  return [...universo].map(comercioId => {
    const porSemana = porComercio.get(comercioId) ?? new Map<string, number>()
    return {
      comercioId,
      nombre: nombresComercio.get(comercioId) ?? comercioId.slice(0, 8),
      semanas: lunesDeCada.map(lunes => {
        const visitas = porSemana.get(lunes) ?? 0
        const enCurso = lunes === actual.lunes
        const antesDeEmpezar = lunesInicio !== null && lunes < lunesInicio
        return {
          lunes,
          visitas,
          enCurso,
          antesDeEmpezar,
          cumplio: !enCurso && !antesDeEmpezar && visitas >= visitasPorSemana,
        }
      }),
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
