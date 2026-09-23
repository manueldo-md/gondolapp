/**
 * lib/campanas-de.ts — el ÚNICO lugar que contesta "cuáles son las campañas de X".
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Las tres funciones del panel (`panel_series`, `panel_visitas`, `panel_pdv`)
 * dejaron de filtrar por dueño y pasaron a recibir una LISTA DE CAMPAÑAS
 * (migración `20260928100000`). El cuerpo del SQL es el mismo para una marca y
 * para una distribuidora; lo único que cambia es quién arma la lista.
 *
 * Eso vive acá y en ningún otro lado. Si cada pantalla armara la suya, la
 * pregunta "qué campañas ve este actor" quedaría escrita cinco veces, y el día
 * que cambie —campañas conjuntas, ejecución por repositora, exclusiones— cuatro
 * se quedarían viejas en silencio. Ya pasó en este proyecto con
 * `comercios_relevados`, con la doble lectura de `foto_respuestas` y con el mapa
 * de tipos de comercio.
 *
 * ── LA LISTA ES EL PERMISO ──────────────────────────────────────────────────
 * Ojo con esto, que es lo que cambió respecto de las funciones viejas.
 * `panel_marca_pdv(_marca_id, _campana_id)` filtraba por marca **y** por
 * campaña, así que un `campana_id` ajeno llegado por la URL simplemente no
 * devolvía nada: el dueño era la red de seguridad.
 *
 * `panel_pdv(_campanas)` no tiene dueño contra el cual contrastar. **El arreglo
 * que se le pasa ES la autorización.** Por eso el filtro por una campaña no se
 * arma con lo que viene en la query string: se arma con `idsDe()`, que
 * intersecta lo pedido contra lo que el actor puede ver y devuelve vacío si no
 * es suyo. Ninguna pantalla debería construir ese arreglo por su cuenta.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * De quién es el panel.
 *
 * Es una unión discriminada y no dos funciones para que agregar un actor sea
 * agregar una rama acá, y no un camino nuevo en una pantalla. La etapa del
 * panel de distribuidora suma el caso "las campañas de tal marca que ejecuta
 * esta distri", que es una rama más y no otra función.
 */
export type Alcance =
  | { tipo: 'marca';  marcaId: string }
  | { tipo: 'distri'; distriId: string }

/** Lo que el panel necesita de una campaña. Un solo select para los dos actores. */
export type CampanaDelPanel = {
  id: string
  nombre: string
  estado: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
}

const SELECT = 'id, nombre, estado, fecha_inicio, fecha_fin'

/**
 * Las campañas del actor, con lo que las pantallas del panel necesitan.
 *
 * Devuelve las FILAS y no solo los ids a propósito: el dashboard usa el estado
 * y las fechas, y el mapa usa el nombre para el selector. Si devolviera ids,
 * cada pantalla tendría que volver a consultar `campanas` con su propio
 * `.eq('marca_id', …)` — o sea el predicado escrito de nuevo, que es justo lo
 * que este archivo viene a impedir.
 *
 * Ante un error devuelve `[]` y lo loguea. Un panel vacío es incómodo; un panel
 * con las campañas de otro sería otra cosa, y es lo que una lista parcial
 * podría producir si acá se tragara el error.
 */
export async function campanasDe(alcance: Alcance, admin: Admin): Promise<CampanaDelPanel[]> {
  // El orden por nombre no es cosmético: el selector de campañas del mapa lo
  // usaba con su propio `.order()`, y dejarlo acá evita que cada pantalla
  // ordene distinto la misma lista.
  const q = admin.from('campanas').select(SELECT).order('nombre')
  const { data, error } = await (
    alcance.tipo === 'marca'
      ? q.eq('marca_id', alcance.marcaId)
      : q.eq('distri_id', alcance.distriId)
  )

  if (error) {
    console.error(`[campanas-de] ${alcance.tipo}:`, error.message)
    return []
  }
  return (data ?? []) as CampanaDelPanel[]
}

/**
 * Los ids que se le pasan a las funciones del panel, con el filtro por una
 * campaña ya resuelto.
 *
 * `soloCampana` viene de la query string, o sea del usuario. **Nunca se pasa
 * derecho**: se intersecta contra lo que el actor puede ver.
 *
 * Una campaña que no está en la lista devuelve `[]` y no la lista entera. Es la
 * diferencia entre "no tenés datos de esa campaña" y "te muestro todo porque no
 * entendí lo que pediste", y la segunda es cómo un filtro se convierte en una
 * fuga. Es función pura para poder probar eso sin una base.
 */
export function idsDe(
  campanas: { id: string }[],
  soloCampana?: string | null,
): string[] {
  const todos = campanas.map(c => c.id)
  if (!soloCampana) return todos
  return todos.includes(soloCampana) ? [soloCampana] : []
}
