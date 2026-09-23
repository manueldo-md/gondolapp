/**
 * lib/panel-distri.ts — lo que el panel de métricas tiene de propio cuando lo
 * mira una distribuidora.
 *
 * El rollup, las series y la cobertura son los mismos que los de marca
 * (`lib/panel-metricas.ts`) y las funciones de la base también
 * (`panel_series` / `panel_visitas` / `panel_pdv`). Lo que cambia son dos cosas,
 * y las dos viven acá:
 *
 *   1. **El alcance hay que elegirlo**, porque una distri ejecuta campañas de
 *      varias marcas y esos números no se suman.
 *   2. **El número cambia respecto de lo que la distri veía antes**, y eso hay
 *      que decirlo en pantalla mientras sea cierto.
 */
import type { Alcance } from './campanas-de'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** La clave que viaja en la URL para las campañas propias de la distri. */
export const CLAVE_PROPIAS = 'propias'

/** Una opción del selector de alcance. */
export type OpcionAlcance = {
  /** El `marca_id`, o `CLAVE_PROPIAS`. Es lo que va en la query string. */
  clave: string
  etiqueta: string
  campanas: number
}

/**
 * Los grupos entre los que la distribuidora elige: una opción por marca que
 * ejecuta, más las campañas propias si tiene alguna.
 *
 * ── POR QUÉ NO HAY OPCIÓN "TODAS" ───────────────────────────────────────────
 * Porque el número que produciría no sería de nadie. Presencia mezcla dos
 * marcas: el 80% de Georgalos y el 64% de Suprante darían un 74% que no
 * describe a ninguna de las dos, y sobre el que no se puede tomar una decisión.
 * Es el mismo error que promediar promedios de campañas con distinto N, que en
 * el tramo del panel daba $2.140 contra $3.516 reales.
 *
 * Las opciones salen de los datos: si la distri deja de ejecutar campañas de
 * una marca, esa opción desaparece sola. Una lista escrita a mano envejecería.
 */
export async function opcionesDeDistri(distriId: string, admin: Admin): Promise<OpcionAlcance[]> {
  const { data, error } = await admin
    .from('campanas')
    .select('id, marca_id, marcas(razon_social)')
    .eq('distri_id', distriId)

  if (error) {
    console.error('[panel distri] opciones:', error.message)
    return []
  }

  type Fila = { id: string; marca_id: string | null; marcas: { razon_social: string } | null }
  const porClave = new Map<string, OpcionAlcance>()

  for (const f of (data ?? []) as Fila[]) {
    const clave = f.marca_id ?? CLAVE_PROPIAS
    // El embed de PostgREST puede venir como objeto o como arreglo según la
    // cardinalidad que infiera. Se normaliza acá y no en cada lectura.
    const embed = f.marcas as unknown
    const nombre = Array.isArray(embed)
      ? (embed[0] as { razon_social?: string } | undefined)?.razon_social
      : (embed as { razon_social?: string } | null)?.razon_social

    const etiqueta = f.marca_id
      ? (nombre ?? 'Marca sin nombre')
      : 'Mis campañas propias'

    const ya = porClave.get(clave)
    if (ya) ya.campanas++
    else porClave.set(clave, { clave, etiqueta, campanas: 1 })
  }

  // Las propias al final: son las que la distri ya conoce de memoria, y las de
  // marca son las que vino a mirar.
  return [...porClave.values()].sort((a, b) =>
    a.clave === CLAVE_PROPIAS ? 1 :
    b.clave === CLAVE_PROPIAS ? -1 :
    a.etiqueta.localeCompare(b.etiqueta))
}

/**
 * La clave de la URL al alcance, validada contra las opciones que existen.
 *
 * Devuelve `null` cuando no hay selección o cuando la clave no es una de las
 * opciones de esta distri. **`null` no significa "mostrale todo"**: significa
 * que la pantalla no dibuja números y pide que elija. El control es obligatorio
 * y no tiene default, y esto es lo que lo hace cierto: un default escondido
 * —"si no eligió, la primera"— haría que la distri lea un número creyendo que
 * es de otra marca.
 *
 * Y es además el filtro de autorización: una clave que no está entre sus
 * opciones no se convierte en un alcance, así que un `marca_id` puesto a mano
 * en la URL no produce ninguna consulta.
 */
export function alcanceDesde(
  clave: string | undefined | null,
  distriId: string,
  opciones: OpcionAlcance[],
): Alcance | null {
  if (!clave) return null
  if (!opciones.some(o => o.clave === clave)) return null
  return clave === CLAVE_PROPIAS
    ? { tipo: 'distri-propias', distriId }
    : { tipo: 'distri-marca', distriId, marcaId: clave }
}

// ─────────────────────────────────────────────────────────────────────────────
// EL AVISO DE QUE EL NÚMERO CAMBIÓ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que entra y lo que sale al pasar de contar POR GONDOLERO a contar POR
 * CAMPAÑA.
 *
 * El dashboard viejo de la distribuidora cuenta la actividad de SUS GONDOLEROS,
 * vayan a la campaña que vayan. El panel cuenta las misiones de SUS CAMPAÑAS,
 * las haga quien las haga. Los dos son defendibles y miden cosas distintas, y
 * en producción no dan lo mismo: Biomega ve 100 por gondolero y 92 por campaña.
 *
 * Esa diferencia no se puede dejar sin explicar. Un número que baja de 100 a 92
 * sin que nadie diga por qué se lee como un error del sistema, y a partir de
 * ahí no se le cree a ninguno de los dos.
 */
export type DesvioDeScope = {
  /** Misiones de sus gondoleros en campañas que no son suyas. Salen del panel. */
  fueraDeSusCampanas: number
  /** Misiones en sus campañas hechas por gondoleros de otra distri. Entran. */
  deOtrosGondoleros: number
}

/**
 * Se mide sobre TODAS las campañas de la distri y no sobre el grupo elegido:
 * la pregunta que contesta es "por qué el panel no da lo mismo que el
 * dashboard", y el dashboard no tiene grupos.
 *
 * Las dos consultas piden solo el conteo (`head: true`), así que no traen
 * filas y no las alcanza el tope de 1.000 de PostgREST.
 */
export async function desvioDeScope(
  gondoleroIds: string[],
  campanaIds: string[],
  admin: Admin,
): Promise<DesvioDeScope> {
  const vacio = { fueraDeSusCampanas: 0, deOtrosGondoleros: 0 }
  if (gondoleroIds.length === 0 && campanaIds.length === 0) return vacio

  const lista = (ids: string[]) => `(${ids.join(',')})`
  const VIVAS = ['descartada', 'rechazada']

  const [fuera, ajenos] = await Promise.all([
    gondoleroIds.length > 0 && campanaIds.length > 0
      ? admin.from('misiones').select('id', { count: 'exact', head: true })
          .in('gondolero_id', gondoleroIds)
          .not('campana_id', 'in', lista(campanaIds))
          .not('estado', 'in', `(${VIVAS.join(',')})`)
      : Promise.resolve({ count: 0, error: null }),
    campanaIds.length > 0 && gondoleroIds.length > 0
      ? admin.from('misiones').select('id', { count: 'exact', head: true })
          .in('campana_id', campanaIds)
          .not('gondolero_id', 'in', lista(gondoleroIds))
          .not('estado', 'in', `(${VIVAS.join(',')})`)
      : Promise.resolve({ count: 0, error: null }),
  ])

  if (fuera.error || ajenos.error) {
    console.error('[panel distri] desvío de scope:',
      fuera.error?.message ?? ajenos.error?.message)
    // Sin el dato no se inventa el aviso. Mejor no decir nada que decir un
    // número inventado sobre la contabilidad de alguien.
    return vacio
  }

  return {
    fueraDeSusCampanas: fuera.count ?? 0,
    deOtrosGondoleros:  ajenos.count ?? 0,
  }
}

/**
 * El texto del aviso, o `null` si no hay nada que avisar.
 *
 * **Se apaga solo.** Cuando las dos cifras son cero —porque todas las misiones
 * de sus gondoleros son de sus campañas— el aviso no se renderiza. No hay
 * ninguna fecha ni ninguna bandera que apagar a mano: el día que los dos
 * criterios coincidan, desaparece.
 *
 * Eso no es un detalle de implementación. Un aviso permanente enseña a
 * ignorarlo, y ese es el defecto que este proyecto ya sacó del "se reintentará
 * automáticamente" de la cola offline y del tilde verde de las alertas.
 */
export function textoDesvio(d: DesvioDeScope): string | null {
  const partes: string[] = []

  if (d.fueraDeSusCampanas > 0) {
    partes.push(
      `${d.fueraDeSusCampanas} ${d.fueraDeSusCampanas === 1 ? 'misión' : 'misiones'} de tus ` +
      `gondoleros ${d.fueraDeSusCampanas === 1 ? 'quedó' : 'quedaron'} afuera, porque ` +
      `${d.fueraDeSusCampanas === 1 ? 'es' : 'son'} de campañas que no son tuyas`)
  }
  if (d.deOtrosGondoleros > 0) {
    partes.push(
      `${d.deOtrosGondoleros} ${d.deOtrosGondoleros === 1 ? 'misión' : 'misiones'} de tus ` +
      `campañas ${d.deOtrosGondoleros === 1 ? 'la hizo' : 'las hicieron'} ` +
      `${d.deOtrosGondoleros === 1 ? 'un gondolero' : 'gondoleros'} de otra distribuidora, ` +
      `así que ${d.deOtrosGondoleros === 1 ? 'entra' : 'entran'} acá y no ` +
      `${d.deOtrosGondoleros === 1 ? 'estaba' : 'estaban'} en tu tablero`)
  }
  if (partes.length === 0) return null

  return `Este panel cuenta por CAMPAÑA y tu tablero cuenta por GONDOLERO. ` +
    `Hoy la diferencia es: ${partes.join('; y ')}.`
}
