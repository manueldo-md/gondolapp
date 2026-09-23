/**
 * lib/mapa-pdv.ts
 * Agrupar PDV que se pisan en el mapa, y decir de qué está hecho cada grupo.
 *
 * ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
 * Medido sobre los datos de producción el 24/9/2026, proyectando a Web Mercator
 * y agrupando por celdas del ancho del marker:
 *
 *   Georgalos, 58 PDV, al zoom en que entra todo (8):  se ven 10.  48 tapados.
 *   Suprante,  26 PDV, ídem (8):                       se ven  6.  20 tapados.
 *   ACME,      22 PDV, ídem (7):                       se ven  6.  16 tapados.
 *
 * O sea que **la vista por defecto esconde entre el 73% y el 83% de los
 * puntos**, y no se nota: se ven diez pines nítidos y parecen ser todos. Un
 * mapa que hace eso es peor que no tener mapa, porque da una respuesta.
 *
 * `pigeon-maps` no trae clustering, y no hace falta: son cuarenta líneas de
 * aritmética que además —al vivir acá y no en el componente— se prueban sin
 * montar nada, igual que `tramosContinuos`.
 *
 * ── LA GRILLA ES DEL MUNDO, NO DE LA PANTALLA ───────────────────────────────
 * Las celdas se calculan sobre los píxeles ABSOLUTOS del mundo a ese zoom, no
 * sobre coordenadas del viewport. Es lo que hace que los grupos NO se rearmen
 * al arrastrar el mapa: con una grilla relativa a la pantalla, mover el mapa un
 * píxel puede partir un grupo en dos y el mapa parpadea mientras se panea.
 * Solo cambian al cambiar el zoom, que es cuando el usuario espera que cambien.
 *
 * ── NINGÚN PUNTO SE PIERDE ──────────────────────────────────────────────────
 * Es el invariante que sostiene todo: la suma de los puntos de los grupos es
 * siempre igual a los puntos de entrada. Un mapa que se come un PDV en el
 * agrupamiento miente igual que uno que lo tapa, y en silencio.
 */

/** Un PDV dibujable. `presente: null` = visitado sin medir presencia. */
export interface PuntoMapa {
  id: string
  nombre: string
  lat: number
  lng: number
  presente: boolean | null
  tipo: string | null
}

export interface GrupoMapa {
  clave: string
  /** Dónde se ancla el marker: el centro de los puntos del grupo. */
  lat: number
  lng: number
  puntos: PuntoMapa[]
  presentes: number
  ausentes: number
  sinMedir: number
}

/** Tamaño del marker en píxeles. Dos PDV más cerca que esto se tapan. */
export const SEPARACION_PX = 22

// ── Proyección ───────────────────────────────────────────────────────────────

/**
 * Web Mercator a píxeles absolutos del mundo, con tiles de 256 px.
 *
 * Es la misma proyección que usan los tiles, así que agrupar con esto agrupa
 * exactamente lo que el ojo ve superpuesto. Hacerlo en grados sería distinto:
 * un grado de longitud mide la mitad a 60° de latitud que en el ecuador, y los
 * grupos saldrían de otro tamaño según dónde caigan.
 */
export function proyectar(lat: number, lng: number, zoom: number): [number, number] {
  const escala = 256 * 2 ** zoom
  const x = ((lng + 180) / 360) * escala
  const senoLat = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + senoLat) / (1 - senoLat)) / (4 * Math.PI)) * escala
  return [x, y]
}

// ── Agrupamiento ─────────────────────────────────────────────────────────────

/**
 * Agrupa los puntos que se pisarían a ese zoom.
 *
 * El ancla del grupo es el promedio de lat/lng de sus puntos. Promediar en
 * grados en vez de en píxeles es correcto acá porque un grupo mide, por
 * definición, menos de `separacionPx`: la diferencia entre las dos cuentas es
 * menor que un píxel.
 *
 * Los grupos salen ordenados de mayor a menor, y a igual tamaño por clave, para
 * que el renderizado sea estable entre llamadas.
 */
export function agruparEnMapa(
  puntos: PuntoMapa[],
  zoom: number,
  separacionPx: number = SEPARACION_PX,
): GrupoMapa[] {
  const celdas = new Map<string, PuntoMapa[]>()

  for (const p of puntos) {
    const [x, y] = proyectar(p.lat, p.lng, zoom)
    const clave = `${Math.floor(x / separacionPx)}:${Math.floor(y / separacionPx)}`
    const lista = celdas.get(clave)
    if (lista) lista.push(p)
    else celdas.set(clave, [p])
  }

  return [...celdas.entries()]
    .map(([clave, pts]) => ({
      clave,
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
      puntos: pts,
      presentes: pts.filter(p => p.presente === true).length,
      ausentes:  pts.filter(p => p.presente === false).length,
      sinMedir:  pts.filter(p => p.presente === null).length,
    }))
    .sort((a, b) => b.puntos.length - a.puntos.length || a.clave.localeCompare(b.clave))
}

// ── Encuadre inicial ─────────────────────────────────────────────────────────

/**
 * El zoom más cercano al que TODOS los puntos entran en el recuadro dado, y el
 * centro del conjunto.
 *
 * Arrancar en un zoom fijo dejaría a una marca de una sola ciudad mirando medio
 * país vacío, y a una de varias provincias con la mitad de sus PDV afuera de
 * pantalla sin ninguna pista de que están.
 */
export function encuadrar(
  puntos: PuntoMapa[],
  anchoPx: number,
  altoPx: number,
  zoomMax = 16,
): { centro: [number, number]; zoom: number } {
  if (puntos.length === 0) return { centro: [-32, -58.5], zoom: 6 }

  const lats = puntos.map(p => p.lat)
  const lngs = puntos.map(p => p.lng)
  const centro: [number, number] = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ]

  for (let z = zoomMax; z >= 1; z--) {
    const [x1, y1] = proyectar(Math.max(...lats), Math.min(...lngs), z)
    const [x2, y2] = proyectar(Math.min(...lats), Math.max(...lngs), z)
    if (x2 - x1 <= anchoPx && y2 - y1 <= altoPx) return { centro, zoom: z }
  }
  return { centro, zoom: 1 }
}

// ── Cómo se pinta un grupo ───────────────────────────────────────────────────

export const COLOR_PRESENCIA = {
  presente: '#16a34a',
  ausente:  '#dc2626',
  sinMedir: '#9ca3af',
} as const

/**
 * El anillo de un grupo, como `conic-gradient`.
 *
 * ── NADA ESCONDE A LA MINORÍA ───────────────────────────────────────────────
 * Pintar el grupo del color de la mayoría es la salida fácil y es exactamente
 * lo que este panel viene evitando: un grupo de 6 con 4 presentes y 2 ausentes
 * pintado de verde dice que ahí está todo bien. El anillo partido en tres
 * muestra las proporciones reales, y el número adentro dice cuántos son.
 *
 * Es la misma técnica que `PresenciaDonut` ya usa en el dashboard: CSS puro,
 * sin librería y sin un solo byte de JavaScript extra.
 */
export function anilloGrupo(g: GrupoMapa): string {
  const total = g.puntos.length
  if (total === 0) return COLOR_PRESENCIA.sinMedir

  const tramos: string[] = []
  let desde = 0
  for (const [n, color] of [
    [g.presentes, COLOR_PRESENCIA.presente],
    [g.ausentes,  COLOR_PRESENCIA.ausente],
    [g.sinMedir,  COLOR_PRESENCIA.sinMedir],
  ] as const) {
    if (n === 0) continue
    const hasta = desde + (n / total) * 360
    tramos.push(`${color} ${desde.toFixed(2)}deg ${hasta.toFixed(2)}deg`)
    desde = hasta
  }
  return `conic-gradient(${tramos.join(', ')})`
}

/** El color de un PDV suelto. */
export function colorPunto(p: PuntoMapa): string {
  return p.presente === null ? COLOR_PRESENCIA.sinMedir
       : p.presente          ? COLOR_PRESENCIA.presente
       :                       COLOR_PRESENCIA.ausente
}

/** El texto de un grupo: lo que se lee al tocarlo, sin esconder ninguna parte. */
export function textoGrupo(g: GrupoMapa): string {
  if (g.puntos.length === 1) {
    const p = g.puntos[0]
    return p.presente === null ? `${p.nombre} — presencia sin medir`
         : p.presente          ? `${p.nombre} — con presencia`
         :                       `${p.nombre} — sin presencia`
  }
  const partes: string[] = []
  if (g.presentes) partes.push(`${g.presentes} con presencia`)
  if (g.ausentes)  partes.push(`${g.ausentes} sin presencia`)
  if (g.sinMedir)  partes.push(`${g.sinMedir} sin medir`)
  return `${g.puntos.length} PDV · ${partes.join(' · ')}`
}

// ── Los tiles ────────────────────────────────────────────────────────────────

/**
 * El estilo de Geoapify. `positron` es el más liviano visualmente: gris claro
 * con poco detalle, que es lo que un mapa de datos necesita — los puntos tienen
 * que ganarle al fondo, no competir con él.
 */
export const ESTILO_TILES = 'positron'

/**
 * La URL de un tile.
 *
 * ── LA KEY ES PÚBLICA Y ESTÁ BIEN QUE LO SEA ────────────────────────────────
 * Viaja en el `src` de un `<img>`: cualquiera que abra el inspector la ve, y no
 * hay forma de esconderla sin proxear cada tile por nuestro servidor. Lo que la
 * protege es la allowlist de dominios del proveedor, no el secreto. Por eso se
 * llama `NEXT_PUBLIC_GEOAPIFY_KEY`: el prefijo dice la verdad.
 *
 * Con `@2x` en pantallas densas — Geoapify lo cobra igual (0,25 créditos) y en
 * un monitor de escritorio la diferencia se ve.
 */
export function urlTile(
  x: number, y: number, z: number, apiKey: string, dpr?: number,
): string {
  const retina = dpr && dpr >= 2 ? '@2x' : ''
  return `https://maps.geoapify.com/v1/tile/${ESTILO_TILES}/${z}/${x}/${y}${retina}.png?apiKey=${encodeURIComponent(apiKey)}`
}

/**
 * Por qué el mapa no se puede dibujar. `null` = se puede.
 *
 * ── SON DOS PROBLEMAS DISTINTOS Y SE ARREGLAN EN LUGARES DISTINTOS ──────────
 * Sin key es un deploy al que le falta una variable. Con key y tiles que no
 * cargan es la key inválida, el dominio fuera de la allowlist o la cuota
 * agotada. Un solo mensaje para los dos manda a mirar donde no es.
 *
 * Y el tercero, el que motivó todo esto: **ninguno de los dos puede quedar en
 * un mapa gris sin explicación**. Un mapa gris parece un mapa vacío, y un mapa
 * vacío responde "no tenés PDV acá", que es una respuesta falsa.
 */
export type FalloMapa = 'sin_key' | 'tiles_no_cargan'

export function mensajeFallo(fallo: FalloMapa): { titulo: string; detalle: string } {
  switch (fallo) {
    case 'sin_key':
      return {
        titulo: 'El mapa no está configurado',
        detalle: 'Falta la variable NEXT_PUBLIC_GEOAPIFY_KEY en este deploy. ' +
                 'Los datos de abajo son correctos; lo que no se puede dibujar es el fondo.',
      }
    case 'tiles_no_cargan':
      return {
        titulo: 'No se pudieron cargar los mapas',
        detalle: 'El proveedor rechazó el pedido. Suele ser la clave vencida, este dominio ' +
                 'fuera de la lista permitida, o la cuota del mes agotada. ' +
                 'Los datos de abajo son correctos.',
      }
  }
}
