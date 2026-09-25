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
  /**
   * El estado de cobertura de ESTA semana, solo en campañas de seguimiento.
   * Lo calcula `calcularCobertura` y lo trae la pantalla; el mapa no lo deriva.
   */
  cobertura?: 'al_dia' | 'va_bien' | 'atrasado' | null
  /**
   * Visitas de esta semana. NO decide el color —eso lo hace `cobertura`— sino
   * lo que dice la lista del grupo cuando el modo está activo.
   */
  visitasSemana?: number | null
}

export interface GrupoMapa {
  clave: string
  /** Dónde se ancla el marker: el centro de los puntos del grupo. */
  lat: number
  lng: number
  puntos: PuntoMapa[]
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
      // Los conteos por categoría NO se guardan acá: dependen del modo de
      // pintado, que es del que mira y no del agrupamiento. Se derivan con
      // `repartoDe`. Guardarlos obligaría a reagrupar al cambiar de modo, o a
      // tener tres juegos de contadores en la misma estructura.
      puntos: pts,
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
//
// Los tres modos se describen con la misma forma —una lista ordenada de
// categorías con su color— y el resto del archivo no sabe cuál está activo.
//
// Antes esto estaba clavado en presencia: `GrupoMapa` traía `presentes`,
// `ausentes` y `sinMedir` calculados adentro de `agruparEnMapa`, y `anilloGrupo`
// armaba el gradiente con esos tres. Agregar cobertura por ese camino habría
// sido una segunda copia de la misma maquinaria.

/** Qué decide el color de cada punto. */
export type ModoPintado = 'presencia' | 'tipo' | 'cobertura'

export interface Categoria {
  clave: string
  etiqueta: string
  color: string
  /**
   * Cómo se dice de UN punto suelto, cuando la etiqueta sola no alcanza.
   *
   * "Sin medir" es una columna clara en la referencia y un renglón vago al lado
   * de un nombre: *"Kiosco El Cid — sin medir"* no dice sin medir QUÉ. Las
   * demás se leen bien solas —"al día", "atrasado", "almacén"— y por eso esto
   * es la excepción y no un campo obligatorio.
   */
  frase?: string
}

export const COLOR_PRESENCIA = {
  presente: '#16a34a',
  ausente:  '#dc2626',
  sinMedir: '#9ca3af',
} as const

/**
 * Los colores de la cobertura son **los del dashboard**, no un semáforo.
 *
 * Verde / gris / rojo y no verde / ámbar / rojo: el dashboard pinta `va bien`
 * en gris a propósito, porque *"existe para mostrar lo que falta, no para
 * felicitar"*. Con ámbar, una campaña sana se vería medio alarmada y el
 * atrasado dejaría de saltar.
 *
 * El gris choca con el `sinMedir` de presencia, y se aceptó: **son dos modos
 * que nunca están en pantalla al mismo tiempo**, y la referencia de abajo del
 * mapa nombra las tres categorías del modo activo. La alternativa —inventar un
 * cuarto color para no repetir— haría que el mismo estado se vea distinto en
 * dos pantallas que la distri lee seguidas.
 */
export const COLOR_COBERTURA = {
  al_dia:   '#15803d',
  va_bien:  '#6b7280',
  atrasado: '#e11d48',
  sinDato:  '#d1d5db',
} as const

/**
 * Los colores por tipo de comercio.
 *
 * Estaban escritos DOS veces —en `mapa.tsx` y en `pantalla-mapa.tsx`— con el
 * mismo contenido y dos defaults distintos. Es el caso de siempre: dos copias
 * de la misma tabla, y una se queda vieja el día que alguien agregue un tipo.
 */
export const COLOR_TIPO: Record<string, string> = {
  almacen:      '#b45309',
  kiosco:       '#7c3aed',
  autoservicio: '#0891b2',
  dietetica:    '#16a34a',
  mayorista:    '#be123c',
  otro:         '#64748b',
}

export const COLOR_NEUTRO = '#94a3b8'

const CATEGORIAS: Record<ModoPintado, Categoria[]> = {
  presencia: [
    { clave: 'presente', etiqueta: 'Con presencia', color: COLOR_PRESENCIA.presente },
    { clave: 'ausente',  etiqueta: 'Sin presencia', color: COLOR_PRESENCIA.ausente },
    { clave: 'sinMedir', etiqueta: 'Sin medir',     color: COLOR_PRESENCIA.sinMedir,
      frase: 'presencia sin medir' },
  ],
  cobertura: [
    { clave: 'al_dia',   etiqueta: 'Al día',    color: COLOR_COBERTURA.al_dia },
    { clave: 'va_bien',  etiqueta: 'Va bien',   color: COLOR_COBERTURA.va_bien },
    { clave: 'atrasado', etiqueta: 'Atrasado',  color: COLOR_COBERTURA.atrasado },
    // Un PDV del mapa sin estado de cobertura no debería existir: los dos
    // universos salen de las mismas misiones. La costura es el estado
    // 'rechazada', que `panel_pdv` excluye y la cobertura no — y que hoy tiene
    // CERO filas. Si algún día las tiene, el punto se pinta gris claro en vez
    // de desaparecer o mentir un estado.
    { clave: 'sinDato',  etiqueta: 'Sin dato',  color: COLOR_COBERTURA.sinDato },
  ],
  tipo: [
    { clave: 'almacen',      etiqueta: 'Almacén',      color: COLOR_TIPO.almacen },
    { clave: 'autoservicio', etiqueta: 'Autoservicio', color: COLOR_TIPO.autoservicio },
    { clave: 'kiosco',       etiqueta: 'Kiosco',       color: COLOR_TIPO.kiosco },
    { clave: 'dietetica',    etiqueta: 'Dietética',    color: COLOR_TIPO.dietetica },
    { clave: 'mayorista',    etiqueta: 'Mayorista',    color: COLOR_TIPO.mayorista },
    { clave: 'otro',         etiqueta: 'Otro',         color: COLOR_TIPO.otro },
  ],
}

/**
 * Si el grupo mixto muestra PROPORCIONES o va de un color liso.
 *
 * Presencia y cobertura sí: son grados de una misma condición, y esconder la
 * minoría es justo lo que el anillo vino a impedir — un grupo de 8 con 1
 * atrasado tiene que dejar ver ese atrasado, que es el que hay que ir a buscar.
 *
 * Tipo de comercio NO: son categorías sin orden, y un gradiente de seis colores
 * no dice "hay proporciones", dice "hay varios". Para eso ya está el número.
 */
export function tieneAnillo(modo: ModoPintado): boolean {
  return modo !== 'tipo'
}

/** Las categorías de un modo, en el orden en que se leen. */
export function categoriasDe(modo: ModoPintado): Categoria[] {
  return CATEGORIAS[modo]
}

/** En qué categoría de ese modo cae el punto. */
export function categoriaDe(p: PuntoMapa, modo: ModoPintado): string {
  if (modo === 'tipo') {
    const t = p.tipo ?? 'otro'
    return COLOR_TIPO[t] ? t : 'otro'
  }
  if (modo === 'cobertura') {
    return p.cobertura ?? 'sinDato'
  }
  return p.presente === null ? 'sinMedir' : p.presente ? 'presente' : 'ausente'
}

/**
 * Cuántos puntos caen en cada categoría, **sin las vacías y en orden**.
 *
 * La suma de `n` es siempre `puntos.length`: cada punto cae en exactamente una
 * categoría y ninguna se descarta. Un mapa que se come un PDV al contar miente
 * igual que uno que lo tapa.
 */
export function repartoDe(puntos: PuntoMapa[], modo: ModoPintado): { cat: Categoria; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const p of puntos) {
    const clave = categoriaDe(p, modo)
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
  }
  return categoriasDe(modo)
    .map(cat => ({ cat, n: cuenta.get(cat.clave) ?? 0 }))
    .filter(x => x.n > 0)
}

/**
 * El anillo de un grupo, como `conic-gradient`.
 *
 * ── NADA ESCONDE A LA MINORÍA ───────────────────────────────────────────────
 * Pintar el grupo del color de la mayoría es la salida fácil y es exactamente
 * lo que este panel viene evitando: un grupo de 6 con 4 presentes y 2 ausentes
 * pintado de verde dice que ahí está todo bien. El anillo partido muestra las
 * proporciones reales, y el número adentro dice cuántos son.
 *
 * Es la misma técnica que `PresenciaDonut` ya usa en el dashboard: CSS puro,
 * sin librería y sin un solo byte de JavaScript extra.
 *
 * En un modo sin proporciones —tipo de comercio— devuelve un color liso: el del
 * tipo si todos coinciden, y el neutro si están mezclados.
 */
export function anilloGrupo(g: GrupoMapa, modo: ModoPintado = 'presencia'): string {
  const reparto = repartoDe(g.puntos, modo)
  if (reparto.length === 0) return COLOR_NEUTRO
  if (!tieneAnillo(modo)) {
    return reparto.length === 1 ? reparto[0].cat.color : COLOR_NEUTRO
  }
  if (reparto.length === 1) return reparto[0].cat.color

  const total = g.puntos.length
  const tramos: string[] = []
  let desde = 0
  for (const { cat, n } of reparto) {
    const hasta = desde + (n / total) * 360
    tramos.push(`${cat.color} ${desde.toFixed(2)}deg ${hasta.toFixed(2)}deg`)
    desde = hasta
  }
  return `conic-gradient(${tramos.join(', ')})`
}

/** El color de un PDV suelto. */
export function colorPunto(p: PuntoMapa, modo: ModoPintado = 'presencia'): string {
  const clave = categoriaDe(p, modo)
  return categoriasDe(modo).find(c => c.clave === clave)?.color ?? COLOR_NEUTRO
}

/** El texto de un grupo: lo que se lee al tocarlo, sin esconder ninguna parte. */
export function textoGrupo(g: GrupoMapa, modo: ModoPintado = 'presencia'): string {
  const reparto = repartoDe(g.puntos, modo)
  if (g.puntos.length === 1) {
    const cat = reparto[0]?.cat
    const etiqueta = cat?.frase ?? cat?.etiqueta.toLowerCase() ?? 'sin dato'
    return `${g.puntos[0].nombre} — ${etiqueta}`
  }
  const partes = reparto.map(({ cat, n }) => `${n} ${cat.etiqueta.toLowerCase()}`)
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

/**
 * ¿Hay que mostrar el cartel, y cuál?
 *
 * ── POR QUÉ NO HAY UNA SONDA ────────────────────────────────────────────────
 * La primera versión pedía UN tile aparte al montar y miraba su `onerror`. Dio
 * un falso positivo en el primer uso real: los tiles del mapa cargaban, los
 * puntos se veían, y el cartel decía que el proveedor había rechazado el
 * pedido.
 *
 * La causa es de método, no de código: **una sonda prueba una request DISTINTA
 * de la que hace el mapa**. La sonda pedía `12/1372/2401` fijo y sin `@2x`; el
 * mapa pide los tiles de la vista, con `@2x`. Cualquier diferencia —un tile que
 * el proveedor no tiene en ese estilo, un zoom fuera de rango, un corte
 * puntual en esa sola request— se convierte en un aviso falso sobre un mapa
 * que anda.
 *
 * Y un aviso que aparece cuando no pasa nada es peor que no tener aviso: se
 * aprende a ignorarlo, y el día que el mapa falle de verdad nadie lo va a leer.
 * Es el mismo defecto que sacamos del "se reintentará automáticamente" de la
 * cola offline.
 *
 * Ahora se miran **los tiles de verdad**: el componente cuenta cuántos
 * cargaron y cuántos fallaron, escuchando los eventos de las imágenes que el
 * mapa ya pide. Sin request extra.
 *
 * ── LAS DOS CONDICIONES, Y POR QUÉ HACEN FALTA LAS DOS ──────────────────────
 * - `cargados === 0`: si UN solo tile cargó, el mapa funciona. Es lo que
 *   impide el falso positivo: el caso que falló tenía tiles cargando.
 * - `fallidos >= MINIMO_FALLOS`: un tile suelto que falla es normal —el borde
 *   del mundo, un corte de un segundo— y no es motivo para un cartel.
 */
export const MINIMO_FALLOS = 3

export function decidirFallo(estado: {
  hayKey: boolean
  cargados: number
  fallidos: number
}): FalloMapa | null {
  if (!estado.hayKey) return 'sin_key'
  if (estado.cargados === 0 && estado.fallidos >= MINIMO_FALLOS) return 'tiles_no_cargan'
  return null
}

// ── Los links de los controles ───────────────────────────────────────────────

/**
 * El href de un control del mapa, conservando lo que la ruta base ya traiga.
 *
 * ── POR QUÉ NO SE ARMA A MANO EN LA PANTALLA ────────────────────────────────
 * Porque ya nos mordió una vez. `hrefPunto` de la serie mensual pegaba un `?`
 * fijo, y el panel de la distribuidora —que monta la serie con
 * `?alcance=<marca>`— perdía el alcance al tocar un punto: la pantalla volvía
 * al estado sin elegir y el desglose que se pedía no se dibujaba nunca.
 *
 * El mapa de la distri tiene exactamente la misma forma: su ruta base lleva el
 * alcance, y encima tiene DOS controles que se combinan entre sí. Escribir esa
 * mezcla a mano en cada pantalla es reproducir el bug con más superficie.
 *
 * Un valor `null` o vacío BORRA ese parámetro, que es lo que hace "Todos mis
 * PDV" y "Presencia" —las opciones por default de cada control— sin dejar
 * `?campana=` colgando.
 */
/**
 * El modo que pide la URL, o `'presencia'`.
 *
 * ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN TERNARIO EN CADA PÁGINA ─────────────
 * Las dos páginas del mapa tenían escrito `=== 'tipo' ? 'tipo' : 'presencia'`, y
 * al agregar el tercer modo **ninguna de las dos se actualizó**: `?pintar=
 * cobertura` se convertía en `'presencia'` antes de llegar al componente, así
 * que el control aparecía, se podía tocar, y la pantalla volvía sola a
 * Presencia. Un valor nuevo que no se agrega a un parser no falla: se degrada en
 * silencio al default, que es la peor forma de romperse.
 *
 * Con esto, agregar un modo es agregarlo a `CATEGORIAS` y nada más — el parser
 * sale de ahí, así que no hay una segunda lista que se pueda quedar vieja.
 */
export function modoDesde(valor: string | null | undefined): ModoPintado {
  return valor && valor in CATEGORIAS ? (valor as ModoPintado) : 'presencia'
}

/** Todo lo que la pantalla del mapa lleva en la URL. */
export type EstadoDelMapa = {
  alcance?: string | null
  campana?: string | null
  pintar?: ModoPintado | null
}

/**
 * El link a la MISMA pantalla con un cambio aplicado sobre el estado actual.
 *
 * ── POR QUÉ NO ALCANZABA CON `hrefMapa` ─────────────────────────────────────
 * `hrefMapa` mergea sobre la ruta que le den, y hace exactamente eso. El bug
 * estaba en lo que se le daba: la pantalla recibía un `rutaBase` armado con el
 * alcance y **sin la campaña**, así que el control de pintado —que mergea sobre
 * esa base— borraba el `?campana=` en cada click.
 *
 * Pasó desapercibido desde el 24/9/2026 porque perder la campaña en presencia o
 * en tipo no rompe nada visible: el mapa se ensancha a todos los PDV del
 * alcance y parece una decisión. Con cobertura se volvió ruidoso —el modo deja
 * de ser válido y la opción desaparece— pero el bug es el mismo y es anterior.
 *
 * Por eso la firma pide el ESTADO COMPLETO y no una ruta ya armada: no hay
 * forma de olvidarse una clave, que es lo único que hacía falta para romperlo.
 * Cada control dice qué cambia y el resto se conserva solo.
 */
export function hrefDelMapa(
  /** La ruta sin query. */
  ruta: string,
  estado: EstadoDelMapa,
  cambio: EstadoDelMapa = {},
): string {
  const final = { ...estado, ...cambio }
  return hrefMapa(ruta, {
    alcance: final.alcance ?? null,
    campana: final.campana ?? null,
    // `presencia` es el default y no se escribe: si se escribiera habría dos
    // URLs para la misma pantalla y la de arriba sería la más larga.
    pintar: final.pintar && final.pintar !== 'presencia' ? final.pintar : null,
  })
}

export function hrefMapa(
  rutaBase: string,
  params: Record<string, string | null | undefined>,
): string {
  const [ruta, queryBase = ''] = rutaBase.split('?')
  const q = new URLSearchParams(queryBase)

  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') q.delete(k)
    else q.set(k, v)
  }

  const s = q.toString()
  return s ? `${ruta}?${s}` : ruta
}
