/**
 * lib/zonas-gondolero.ts — "¿qué localidades cubre este gondolero?"
 *
 * ETAPA 8 del tramo "localidad_id en el alta de comercio".
 *
 * ── LA ZONA SE GUARDA AL NIVEL QUE ELIGIÓ, Y SE EXPANDE AL LEER ─────────────
 * `gondolero_localidades` guarda `(nivel, ref_id)`: provincia, departamento o
 * localidad. Antes guardaba solo localidades, así que "todas las del
 * departamento" se expandía al persistir y **quedaba vieja cuando el padrón
 * crecía**: el gondolero dejaba de cubrir un pueblo nuevo de su propio
 * departamento sin enterarse.
 *
 * Expandir al LEER invierte eso: la lista se calcula contra el padrón de hoy.
 *
 * ── POR QUÉ EN TYPESCRIPT Y NO EN LA CONSULTA ───────────────────────────────
 * Resolverlo con un `OR` de tres subqueries o una CTE metería **la regla de
 * expansión en SQL**, y entonces existiría en dos lugares el día que algo más
 * necesite la misma respuesta. Es la trampa que `lib/fecha-ar.ts` tiene
 * documentada con la semana: una definición que vive en dos lenguajes se
 * separa, y la que queda vieja no falla, contesta distinto.
 *
 * Acá la regla vive en una función y los lectores reciben lo de siempre: una
 * lista de `localidad_id`.
 *
 * ── EL LÍMITE, ANOTADO ANTES DE QUE MOLESTE ─────────────────────────────────
 * La lista termina en un `.in()`. Expandir Buenos Aires son **252 ids** y Entre
 * Ríos 143, así que hoy entra cómodo. Con cinco provincias grandes serían ~700,
 * y ahí la URL de PostgREST empieza a pesar.
 *
 * Cuando moleste, **la salida es invertir la pregunta**: en vez de listar mis
 * localidades y preguntar si la campaña está en ellas, preguntar si la
 * localidad de la campaña cae bajo alguna de mis zonas — que son pocas filas.
 * Eso es un cambio de forma en los dos lectores, no en esta función.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type NivelZona = 'provincia' | 'departamento' | 'localidad'

export interface ZonaGondolero {
  nivel: NivelZona
  refId: number
}

/**
 * Las zonas declaradas, tal como se guardaron. Para la pantalla del perfil, que
 * tiene que mostrar "toda la provincia" y no 143 tildes.
 */
export async function zonasDelGondolero(
  gondoleroId: string,
  admin: SupabaseClient,
): Promise<ZonaGondolero[]> {
  const { data, error } = await admin
    .from('gondolero_localidades')
    .select('nivel, ref_id')
    .eq('gondolero_id', gondoleroId)

  if (error) {
    // Falla CERRADA y lo dice: devolver [] en silencio se lee río abajo como
    // "no declaró zonas", que es fail-open —el gondolero ve todas las campañas—
    // y esconde el problema. Quien llama decide, pero enterado.
    console.error('[zonas] No se pudieron leer las zonas:', error.message)
    throw new Error('No se pudieron leer las zonas del gondolero')
  }
  return (data ?? []).map(z => ({ nivel: z.nivel as NivelZona, refId: z.ref_id as number }))
}

/**
 * Las localidades que cubre, expandiendo provincias y departamentos contra el
 * padrón de HOY.
 *
 * Dos consultas como mucho: las zonas, y las localidades de los niveles que
 * tenga. Si solo declaró localidades sueltas —el caso de hoy— la segunda no se
 * hace.
 */
export async function localidadesDelGondolero(
  gondoleroId: string,
  admin: SupabaseClient,
): Promise<number[]> {
  const zonas = await zonasDelGondolero(gondoleroId, admin)
  if (zonas.length === 0) return []
  return expandirZonas(zonas, admin)
}

/**
 * La expansión, separada para poder probarla y para que la use también el
 * editor de perfil sin volver a leer las zonas.
 */
export async function expandirZonas(
  zonas: ZonaGondolero[],
  admin: SupabaseClient,
): Promise<number[]> {
  const sueltas = zonas.filter(z => z.nivel === 'localidad').map(z => z.refId)
  const deptos  = zonas.filter(z => z.nivel === 'departamento').map(z => z.refId)
  const provs   = zonas.filter(z => z.nivel === 'provincia').map(z => z.refId)

  if (deptos.length === 0 && provs.length === 0) return [...new Set(sueltas)]

  // Los departamentos de las provincias elegidas se suman a los elegidos
  // directamente, y de ahí salen las localidades. Dos saltos, no cuatro
  // niveles anidados: `localidades` no tiene `provincia_id` — ver la nota del
  // dump pre-incidente, que costó un embed apuntando a una columna inexistente.
  const todosLosDeptos = [...deptos]
  if (provs.length > 0) {
    const { data, error } = await admin
      .from('departamentos').select('id').in('provincia_id', provs)
    if (error) {
      console.error('[zonas] No se pudieron expandir las provincias:', error.message)
      throw new Error('No se pudieron expandir las zonas del gondolero')
    }
    todosLosDeptos.push(...(data ?? []).map(d => d.id as number))
  }

  if (todosLosDeptos.length === 0) return [...new Set(sueltas)]

  const { data, error } = await admin
    .from('localidades').select('id').in('departamento_id', [...new Set(todosLosDeptos)])
  if (error) {
    console.error('[zonas] No se pudieron expandir los departamentos:', error.message)
    throw new Error('No se pudieron expandir las zonas del gondolero')
  }

  return [...new Set([...sueltas, ...(data ?? []).map(l => l.id as number)])]
}

/**
 * Reemplaza las zonas del gondolero por las que llegan.
 *
 * Borra y vuelve a insertar, como antes. Lo que cambia es QUÉ se guarda: el
 * nivel elegido, no su expansión.
 */
export async function guardarZonasDelGondolero(
  gondoleroId: string,
  zonas: ZonaGondolero[],
  admin: SupabaseClient,
): Promise<{ error?: string }> {
  const { error: errBorrar } = await admin
    .from('gondolero_localidades').delete().eq('gondolero_id', gondoleroId)
  if (errBorrar) {
    console.error('[zonas] No se pudieron borrar las zonas:', errBorrar.message)
    return { error: 'No se pudieron guardar las zonas.' }
  }
  if (zonas.length === 0) return {}

  // Sin repetidos: la PK es (gondolero_id, nivel, ref_id) y un duplicado en el
  // payload haría fallar el insert ENTERO, perdiendo también las buenas.
  const vistas = new Set<string>()
  const filas = zonas
    .filter(z => { const k = z.nivel + ':' + z.refId; if (vistas.has(k)) return false; vistas.add(k); return true })
    .map(z => ({ gondolero_id: gondoleroId, nivel: z.nivel, ref_id: z.refId }))

  const { error } = await admin.from('gondolero_localidades').insert(filas)
  if (error) {
    // supabase-js devuelve el error en .error y no lo lanza. Sin este chequeo,
    // el borrado de arriba ya pasó y el gondolero se quedaría SIN zonas
    // creyendo que las guardó.
    console.error('[zonas] No se pudieron guardar las zonas:', error.message)
    return { error: 'No se pudieron guardar las zonas.' }
  }
  return {}
}

// ── Redundancia entre niveles ───────────────────────────────────────────────
// Una provincia entera ya contiene a sus departamentos y a sus localidades, así
// que tener las dos cosas es **la misma zona escrita dos veces**. No rompe nada
// —al expandir, esas localidades ya estaban— pero el chip muestra algo que no
// significa nada y, sobre todo, borrar uno de los dos no cambia la cobertura:
// el usuario saca "Colón" y sigue cubriendo Colón, sin entender por qué.
//
// El selector ya lo evitaba en UNA dirección: agregar la provincia reemplaza lo
// que hubiera de ella. Faltaba la otra, que es la que se prueba acá.
//
// La forma es estructural a propósito: `GrupoZona` es un tipo de la UI y esto
// no tiene por qué importarlo — alcanza con las tres claves que mira.

export interface ZonaConNivel {
  nivel: NivelZona
  provinciaId: number
  departamentoId: number
}

/** ¿Ya está toda esta provincia? Entonces nada de adentro agrega nada. */
export function provinciaYaCompleta(grupos: ZonaConNivel[], provinciaId: number | ''): boolean {
  if (provinciaId === '') return false
  return grupos.some(g => g.nivel === 'provincia' && g.provinciaId === provinciaId)
}

/**
 * ¿Ya está este departamento, sea suelto o completo?
 *
 * NO cuenta los grupos de provincia: ésos los cubre `provinciaYaCompleta`, que
 * da un mensaje distinto. Mezclarlos diría "este departamento ya fue agregado"
 * cuando lo que pasa es que está toda la provincia — y el usuario iría a buscar
 * un chip de departamento que no existe.
 */
export function departamentoYaAgregado(grupos: ZonaConNivel[], departamentoId: number | ''): boolean {
  if (departamentoId === '') return false
  return grupos.some(g => g.nivel !== 'provincia' && g.departamentoId === departamentoId)
}
