/**
 * lib/panel-marca.ts
 * El rollup del panel general de la marca: de las filas del RPC a la serie.
 *
 * ── POR QUÉ ACÁ Y NO EN LA PANTALLA ─────────────────────────────────────────
 * Las tres reglas que este panel promete —una métrica sin datos no se dibuja,
 * un mes sin datos corta la línea, y cada punto muestra su base de cálculo— son
 * decisiones, no presentación. Escritas adentro del componente no se pueden
 * probar sin montar el componente, y la única forma de verificar que un
 * porcentaje está bien calculado sería mirarlo.
 *
 * Este archivo solo importa `lib/fecha-ar` y `lib/metricas`, que tampoco
 * importan nada: lo pueden usar Server Components, Server Actions y el cliente.
 *
 * ── EL PROMEDIO SE HACE ACÁ, DIVIDIENDO ─────────────────────────────────────
 * `panel_marca_series` devuelve SUMA y CONTEO, nunca AVG. Si dos campañas del
 * mismo mes midieron precio sobre 23 y sobre 2 PDV, el promedio del mes no es
 * el promedio de los dos promedios: es la suma dividida por 25. Promediar
 * promedios le da a la campaña de 2 PDV el mismo peso que a la de 23, y el
 * número que sale no es el de ninguna de las dos.
 *
 * ── EL TOTAL NO SE RECONSTRUYE DESDE EL DESGLOSE ────────────────────────────
 * Para eso está el `GROUPING SETS` de la migración. `basePdv` es un
 * COUNT(DISTINCT comercio): un comercio visitado por dos campañas el mismo mes
 * cuenta UNA vez en el total y una vez en cada desglose, así que sumar los
 * desgloses da de más. Un mes sin su fila de total se ignora —ver
 * `armarPanel`— en vez de rearmarse mal.
 *
 * ── EL EJE ES CONTINUO, LA LÍNEA NO ─────────────────────────────────────────
 * `meses` va de punta a punta, incluidos los meses en los que no se midió nada.
 * Si el eje tuviera solo los meses con datos, abril y septiembre quedarían uno
 * al lado del otro y el hueco de cuatro meses desaparecería de la vista — que
 * es la misma mentira que interpolar, contada de otra forma.
 *
 * ── SIN Date EN NINGÚN LADO ─────────────────────────────────────────────────
 * El mes viene de SQL como `'YYYY-MM'` ya resuelto en hora argentina. Acá se
 * hace aritmética sobre año y mes como números, no `new Date()`: un
 * `'2026-03'` pasado por Date vuelve a caer en la zona del que mira, que es
 * exactamente el bug del tramo C'. La única conversión es la etiqueta, y esa
 * pasa por `formatearDia`, que fija el mediodía UTC.
 *
 * ── LÍMITE CONOCIDO ─────────────────────────────────────────────────────────
 * `meses` no tiene tope. Una marca con una campaña de 2024 y otra de hoy
 * produciría un eje de decenas de columnas. Recortar acá sería esconder datos
 * sin decirlo; la ventana la decide quien dibuja, sobre `meses`.
 */

import { formatearDia } from './fecha-ar'

// ── Lo que devuelve el RPC ───────────────────────────────────────────────────

/** Una fila de `panel_marca_series`. `campana_id` NULL = fila de TOTAL del mes. */
export interface FilaSerie {
  mes: string
  metrica_slug: string
  metrica_nombre: string
  tipo_respuesta: string
  orden: number | string
  campana_id: string | null
  campana_nombre: string | null
  fuente: string | null
  observaciones: number | string
  base_pdv: number | string
  obs_con_valor: number | string
  suma_numerica: number | string | null
  verdaderos: number | string
}

/** Una fila de `panel_marca_visitas`. */
export interface FilaVisitas {
  mes: string
  pdv_visitados: number | string
  misiones: number | string
}

/**
 * Los tipos dicen `number | string` a propósito, y no es pereza: `count(*)`
 * devuelve `bigint` y los promedios `numeric`, y los dos viajan como string por
 * varios de los caminos que llegan hasta acá. Sumar dos strings no falla: da
 * `'23' + '2' = '232'`, un número plausible y equivocado que nadie mira dos
 * veces. Todo entra por `num()` antes de tocar una operación.
 */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Lo que consume la pantalla ───────────────────────────────────────────────

/** Cómo se lee el valor de una métrica. */
export type UnidadMetrica =
  /** Binaria: el valor es el % de observaciones afirmativas. */
  | 'porcentaje'
  /** Numérica: el valor es el promedio por observación. */
  | 'promedio'
  /**
   * Una métrica que el código no conoce. No se le inventa una agregación: se
   * muestra el conteo de observaciones y nada más. Es la consecuencia
   * deliberada que documenta `lib/metricas.ts`.
   */
  | 'crudo'

export interface DesglosePunto {
  campanaId: string
  campanaNombre: string
  fuente: string
  observaciones: number
  basePdv: number
  /** El valor de ESA campaña, con la misma regla que el del punto. */
  valor: number | null
}

export interface PuntoSerie {
  /** `'YYYY-MM'`. */
  mes: string
  /** `'mar 2026'`, ya en castellano. */
  etiqueta: string
  /** `null` cuando no hay ninguna observación con valor usable. */
  valor: number | null
  observaciones: number
  /**
   * Las observaciones con un valor usable: el DENOMINADOR de `valor`.
   * Puede ser menor que `observaciones` —una visita que se hizo pero cuya
   * respuesta no servía— y es lo que permite sumar meses sin volver a la base.
   */
  conValor: number
  /** Observaciones afirmativas. Solo significa algo si la métrica es binaria. */
  verdaderos: number
  /** PDV que midieron ESTA métrica ese mes. Es el denominador real. */
  basePdv: number
  /** PDV visitados ese mes, de `panel_marca_visitas`. `null` si no se pasó. */
  pdvVisitados: number | null
  /** Las campañas que componen el punto. Vacío no debería pasar, pero no rompe. */
  desglose: DesglosePunto[]
}

export interface SerieMetrica {
  slug: string
  nombre: string
  tipoRespuesta: string
  orden: number
  unidad: UnidadMetrica
  /** Solo los meses CON observaciones. Los huecos son ausencias, no ceros. */
  puntos: PuntoSerie[]
  totalObservaciones: number
}

export interface PanelMarca {
  /** El eje, continuo de punta a punta. Vacío si no hay nada que mostrar. */
  meses: string[]
  etiquetas: string[]
  /** Solo las métricas con al menos una observación, en el orden del catálogo. */
  series: SerieMetrica[]
  /**
   * Las métricas del catálogo que NO se están midiendo. Se llena solo si se
   * pasó el catálogo; sirve para la línea al pie, que es accionable: la marca
   * puede pedir que se tipifique la pregunta.
   */
  noMedidas: { slug: string; nombre: string }[]
  /** `true` si no hay una sola observación. La pantalla muestra el vacío entero. */
  vacio: boolean
}

// ── El eje de meses ──────────────────────────────────────────────────────────

const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/

/** `'YYYY-MM'` → índice absoluto de mes. `null` si el formato no es ese. */
function indiceDeMes(mes: string): number | null {
  const m = RE_MES.exec(mes)
  if (!m) return null
  return Number(m[1]) * 12 + (Number(m[2]) - 1)
}

/** Índice absoluto → `'YYYY-MM'`. */
function mesDeIndice(i: number): string {
  const anio = Math.floor(i / 12)
  const mes  = (i % 12) + 1
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}`
}

/**
 * Todos los meses entre el primero y el último, incluidos los vacíos.
 *
 * Aritmética sobre enteros, no sobre fechas: un mes no tiene hora, y darle una
 * es lo que hace que cambie de casillero según quién mire.
 */
export function rangoDeMeses(meses: string[]): string[] {
  const indices = meses.map(indiceDeMes).filter((i): i is number => i !== null)
  if (indices.length === 0) return []
  const desde = Math.min(...indices)
  const hasta = Math.max(...indices)
  const out: string[] = []
  for (let i = desde; i <= hasta; i++) out.push(mesDeIndice(i))
  return out
}

/** `'2026-03'` → `'mar 2026'`. Pasa por formatearDia, que fija el mediodía UTC. */
export function etiquetaMes(mes: string): string {
  if (!RE_MES.test(mes)) return '—'
  return formatearDia(`${mes}-01`, { month: 'short', year: 'numeric' })
}

// ── El valor de un punto ─────────────────────────────────────────────────────

/** La unidad que le corresponde al tipo de respuesta de la métrica. */
export function unidadDe(tipoRespuesta: string): UnidadMetrica {
  if (tipoRespuesta === 'binaria') return 'porcentaje'
  if (tipoRespuesta === 'numero')  return 'promedio'
  return 'crudo'
}

/**
 * El valor de una fila, según la unidad.
 *
 * `obs_con_valor` y no `observaciones`: una observación cuyo valor vino de un
 * tipo que no correspondía cuenta como visita pero no como medición, y meterla
 * en el denominador bajaría el porcentaje sin que nadie haya respondido que no.
 */
export function valorDeFila(fila: FilaSerie): number | null {
  const conValor = num(fila.obs_con_valor)
  if (conValor <= 0) return null

  switch (unidadDe(fila.tipo_respuesta)) {
    case 'porcentaje':
      return (num(fila.verdaderos) / conValor) * 100
    case 'promedio':
      // `suma_numerica` en null con observaciones con valor no debería pasar.
      // Si pasa, es mejor no dibujar nada que dibujar un cero.
      return fila.suma_numerica === null ? null : num(fila.suma_numerica) / conValor
    case 'crudo':
      return null
  }
}

// ── La base de cálculo ───────────────────────────────────────────────────────

/**
 * La frase que acompaña a cada punto. Es el pedido central del tramo: "60% a
 * 78%" sin decir sobre cuántos PDV se calculó cada uno es mentira.
 *
 * Tres formas, según lo que el dato tenga para decir:
 *   sobre 56 PDV
 *   12 observaciones en 9 PDV            ← hubo revisitas
 *   sobre 8 de 15 PDV visitados          ← 7 visitas no midieron esta métrica
 */
export function textoBase(punto: PuntoSerie): string {
  const { observaciones, basePdv, pdvVisitados } = punto
  const hayBrecha = pdvVisitados !== null && pdvVisitados > basePdv

  const pdv = hayBrecha
    ? `${basePdv} de ${pdvVisitados} PDV visitados`
    : `${basePdv} PDV`

  if (observaciones !== basePdv) {
    return `${observaciones} observacion${observaciones === 1 ? '' : 'es'} en ${pdv}`
  }
  return `sobre ${pdv}`
}

// ── El rollup ────────────────────────────────────────────────────────────────

/**
 * De las filas de los dos RPCs a lo que dibuja la pantalla.
 *
 * `metricas` es el catálogo, opcional: sirve para poder nombrar las que NO se
 * están midiendo. Sin él, `noMedidas` queda vacío y todo lo demás funciona.
 */
export function armarPanel(params: {
  series: FilaSerie[]
  visitas?: FilaVisitas[]
  metricas?: { slug: string; nombre: string }[]
}): PanelMarca {
  const { series = [], visitas = [], metricas = [] } = params

  const visitasPorMes = new Map<string, number>()
  for (const v of visitas) visitasPorMes.set(v.mes, num(v.pdv_visitados))

  // Las filas de TOTAL son las que mandan. Las de desglose solo decoran el
  // punto: no se usan para reconstruir nada. Ver el encabezado.
  const totales   = series.filter(f => f.campana_id === null)
  const desgloses = series.filter(f => f.campana_id !== null)

  const desglosePorPunto = new Map<string, DesglosePunto[]>()
  for (const d of desgloses) {
    const clave = `${d.mes}|${d.metrica_slug}`
    const lista = desglosePorPunto.get(clave) ?? []
    lista.push({
      campanaId:     d.campana_id!,
      campanaNombre: d.campana_nombre ?? 'Campaña',
      fuente:        d.fuente ?? 'respuestas',
      observaciones: num(d.observaciones),
      basePdv:       num(d.base_pdv),
      valor:         valorDeFila(d),
    })
    desglosePorPunto.set(clave, lista)
  }

  // ── Regla 1: una métrica sin observaciones no existe ───────────────────────
  // No se crea una serie vacía que después haya que acordarse de no dibujar:
  // directamente no entra. El que consume no puede equivocarse.
  const porMetrica = new Map<string, SerieMetrica>()

  for (const t of totales) {
    const observaciones = num(t.observaciones)
    if (observaciones <= 0) continue

    let serie = porMetrica.get(t.metrica_slug)
    if (!serie) {
      serie = {
        slug:               t.metrica_slug,
        nombre:             t.metrica_nombre,
        tipoRespuesta:      t.tipo_respuesta,
        orden:              num(t.orden),
        unidad:             unidadDe(t.tipo_respuesta),
        puntos:             [],
        totalObservaciones: 0,
      }
      porMetrica.set(t.metrica_slug, serie)
    }

    // ── Regla 2: el mes sin datos no produce un punto ────────────────────────
    // Solo se empujan los meses que existen en las filas. Los que faltan son
    // huecos: quien dibuja los saltea, y el eje continuo los deja a la vista.
    serie.puntos.push({
      mes:           t.mes,
      etiqueta:      etiquetaMes(t.mes),
      valor:         valorDeFila(t),
      observaciones,
      conValor:      num(t.obs_con_valor),
      verdaderos:    num(t.verdaderos),
      basePdv:       num(t.base_pdv),
      pdvVisitados:  visitasPorMes.get(t.mes) ?? null,
      desglose:      (desglosePorPunto.get(`${t.mes}|${t.metrica_slug}`) ?? [])
                       .sort((a, b) => b.observaciones - a.observaciones),
    })
    serie.totalObservaciones += observaciones
  }

  const seriesArmadas = [...porMetrica.values()]
    .map(s => ({ ...s, puntos: s.puntos.sort((a, b) => a.mes.localeCompare(b.mes)) }))
    .sort((a, b) => a.orden - b.orden || a.slug.localeCompare(b.slug))

  const medidas = new Set(seriesArmadas.map(s => s.slug))
  const noMedidas = metricas
    .filter(m => !medidas.has(m.slug))
    .map(m => ({ slug: m.slug, nombre: m.nombre }))

  // El eje se arma con los meses de las series Y los de las visitas: un mes en
  // el que se visitaron 15 PDV y no se midió ninguna métrica es parte de la
  // historia, y dejarlo afuera acercaría los dos puntos que lo rodean.
  const meses = rangoDeMeses([
    ...seriesArmadas.flatMap(s => s.puntos.map(p => p.mes)),
    ...visitas.map(v => v.mes),
  ])

  return {
    meses,
    etiquetas: meses.map(etiquetaMes),
    series: seriesArmadas,
    noMedidas,
    vacio: seriesArmadas.length === 0,
  }
}

// ── El número de arriba de todo ──────────────────────────────────────────────

/** La lectura de una métrica sumando todos sus meses. */
export interface ResumenMetrica {
  slug: string
  nombre: string
  unidad: UnidadMetrica
  /** `null` si no hay ninguna observación con valor usable. */
  valor: number | null
  /** Observaciones afirmativas. Solo para binarias. */
  verdaderos: number
  /** El denominador de `valor`: observaciones con valor usable. */
  conValor: number
  observaciones: number
  /** Primer y último mes CON datos. Sirve para decir de qué período habla. */
  desde: string
  hasta: string
  /** Cuántos meses tienen medición. `1` significa que no hay evolución que ver. */
  mesesConDatos: number
}

/**
 * Suma los meses de una serie en un solo número.
 *
 * ── LO QUE SE PUEDE SUMAR Y LO QUE NO ───────────────────────────────────────
 * `observaciones`, `conValor` y `verdaderos` sí: una observación es una misión,
 * y una misión cae en un mes y en uno solo, así que no hay nada que se cuente
 * dos veces.
 *
 * `basePdv` NO, y por eso no está acá. Es un COUNT(DISTINCT comercio): un
 * comercio relevado en marzo y en septiembre es UN PDV, y sumar los meses lo
 * contaría dos veces. El único que sabe el distinto global es Postgres, y este
 * resumen no lo pide — el denominador honesto de un porcentaje son las
 * observaciones, no los PDV, y los PDV ya tienen su propia tarjeta.
 *
 * El promedio se repondera por `conValor`: promediar los promedios mensuales le
 * daría a un mes de 2 mediciones el mismo peso que a uno de 56.
 */
export function resumenDe(serie: SerieMetrica | undefined | null): ResumenMetrica | null {
  if (!serie || serie.puntos.length === 0) return null

  let observaciones = 0, conValor = 0, verdaderos = 0, sumaPonderada = 0
  for (const p of serie.puntos) {
    observaciones += p.observaciones
    conValor      += p.conValor
    verdaderos    += p.verdaderos
    if (p.valor !== null) sumaPonderada += p.valor * p.conValor
  }

  const valor =
    conValor <= 0                  ? null :
    serie.unidad === 'porcentaje'  ? (verdaderos / conValor) * 100 :
    serie.unidad === 'promedio'    ? sumaPonderada / conValor :
    /* crudo */                      null

  return {
    slug: serie.slug,
    nombre: serie.nombre,
    unidad: serie.unidad,
    valor,
    verdaderos,
    conValor,
    observaciones,
    desde: serie.puntos[0].mes,
    hasta: serie.puntos[serie.puntos.length - 1].mes,
    mesesConDatos: serie.puntos.length,
  }
}

/** El período que cubre un resumen, en palabras: `'mar 2026'` o `'mar – sep 2026'`. */
export function textoPeriodo(r: ResumenMetrica): string {
  if (r.desde === r.hasta) return etiquetaMes(r.desde)
  const a = etiquetaMes(r.desde), b = etiquetaMes(r.hasta)
  // Mismo año: no hace falta repetirlo. 'mar – sep 2026'.
  const anioA = r.desde.slice(0, 4), anioB = r.hasta.slice(0, 4)
  return anioA === anioB ? `${a.replace(` ${anioA}`, '')} – ${b}` : `${a} – ${b}`
}

// ── Ayudas de presentación ───────────────────────────────────────────────────

/** El valor de un punto, ya formateado según su unidad. `'—'` si no hay. */
export function formatearValor(valor: number | null, unidad: UnidadMetrica): string {
  if (valor === null) return '—'
  switch (unidad) {
    case 'porcentaje':
      return `${Math.round(valor)}%`
    case 'promedio':
      // Sin decimales cuando son grandes —un precio de $3.779,13 no dice más
      // que $3.779— y con uno cuando son chicos, porque 3,3 frentes y 3 frentes
      // no son lo mismo.
      return valor >= 100
        ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(valor)
        : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(valor)
    case 'crudo':
      return '—'
  }
}

/**
 * Los tramos de línea que se pueden dibujar sin inventar nada.
 *
 * Devuelve índices sobre `meses` —el eje continuo—, agrupados en rachas de
 * meses consecutivos CON valor. Un mes sin medición abre un tramo nuevo.
 *
 * ── POR QUÉ ESTO NO ES PRESENTACIÓN ─────────────────────────────────────────
 * Es la regla de "el mes sin datos corta la línea", que es una decisión del
 * tramo y no un detalle de dibujo. Escrita adentro del componente, la única
 * forma de verificar que un hueco no se cruza sería mirar el gráfico — y una
 * línea recta entre abril y septiembre se ve perfectamente normal: dibuja cinco
 * mediciones que nadie hizo y nada delata que son inventadas.
 *
 * Un tramo de un solo punto es válido y se devuelve igual: el que dibuja sabrá
 * que ahí va un círculo y no una línea.
 *
 * Un punto con `valor: null` —una métrica que el código no sabe agregar, o un
 * mes cuyas observaciones no trajeron ningún valor usable— NO es dibujable y
 * corta igual que un mes ausente. Tiene observaciones, pero no tiene altura.
 */
export function tramosContinuos(serie: SerieMetrica, meses: string[]): number[][] {
  const conValor = new Set(
    serie.puntos.filter(p => p.valor !== null).map(p => p.mes)
  )
  const tramos: number[][] = []
  let actual: number[] = []
  meses.forEach((mes, i) => {
    if (conValor.has(mes)) {
      actual.push(i)
    } else if (actual.length > 0) {
      tramos.push(actual)
      actual = []
    }
  })
  if (actual.length > 0) tramos.push(actual)
  return tramos
}

/**
 * Los meses de una serie que quedaron vacíos DENTRO de su propio tramo.
 *
 * Sirve para explicar el corte en palabras: "sin mediciones entre mayo y
 * agosto". No incluye los meses anteriores al primer punto ni posteriores al
 * último: esos no son un corte, es que la serie todavía no empezó o ya terminó.
 */
export function huecosDe(serie: SerieMetrica, meses: string[]): string[] {
  if (serie.puntos.length < 2) return []
  const conDatos = new Set(serie.puntos.map(p => p.mes))
  const primero = serie.puntos[0].mes
  const ultimo  = serie.puntos[serie.puntos.length - 1].mes
  return meses.filter(m => m > primero && m < ultimo && !conDatos.has(m))
}
