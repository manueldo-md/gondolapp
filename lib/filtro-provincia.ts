/**
 * lib/filtro-provincia.ts — el filtro de provincia de los paneles y el mapa,
 * y los dos números del KPI.
 *
 * Sin import de Next: la decisión entera se prueba sin request.
 * Ver `scripts/probar-filtro-provincia.ts`.
 *
 * ── LA SELECCIÓN VIAJA EN LA URL, SEPARADA POR COMAS ────────────────────────
 * `?prov=2,6`. Es así y no `?prov=2&prov=6` por una razón que no es estética:
 *
 * **`hrefMapa` borra la clave cuando el valor es `''`.** Con un solo string,
 * deseleccionar todo produce `''`, la clave desaparece de la URL y la ausencia
 * significa "todas" — que es la regla que se decidió. O sea que el invariante
 * *"no existe forma de escribir «ninguna»"* **sale del código que ya hay**, en
 * vez de depender de que cada llamador se acuerde de no escribir una lista
 * vacía. Con claves repetidas habría que cambiar la firma de `hrefMapa` a
 * `string | string[]` y cada lector de Next pasaría a recibir una unión que
 * alguien va a olvidar de manejar.
 *
 * Y se comparte como se comparte "Mesopotamia": copiando la URL.
 *
 * ── LA SELECCIÓN SE NORMALIZA, PARA QUE LA URL SEA CANÓNICA ─────────────────
 * Ordenada y sin repetidos. Sin eso, elegir Entre Ríos y después Córdoba da
 * una URL distinta que elegirlas al revés, y dos personas que miran lo mismo
 * comparten links que no se parecen.
 */

/** Lo mínimo que el filtro necesita de una fila de `panel_pdv`. */
export interface FilaConProvincia {
  provincia_id: number | null
  provincia_nombre?: string | null
  /** Visitas que midieron presencia y dieron verdadero. Para el KPI. */
  verdaderos?: number | string | null
}

/** `count(*)` de Postgres viaja como string por varios caminos. */
function num(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0 }
  return 0
}

/**
 * Lee el parámetro de la URL. Tolerante a propósito: lo que venga mal se
 * descarta en silencio y **el resto sigue valiendo**.
 *
 * Un `?prov=2,abc,6` que tirara un error, o que devolviera vacío entero,
 * convertiría un link viejo o mal pegado en una pantalla rota. Lo que NO es
 * silencioso es que una provincia pedida no exista en los datos: eso lo
 * reporta `aplicarFiltro` y la pantalla lo dice.
 *
 * Acepta `string[]` porque Next lo entrega así si alguna vez llegan claves
 * repetidas — de otra fuente, de un link viejo, de alguien probando. Se
 * aplanan en vez de ignorarlas.
 */
export function provinciasDesde(param: string | string[] | undefined | null): number[] {
  if (param == null) return []
  const crudo = Array.isArray(param) ? param.join(',') : param
  const ids = crudo
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0)
  return [...new Set(ids)].sort((a, b) => a - b)
}

/**
 * El valor para la URL, o `null` para que `hrefMapa` borre la clave.
 *
 * **`null` y no `''` está bien de las dos formas** —`hrefMapa` trata los dos
 * igual— pero se devuelve `null` porque es lo que el resto de los parámetros
 * del mapa usan para decir "esto no va en la URL".
 */
export function serializarProvincias(ids: number[] | null | undefined): string | null {
  if (!ids || ids.length === 0) return null
  return [...new Set(ids)].sort((a, b) => a - b).join(',')
}

/** Agregar o sacar una provincia de la selección, para los links del selector. */
export function alternarProvincia(seleccion: number[], id: number): number[] {
  return seleccion.includes(id)
    ? seleccion.filter(p => p !== id)
    : [...seleccion, id].sort((a, b) => a - b)
}

export interface ProvinciaDisponible {
  id: number
  nombre: string
  /** PDV de esa provincia en el alcance actual, sin filtrar. */
  pdv: number
}

/**
 * Las provincias que hay en los datos, con cuántos PDV tiene cada una.
 *
 * Salen de las FILAS y no de la tabla `provincias`: el selector tiene que
 * ofrecer las 3 en las que se está relevando, no las 24 del padrón. Un menú
 * con 21 opciones que no hacen nada es peor que no tener menú.
 */
export function provinciasDisponibles(filas: FilaConProvincia[]): ProvinciaDisponible[] {
  const m = new Map<number, ProvinciaDisponible>()
  for (const f of filas) {
    if (f.provincia_id == null) continue
    const prev = m.get(f.provincia_id)
    if (prev) prev.pdv++
    else m.set(f.provincia_id, { id: f.provincia_id, nombre: f.provincia_nombre ?? 'Sin nombre', pdv: 1 })
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export interface ResultadoFiltro<T> {
  filas: T[]
  /** Hay filtro activo. Con selección vacía es `false`: la ausencia es "todas". */
  hayFiltro: boolean
  /** Lo pedido que SÍ existe en los datos. */
  seleccion: number[]
  /**
   * Lo pedido que no aparece en los datos. Un link viejo, una provincia donde
   * se dejó de relevar. No se corrige solo: se dice.
   */
  desconocidas: number[]
  /**
   * PDV que el filtro dejó afuera **por no tener provincia todavía**, no por
   * ser de otra. Es el número del aviso de excluidos.
   */
  sinProvincia: number
}

/**
 * Aplica el filtro y devuelve además lo que hay que contarle a quien mira.
 *
 * ── EL AVISO DE EXCLUIDOS NO ES CORTESÍA ────────────────────────────────────
 * Un alcance que se vacía entero **se lee como "no hay datos"**, y eso es una
 * conclusión de negocio equivocada sacada de un filtro estricto. Por eso el
 * resultado no es solo la lista: trae con qué explicar por qué es corta.
 *
 * ── Y LOS PDV SIN PROVINCIA NO SON UN RESIDUO ───────────────────────────────
 * **El alta escribe `localidad_sugerida_id`, no `localidad_id`.** Un comercio
 * recién cargado no tiene provincia hasta que la distri confirma la sugerencia
 * en su bandeja. O sea que este número va a ser distinto de cero seguido, y
 * justo sobre los comercios más nuevos — que son los que la marca mira.
 *
 * Con filtro activo quedan afuera, porque no se puede afirmar que pertenezcan
 * a lo que se está mirando. Sin filtro entran todos, como siempre.
 */
export function aplicarFiltroProvincia<T extends FilaConProvincia>(
  filas: T[],
  pedidas: number[],
): ResultadoFiltro<T> {
  if (pedidas.length === 0) {
    return { filas, hayFiltro: false, seleccion: [], desconocidas: [], sinProvincia: 0 }
  }

  const presentes = new Set(filas.map(f => f.provincia_id).filter((p): p is number => p != null))
  const seleccion = pedidas.filter(p => presentes.has(p))
  const desconocidas = pedidas.filter(p => !presentes.has(p))

  // Con TODO lo pedido fuera de los datos no se filtra por nada: se devuelve
  // el universo y `desconocidas` explica por qué. Filtrar por un conjunto
  // vacío daría una pantalla en blanco, que es exactamente la lectura errónea
  // que este archivo quiere evitar.
  if (seleccion.length === 0) {
    return { filas, hayFiltro: false, seleccion: [], desconocidas, sinProvincia: 0 }
  }

  const elegidas = new Set(seleccion)
  return {
    filas: filas.filter(f => f.provincia_id != null && elegidas.has(f.provincia_id)),
    hayFiltro: true,
    seleccion,
    desconocidas,
    sinProvincia: filas.filter(f => f.provincia_id == null).length,
  }
}

export interface ResumenProvincias {
  /** Provincias donde hay al menos un PDV con visita viva. */
  relevando: number
  /** De ésas, en cuántas hay al menos un PDV con producto confirmado. */
  conProducto: number
}

/**
 * Los DOS números del KPI de la cabecera.
 *
 * ── SON DOS Y VAN JUNTOS ────────────────────────────────────────────────────
 * "Relevás en 4, tenés producto en 3" dice algo que ninguno de los dos dice
 * solo: el primero es esfuerzo desplegado y el segundo es resultado.
 *
 * ── `verdaderos > 0` ES EL MISMO PREDICADO QUE LA TABLA DE COBERTURA ────────
 * `agruparCobertura` cuenta `conPresencia` así. Derivarlo de la misma fila en
 * vez de escribir una consulta aparte es lo que hace que el KPI y la tabla no
 * puedan decir cosas distintas. La presencia sale de dos fuentes —la métrica
 * `presencia` de las respuestas y `fotos.declaracion`— y las dos ya están
 * resueltas adentro de `panel_pdv`.
 *
 * ── LO QUE CUENTA EL PRIMER NÚMERO, DICHO SIN VUELTAS ───────────────────────
 * Provincias con una VISITA VIVA, no con una medición. Una provincia donde
 * nadie contestó la pregunta de presencia suma acá y no en el segundo, y eso
 * es justamente lo que hace informativa la pareja — pero significa que el
 * primer número puede crecer sin que entre un solo dato. El tooltip lo aclara.
 *
 * Los PDV sin provincia no suman a ninguno de los dos: no se puede contar una
 * provincia que no se sabe cuál es.
 */
export function resumenProvincias(filas: FilaConProvincia[]): ResumenProvincias {
  const relevando = new Set<number>()
  const conProducto = new Set<number>()
  for (const f of filas) {
    if (f.provincia_id == null) continue
    relevando.add(f.provincia_id)
    if (num(f.verdaderos) > 0) conProducto.add(f.provincia_id)
  }
  return { relevando: relevando.size, conProducto: conProducto.size }
}
