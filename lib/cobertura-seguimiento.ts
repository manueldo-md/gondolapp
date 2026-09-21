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
  /**
   * Qué comercios MOSTRAR. Sin esto son todos los de la campaña.
   *
   * ── POR QUÉ ES UN PARÁMETRO Y NO UN FILTRO DE `misiones` ────────────────
   * El gondolero necesita ver SUS comercios, pero contando TODAS las visitas
   * que recibieron — incluidas las de otros. La frecuencia es del COMERCIO, no
   * de la persona: si Juan lo visitó el lunes y Pedro el martes, con frecuencia
   * 2 el comercio está cubierto y ninguno de los dos tiene que volver.
   *
   * Filtrar el array de misiones por gondolero daría el universo correcto y el
   * **conteo equivocado**: el comercio diría "1 de 2" y mandaría a Juan a hacer
   * una visita que no hace falta. La distribuidora terminaría pagando cuatro
   * visitas por una cobertura de dos.
   *
   * Por eso se separa QUÉ SE MUESTRA de QUÉ SE CUENTA, y por eso va acá y no en
   * una segunda función: el día que cambie qué cuenta como visita, el gondolero
   * y la distri seguirían viendo el mismo número sobre el mismo comercio.
   */
  universo?: Set<string> | string[]
}): CoberturaSemanal {
  const { misiones, nombresComercio, visitasPorSemana, fechaInicio, ahora = new Date() } = params
  const universo = params.universo
    ? (params.universo instanceof Set ? params.universo : new Set(params.universo))
    : null

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
  // El universo acota QUÉ comercios salen; las visitas que se cuentan sobre
  // ellos son TODAS, vengan del gondolero que vengan.
  const visitasPorComercio = new Map<string, VisitaMision[]>()
  for (const m of misiones) {
    if (!m.comercio_id || !esVisita(m)) continue
    if (universo && !universo.has(m.comercio_id)) continue
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

// ── Lo que ve el GONDOLERO ───────────────────────────────────────────────────

/** Días que faltan para que cierre la semana, contando hoy. Domingo = 1. */
export function diasQueQuedan(instante: Date | string | number = new Date()): number {
  return 8 - diaDeLaSemanaAR(instante)
}

/**
 * La frase de la cabecera del gondolero.
 *
 * ── POR QUÉ NO DICE "CUBRISTE TUS COMERCIOS" ────────────────────────────────
 * Sería falso si parte de esas visitas las hizo otro. Los comercios están
 * cubiertos; no necesariamente los cubrió él. Atribuirle trabajo ajeno es tan
 * mentira como no reconocerle el propio, y acá además le haría creer que su
 * aporte fue mayor.
 *
 * ── POR QUÉ "N VISITAS" Y NO "N" ────────────────────────────────────────────
 * Toda la pantalla habla de comercios —el cupo, el mínimo para cobrar, la lista
 * de abajo— así que un número suelto se lee como comercios. "Te faltan 7" sobre
 * 5 comercios es una frase que no cierra y que el gondolero va a interpretar mal
 * en la dirección que más le cuesta.
 *
 * ── Y EL PLAZO VA PEGADO AL FALTANTE ────────────────────────────────────────
 * "Te faltan 7 visitas" sin plazo es una cifra que asusta sin informar. Con los
 * días que quedan es una decisión: sabe si le alcanza el viernes o tiene que
 * salir hoy.
 */
export function fraseSemanaGondolero(
  c: CoberturaSemanal,
  ahora: Date | string | number = new Date(),
): string {
  const base = `Esta semana: ${c.visitasHechas} de ${c.metaSemana} visitas.`

  if (c.comercios.length === 0) return base
  if (c.visitasHechas >= c.metaSemana) {
    // "tus comercios ESTÁN cubiertos", no "vos los cubriste".
    return `${base} Tus comercios están cubiertos esta semana.`
  }
  if (c.esperadasHoy === 0) return `${base} Recién empieza.`
  if (c.visitasHechas >= c.esperadasHoy) return `${base} Vas al día.`

  const faltan = c.metaSemana - c.visitasHechas
  const dias   = diasQueQuedan(ahora)
  return `${base} Te faltan ${faltan} ${faltan === 1 ? 'visita' : 'visitas'} y ` +
         `${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}.`
}

/** El estado de un comercio para el gondolero, en su lista de captura. */
export interface ComercioSemana {
  /** Visitas que recibió el comercio esta semana, de CUALQUIER gondolero. */
  visitas: number
  /** Ya cumplió la frecuencia de la semana. */
  cubierto: boolean
  /** Alguna de esas visitas no la hizo él. */
  hayDeOtro: boolean
  /** Él no visitó este comercio esta semana. */
  ningunaSuya: boolean
}

/**
 * Cuántas visitas lleva cada comercio ESTA semana, para la lista de captura.
 *
 * `hayDeOtro` existe para poder decirle *"lo visitó otro gondolero"*. Sin esa
 * frase, un comercio que aparece cubierto sin que él lo haya tocado se lee como
 * que el sistema le perdió la visita. **Sin nombrar a nadie**: el alias de otro
 * gondolero solo se muestra en el ranking de Logros, y abrir esa superficie acá
 * por un dato que no hace falta no se justifica.
 */
export function coberturaPorComercio(params: {
  /** TODAS las misiones de la campaña. */
  misiones: VisitaMision[]
  gondoleroId: string
  visitasPorSemana: number
  ahora?: Date
}): Map<string, ComercioSemana> {
  const { misiones, gondoleroId, visitasPorSemana, ahora = new Date() } = params
  const semana = semanaDe(ahora)
  const out = new Map<string, ComercioSemana>()

  for (const m of misiones) {
    if (!m.comercio_id || !esVisita(m)) continue
    const dia = diaDeLaVisita(m)
    if (!dia || dia < semana.lunes || dia > semana.domingo) continue

    const prev = out.get(m.comercio_id) ?? { visitas: 0, cubierto: false, hayDeOtro: false, ningunaSuya: true }
    prev.visitas += 1
    if (m.gondolero_id === gondoleroId) prev.ningunaSuya = false
    else                                prev.hayDeOtro   = true
    prev.cubierto = prev.visitas >= visitasPorSemana
    out.set(m.comercio_id, prev)
  }
  return out
}
