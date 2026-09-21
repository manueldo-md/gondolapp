/**
 * lib/campana-altas.ts
 * Qué es una campaña de ALTAS (`tipo='comercios'`) y en qué se diferencia.
 *
 * ── LAS DOS COSAS, OTRA VEZ ─────────────────────────────────────────────────
 * · **Alta oportunista** — el gondolero va a relevar, el comercio no está en la
 *   base, lo carga para poder hacer su misión. Es un medio. La paga el
 *   relevamiento, no el alta.
 * · **Campaña de altas** — el trabajo ES cargar el comercio. Paga por alta
 *   validada. GondolApp y las distribuidoras la usan para poblar el mapa.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
 * Hasta el 17/9/2026 el tipo `comercios` era un string que se escribía en la
 * columna y nada más: **ningún editor sabía qué era**. Se podía crear, pero
 * había que agregarle un campo al bloque —una pregunta o una foto— porque los
 * tres editores exigen al menos uno, y en una campaña de altas ese campo no se
 * muestra nunca. Dato muerto: en dev, la campaña sembrada tiene un campo que
 * dice "Fotografiá la góndola" en una campaña donde no hay góndola que
 * fotografiar, y nadie lo vio nunca.
 *
 * La regla vive acá porque los editores están duplicados en tres rutas (ver
 * "Deuda conocida" en CLAUDE.md) y ya tienen tres redacciones distintas del
 * mismo mensaje de error. Escribir la excepción tres veces era garantizar que
 * se separen.
 */

import type { TipoCampana } from '@/types'

/**
 * Los puntos que vale una misión de la campaña.
 *
 * `puntos_por_mision` manda y `puntos_por_foto` es el resto de las campañas
 * viejas. Vive acá —en un módulo sin dependencias— porque lo necesitan tanto la
 * validación del comercio (servidor, con service role) como el bloque de puntos
 * en camino, y ese no tiene que arrastrar el módulo de servidor al bundle.
 */
export function puntosDeLaCampana(campana: {
  puntos_por_mision?: number | null
  puntos_por_foto?: number | null
}): number {
  const porMision = campana.puntos_por_mision ?? 0
  if (porMision > 0) return porMision
  return campana.puntos_por_foto ?? 0
}

/** El trabajo de la campaña es dar de alta comercios. */
export function esCampanaDeAltas(tipo: string | null | undefined): boolean {
  return tipo === 'comercios'
}

/**
 * El bloque de una campaña de altas NO lleva campos.
 *
 * Con `tipo='comercios'` la captura toma un camino propio —Ubicación →
 * Formulario → Fachada— y **nunca renderiza `bloque_campos`**. El trabajo es el
 * alta: nombre, tipo, dirección, GPS, teléfono, encargado y fachada, y nada de
 * eso sale del bloque.
 *
 * El bloque en sí SÍ hace falta: `crearComercioNuevo` busca un `bloques_foto`
 * por `campana_id` para colgar la foto de fachada. Lo que sobra son los campos.
 */
export function requiereCamposDeBloque(tipo: string | null | undefined): boolean {
  return !esCampanaDeAltas(tipo)
}

/**
 * La única regla de "este bloque está bien configurado", para los tres editores
 * y sus tres actions.
 *
 * `campos` es la cantidad de campos ya validados (una pregunta con texto, o un
 * campo de tipo foto).
 */
export function validarBloqueCampana(params: {
  tipo: string | null | undefined
  campos: number
}): { ok: true } | { ok: false; error: string } {
  if (!requiereCamposDeBloque(params.tipo)) return { ok: true }
  if (params.campos > 0) return { ok: true }
  return { ok: false, error: 'El bloque debe tener al menos un campo configurado.' }
}

/**
 * Defaults del bloque de una campaña de altas.
 *
 * `tipo_contenido: 'ninguno'` es el valor cuya etiqueta en el editor dice
 * literalmente "Sin productos (stands, comercios, etc.)". La campaña sembrada en
 * prod tiene `'ambos'` —"Mis productos y competencia"— en una campaña que no
 * tiene productos: es lo que pasa cuando el editor no sabe qué está creando.
 */
export const BLOQUE_ALTAS = {
  tipoContenido: 'ninguno' as const,
  instruccion:   'Fotografiá la fachada del comercio',
  solicitarPrecio: false,
} as const

/**
 * Una campaña de altas es SIEMPRE puntual.
 *
 * Seguimiento significa volver al mismo comercio N veces por semana. No se da de
 * alta el mismo comercio tres veces: la segunda ya existe. Forzarlo acá evita
 * que el editor ofrezca una combinación que no significa nada — y de paso evita
 * el CHECK de `visitas_por_semana`, que es obligatorio en seguimiento.
 */
export const MODALIDAD_ALTAS = 'puntual' as const

/**
 * La foto de fachada es OBLIGATORIA en una campaña de altas.
 *
 * Es la única evidencia de que el comercio existe. Sin foto, el alta es una fila
 * en una tabla que nadie puede verificar, y hay puntos de por medio: quien
 * valida decidiría "este comercio existe" mirando un nombre, una dirección y un
 * punto de GPS que el mismo que cobra eligió dónde poner.
 *
 * **En el alta oportunista se queda opcional.** Ahí el gondolero no cobra por el
 * alta —la paga el relevamiento que está haciendo— así que exigirle la fachada
 * es fricción sobre una misión que ya está en curso, sin nada que proteger.
 */
export function requiereFotoFachada(tipo: string | null | undefined): boolean {
  return esCampanaDeAltas(tipo)
}

/**
 * Tipos que cada panel puede crear.
 *
 * **Marca no crea campañas de altas.** Una marca quiere relevar sus góndolas, no
 * poblar el mapa de GondolApp. El alta de comercios es infraestructura del canal
 * y la pagan quienes se benefician del mapa: GondolApp y las distribuidoras. Si
 * algún día una marca quiere financiar altas en una zona, se decide entonces;
 * hoy sería una opción más en un selector que nadie usaría bien.
 */
export const TIPOS_POR_PANEL: Record<'admin' | 'marca' | 'distribuidora', TipoCampana[]> = {
  admin:         ['relevamiento', 'precio', 'cobertura', 'pop', 'mapa', 'comercios'],
  marca:         ['relevamiento', 'precio', 'cobertura', 'pop', 'mapa'],
  distribuidora: ['interna', 'comercios'],
}

/** Un campo del bloque, como lo serializa el editor. */
export interface CampoBloqueSerializado {
  tipo: string
  pregunta: string
  opciones: string[]
  obligatorio: boolean
  orden: number
  /** Qué mide. `null`/ausente = sin métrica. Ver `lib/metricas.ts`. */
  metricaId?: string | null
}

/**
 * La fila de `bloque_campos`, en un solo lugar.
 *
 * **Estaba escrita cinco veces**, idéntica: las tres actions de campaña nueva y
 * los dos `republicarCampana` de draft. Agregar `metrica_id` significaba
 * acordarse de las cinco, y el modo de falla no es un error — es una métrica que
 * el creador eligió y que se pierde en silencio en el camino del draft.
 *
 * `orden` va aparte porque las dos familias lo calculan distinto: las actions lo
 * traen del editor, el draft lo deriva de la posición en el array.
 */
export interface CampoParaInsertar {
  tipo: string
  pregunta?: string | null
  opciones?: string[] | null
  obligatorio?: boolean
  metricaId?: string | null
}

export function filaBloqueCampo(campo: CampoParaInsertar, bloqueId: string, orden: number) {
  const opciones = (campo.opciones ?? []).filter(Boolean)
  return {
    bloque_id:   bloqueId,
    tipo:        campo.tipo,
    pregunta:    campo.pregunta?.trim() || (campo.tipo === 'foto' ? 'Fotografiá el producto' : ''),
    opciones:    opciones.length > 0 ? opciones : null,
    obligatorio: campo.obligatorio ?? true,
    orden,
    // Un campo de tipo foto no lleva métrica: una foto no es una medición
    // comparable, y el CHECK de `metricas.tipo_respuesta` tampoco acepta 'foto'.
    // Se limpia acá y no en la UI porque el tipo se puede cambiar después de
    // haber elegido la métrica.
    metrica_id:  campo.tipo === 'foto' ? null : (campo.metricaId ?? null),
  }
}

/**
 * Parsea el `campos_json` del editor y descarta lo que no está configurado.
 *
 * Un campo vale si tiene texto de pregunta, o si es de tipo foto (donde la
 * pregunta es opcional y se completa con un default al insertar).
 *
 * Estaba escrito igual en las tres actions. Acá además **no se traga el error de
 * parseo en silencio**: un JSON inválido devolvía `[]` y el usuario veía "el
 * bloque debe tener al menos un campo" después de haber cargado cinco.
 */
export function parsearCamposBloque(
  camposJson: string | null,
): { ok: true; campos: CampoBloqueSerializado[] } | { ok: false; error: string } {
  if (!camposJson) return { ok: true, campos: [] }
  try {
    const parsed = JSON.parse(camposJson) as CampoBloqueSerializado[]
    if (!Array.isArray(parsed)) return { ok: false, error: 'No se pudieron leer los campos del bloque.' }
    return { ok: true, campos: parsed.filter(c => c.tipo === 'foto' || c.pregunta?.trim()) }
  } catch {
    return { ok: false, error: 'No se pudieron leer los campos del bloque.' }
  }
}
