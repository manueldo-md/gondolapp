/**
 * lib/linea-comercio.ts — armar la LÍNEA DE TIEMPO de un comercio.
 *
 * ── QUÉ CONTESTA ────────────────────────────────────────────────────────────
 * Cómo está la góndola de este comercio hoy y cómo venía. Cinco fotos sueltas
 * no dicen nada; ordenadas muestran si se mantiene o se degrada, y eso es lo
 * que la distribuidora le muestra al cliente.
 *
 * Función pura: recibe las filas ya cargadas y no consulta nada. La consulta y
 * el permiso viven aparte, igual que en `lib/cobertura-seguimiento.ts`.
 *
 * ── LA UNIDAD ES LA VISITA, NO LA FOTO ──────────────────────────────────────
 * Medido el 24/9/2026: **el 41% de las misiones con foto en dev y el 42% en
 * producción dejan DOS fotos**, porque la campaña tiene dos campos `foto`. Si
 * la línea alineara fotos crudas, la misma fecha aparecería dos veces y —lo que
 * importa— **"la última contra la anterior" compararía dos tomas de la misma
 * visita**, que es justo lo que no se quiere ver.
 *
 * Cada punto de la línea es una visita con sus N fotos adentro.
 *
 * ── EL ANCLA ES `capturada_at` ──────────────────────────────────────────────
 * Cuándo se hizo el trabajo de campo, no cuándo entró la fila. Una misión
 * encolada sin señal entra días después: por `created_at` se iría al final de
 * la línea, o sea al lugar de la foto más nueva, que es exactamente el error
 * que esta pantalla no puede cometer — una foto de góndola no lleva la fecha
 * escrita y nadie lo notaría. Es la cuarta vez que la distinción aparece en
 * este proyecto.
 *
 * ── QUÉ CUENTA COMO VISITA ──────────────────────────────────────────────────
 * Toda misión que no esté `'descartada'`, tenga fotos o no. El mismo criterio
 * que la cobertura: lo que se mide es si FUE.
 *
 * El filtro va en JS y no con `.neq()`: `misiones.estado` es nullable y
 * PostgREST descartaría también las filas con NULL por lógica de tres valores.
 * Mismo motivo que en `lib/comercios-relevados.ts`.
 */

import { hrefMapa } from './mapa-pdv'

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE ENTRA
// ─────────────────────────────────────────────────────────────────────────────

/** Una misión del comercio, con lo que la línea necesita mostrar. */
export type FilaMisionLinea = {
  id: string
  estado: string | null
  /** El ancla. Ver el encabezado. */
  capturada_at: string | null
  created_at: string | null
  campana_id: string | null
  campana_nombre: string | null
  gondolero_nombre: string | null
  gondolero_alias: string | null
}

/** Una foto colgada de una de esas misiones. */
export type FilaFotoLinea = {
  id: string
  mision_id: string | null
  estado: string | null
  storage_path: string | null
  url: string | null
  created_at: string | null
}

/** Una respuesta de esas misiones, con la pregunta ya resuelta. */
export type FilaRespuestaLinea = {
  mision_id: string | null
  pregunta: string | null
  tipo: string | null
  valor: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SALE
// ─────────────────────────────────────────────────────────────────────────────

export type FotoDeVisita = {
  id: string
  storagePath: string | null
  url: string | null
}

export type RespuestaDeVisita = {
  pregunta: string
  tipo: string | null
  valor: unknown
}

export type Visita = {
  misionId: string
  /** El instante que la ubica en la línea. Ver `instanteDeVisita`. */
  instante: string
  campanaId: string | null
  /**
   * El nombre de la campaña, que va EN CADA VISITA y no en la cabecera.
   *
   * La línea mezcla campañas a propósito: prohibirlo dejaría huecos en algo que
   * promete ser completo —el gondolero estuvo ahí y sacó esa foto— y además la
   * mezcla es un dato. Si en el medio de la reposición hubo una auditoría de
   * precios, eso explica por qué esa semana la foto se ve distinta. Es la misma
   * decisión que la etiqueta de fuente por fila del desglose del panel.
   */
  campanaNombre: string | null
  gondolero: string | null
  /** Las fotos que SON evidencia: solo las aprobadas. */
  fotos: FotoDeVisita[]
  /** Cuántas están esperando revisión. Ver `LA VISITA APARECE IGUAL`. */
  enRevision: number
  /** Cuántas se rechazaron. La visita ocurrió igual. */
  rechazadas: number
  respuestas: RespuestaDeVisita[]
}

export type LineaComercio = {
  /** De la más vieja a la más nueva: una línea de tiempo se lee así. */
  visitas: Visita[]
  /** Cuántas visitas MÁS VIEJAS quedaron afuera por el tope. Ver `TOPE_VISITAS`. */
  recortadas: number
  /** Las visitas que había antes de recortar. */
  total: number
  /**
   * Misiones sin `capturada_at` NI `created_at`, que no se pueden ubicar en una
   * línea de tiempo.
   *
   * Hoy es cero en las dos bases —`capturada_at` tiene `DEFAULT now()` y no hay
   * un solo nulo en las 227 de dev ni en las 140 de prod— así que este camino no
   * lo ejercita ningún dato real. Existe por lo mismo que el aviso de PDV sin
   * coordenadas del mapa: **una pantalla que omite algo en silencio miente**, y
   * acá el silencio se leería como una visita que no se hizo.
   */
  sinFecha: number
}

/**
 * Cuántas visitas entran en una línea.
 *
 * ── POR QUÉ UN TOPE Y NO PAGINACIÓN ─────────────────────────────────────────
 * El máximo real al 24/9/2026 es de **13 fotos por comercio en dev y 4 en
 * producción**, y 4 visitas por (comercio, campaña). Las ~50 de una campaña de
 * seguimiento de seis meses con dos visitas semanales todavía no existen.
 * Paginar una lista que nunca tiene dos páginas es maquinaria que nadie
 * ejercita, que es como se rompe sin que nadie se entere.
 *
 * Lo que sí importa: **el recorte se declara.** `recortadas` sale en el
 * resultado para que la pantalla lo diga. Un hueco silencioso en una pantalla
 * de evidencia se lee como una visita que no se hizo, y eso es peor que no
 * mostrarla.
 *
 * Se recorta por lo VIEJO: lo que se detecta acá es la caída reciente.
 */
export const TOPE_VISITAS = 60

// ─────────────────────────────────────────────────────────────────────────────

/** Cuándo pasó, de verdad. `null` si no hay con qué ubicarla. */
export function instanteDeVisita(m: FilaMisionLinea): string | null {
  return m.capturada_at ?? m.created_at ?? null
}

/**
 * Una foto es evidencia solo si está aprobada.
 *
 * Una pendiente todavía no lo es, y ponerla en una línea de tiempo la
 * convierte en una: la línea es lo que la distri le muestra al cliente.
 */
function esEvidencia(estado: string | null): boolean {
  return estado === 'aprobada'
}

/** Esperando que alguien la mire. `en_revision` es el mismo caso que `pendiente`. */
function esperaRevision(estado: string | null): boolean {
  return estado === 'pendiente' || estado === 'en_revision'
}

/**
 * La línea de un comercio.
 *
 * ── LA VISITA APARECE IGUAL ─────────────────────────────────────────────────
 * El filtro de `'aprobada'` es sobre la FOTO, no sobre la visita. Una visita
 * cuyas fotos están todas pendientes **entra en la línea igual**, con su fecha,
 * su gondolero y sus respuestas, y con `enRevision > 0` para que la pantalla lo
 * diga. Sacarla entera haría desaparecer una visita que se hizo, que es el
 * mismo hueco silencioso que el tope.
 *
 * Y una visita sin ninguna foto —una campaña de solo preguntas— también entra:
 * la unidad de la línea es la visita.
 */
export function armarLinea(
  datos: {
    misiones: FilaMisionLinea[]
    fotos: FilaFotoLinea[]
    respuestas: FilaRespuestaLinea[]
  },
  tope: number = TOPE_VISITAS,
): LineaComercio {
  // ── Las fotos y las respuestas, indexadas por misión ──────────────────────
  const fotosPorMision = new Map<string, FilaFotoLinea[]>()
  for (const f of datos.fotos) {
    if (!f.mision_id) continue          // la fachada del alta no cuelga de una misión
    const ya = fotosPorMision.get(f.mision_id)
    if (ya) ya.push(f)
    else fotosPorMision.set(f.mision_id, [f])
  }

  const respPorMision = new Map<string, FilaRespuestaLinea[]>()
  for (const r of datos.respuestas) {
    if (!r.mision_id) continue
    const ya = respPorMision.get(r.mision_id)
    if (ya) ya.push(r)
    else respPorMision.set(r.mision_id, [r])
  }

  // ── Las visitas ───────────────────────────────────────────────────────────
  const visitas: Visita[] = []
  let sinFecha = 0

  for (const m of datos.misiones) {
    // La descartada es la misión que el gondolero resignó porque no podía
    // volver al comercio. No es una visita.
    if (m.estado === 'descartada') continue

    const instante = instanteDeVisita(m)
    if (!instante) { sinFecha++; continue }

    const suyas = fotosPorMision.get(m.id) ?? []

    visitas.push({
      misionId: m.id,
      instante,
      campanaId: m.campana_id,
      campanaNombre: m.campana_nombre,
      // El nombre y no el alias: los paneles de empresa ya muestran los dos
      // —la distri contrata al gondolero y le paga—. El alias es para el
      // ranking, que es la única pantalla donde un gondolero ve a otro.
      gondolero: m.gondolero_nombre ?? m.gondolero_alias ?? null,
      fotos: suyas
        .filter(f => esEvidencia(f.estado))
        // Orden estable: sin esto, dos renders del mismo dato podrían poner las
        // dos fotos de una visita al revés, y eso se lee como un bug.
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))
        .map(f => ({ id: f.id, storagePath: f.storage_path, url: f.url })),
      enRevision: suyas.filter(f => esperaRevision(f.estado)).length,
      rechazadas: suyas.filter(f => f.estado === 'rechazada').length,
      respuestas: (respPorMision.get(m.id) ?? [])
        .filter(r => r.pregunta)
        .map(r => ({ pregunta: r.pregunta as string, tipo: r.tipo, valor: r.valor })),
    })
  }

  // Cronológico, y con desempate por id para que sea un orden TOTAL: dos
  // visitas en el mismo instante —una reposición y una auditoría el mismo día a
  // la misma hora— tienen que salir siempre en el mismo orden.
  visitas.sort((a, b) => a.instante.localeCompare(b.instante) || a.misionId.localeCompare(b.misionId))

  const total = visitas.length
  const recortadas = Math.max(0, total - tope)

  return {
    // Se recortan las VIEJAS: `slice(recortadas)` deja las últimas `tope`.
    visitas: recortadas > 0 ? visitas.slice(recortadas) : visitas,
    recortadas,
    total,
    sinFecha,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LA COMPARACIÓN DE A DOS
// ─────────────────────────────────────────────────────────────────────────────

export type ParComparado = {
  /** La más vieja de las dos. */
  anterior: Visita
  /** La más nueva. */
  ultima: Visita
  /**
   * `true` cuando lo que se pidió no se pudo usar y se cayó al par por default.
   * La pantalla lo necesita para no decir "estás comparando lo que elegiste"
   * cuando no es cierto.
   */
  ajustado: boolean
}

/**
 * Las dos visitas que se comparan lado a lado.
 *
 * ── EL DEFAULT ES LA ÚLTIMA CONTRA LA ANTERIOR ──────────────────────────────
 * No la primera contra la última. **Lo que se detecta es la caída reciente**, no
 * la diferencia contra hace tres meses: una góndola que se vació la semana
 * pasada es una llamada hoy, y una que está peor que en marzo puede llevar así
 * desde abril.
 *
 * ── SOLO ENTRAN LAS QUE TIENEN FOTO ─────────────────────────────────────────
 * Comparar contra una visita sin foto no compara nada. Una visita en revisión
 * aparece en la línea pero no puede ser uno de los dos lados, porque su foto
 * todavía no es evidencia.
 *
 * ── Y EL PAR SALE SIEMPRE EN ORDEN ──────────────────────────────────────────
 * `anterior` es la más vieja aunque se hayan pedido al revés. Un antes y
 * después dado vuelta cuenta la historia opuesta —una góndola que se llena en
 * vez de vaciarse— y nada en pantalla lo delataría.
 */
export function parDeComparacion(
  visitas: Visita[],
  seleccion?: { a?: string | null; b?: string | null },
): ParComparado | null {
  const conFoto = visitas.filter(v => v.fotos.length > 0)
  if (conFoto.length < 2) return null

  const porId = new Map(conFoto.map(v => [v.misionId, v]))
  const a = seleccion?.a ? porId.get(seleccion.a) : undefined
  const b = seleccion?.b ? porId.get(seleccion.b) : undefined

  // Las dos pedidas, y distintas entre sí. Comparar una visita consigo misma
  // sería una pantalla que afirma que no cambió nada.
  if (a && b && a.misionId !== b.misionId) {
    const [anterior, ultima] = ordenar(a, b)
    return { anterior, ultima, ajustado: false }
  }

  // `conFoto` ya viene cronológico, porque `armarLinea` ordenó y filtrar no
  // altera el orden.
  const anterior = conFoto[conFoto.length - 2]
  const ultima = conFoto[conFoto.length - 1]
  return {
    anterior,
    ultima,
    // Pidió algo y no se pudo usar: un id de otra pantalla, una visita sin foto,
    // o las dos veces la misma.
    ajustado: Boolean(seleccion?.a || seleccion?.b),
  }
}

/**
 * Qué par queda si se elige otra visita, estando comparando `par`.
 *
 * ── UNA SOLA REGLA: LA MÁS RECIENTE DE LAS DOS SE QUEDA ─────────────────────
 * Elegir una tercera visita tiene que reemplazar a alguna, y cuál no es obvio.
 * La respuesta es la vieja, porque la reciente es el ANCLA: lo que se está
 * preguntando es "¿contra cuándo comparo cómo está hoy?". Con la regla al
 * revés, cada click movería el punto de referencia y la pantalla nunca
 * contestaría eso.
 *
 * Es una sola regla y se puede escribir en la pantalla en un renglón. Dos
 * slots separados —"usar como antes" / "usar como después"— serían más
 * flexibles y mentirían: `parDeComparacion` reordena cronológicamente, así que
 * una visita elegida como "antes" puede terminar a la derecha.
 *
 * Devuelve `null` cuando no hay nada que hacer: sin par, o cuando la visita ya
 * es uno de los dos lados. En ese caso la tarjeta no muestra el link, en vez de
 * mostrar uno que no cambia nada.
 *
 * Toma el par EFECTIVO —el que se está viendo, venga de la URL o del default—
 * y no lo que diga la query string. Lo que se modifica es lo que se ve.
 */
export function siguienteSeleccion(
  par: ParComparado | null,
  visitaId: string,
): { a: string; b: string } | null {
  if (!par) return null
  if (visitaId === par.anterior.misionId || visitaId === par.ultima.misionId) return null
  return { a: visitaId, b: par.ultima.misionId }
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LLEGA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El link a la evidencia de un comercio, o `null` si ese panel no la tiene.
 *
 * ── POR QUÉ UNA FUNCIÓN Y NO UN STRING EN CADA PANTALLA ─────────────────────
 * Se entra desde tres lugares —la lista del grupo del mapa, la tabla de
 * cobertura de una campaña de seguimiento, y el padrón— y cada uno tendría que
 * acordarse de dos cosas: la ruta en SINGULAR, y que en distribuidora el
 * alcance es obligatorio. Un link sin `alcance` no rompe: **abre la pantalla
 * pidiendo que elijan**, que es un paso de más y se lee como un bug. Tres
 * copias de esa regla son tres oportunidades de olvidarse de la segunda.
 *
 * `admin` y `repositora` devuelven `null`: esas pantallas no existen para esos
 * paneles, y la tabla de cobertura —que los cuatro montan— tiene que poder no
 * linkear en vez de llevar a un 404.
 */
export function rutaEvidencia(p: {
  /**
   * El `Panel` de `components/campanas/modulos/tema.ts`: `'marca'`, `'distri'`,
   * `'admin'` o `'repositora'`.
   *
   * **Ojo con `'distri'` contra `/distribuidora/`**: el panel se llama de una
   * forma y su ruta de otra, y esa traducción vive acá y en ningún otro lado.
   * Escribir `'distribuidora'` en el llamador compila igual —es un `string`— y
   * devuelve `null` en silencio, o sea un nombre de comercio que deja de ser un
   * link sin que nada falle.
   */
  panel: string
  comercioId: string
  /** La clave del selector de alcance. Obligatoria en distribuidora. */
  alcance?: string | null
  /** Para llegar con la campaña ya elegida, cuando se entra desde una. */
  campanaId?: string | null
}): string | null {
  if (!p.comercioId) return null

  if (p.panel === 'marca') {
    return hrefMapa(`/marca/comercio/${p.comercioId}`, { campana: p.campanaId })
  }
  if (p.panel === 'distri') {
    // Sin alcance la pantalla no puede resolver el scope y muestra el selector.
    // Mandar ahí desde un link que SÍ sabe cuál es sería hacer elegir dos veces.
    if (!p.alcance) return null
    return hrefMapa(`/distribuidora/comercio/${p.comercioId}`,
      { alcance: p.alcance, campana: p.campanaId })
  }
  return null
}

function ordenar(x: Visita, y: Visita): [Visita, Visita] {
  const xPrimero = x.instante.localeCompare(y.instante) || x.misionId.localeCompare(y.misionId)
  return xPrimero <= 0 ? [x, y] : [y, x]
}
