/**
 * lib/alcance-revision.ts — quién puede revisar QUÉ foto.
 *
 * ── EL AGUJERO QUE ESTO CIERRA ──────────────────────────────────────────────
 * Las cuatro actions de aprobación —distri, repositora, marca y admin— recibían
 * un `fotoId` del cliente y preguntaban una sola cosa:
 *
 *     const { data: { user } } = await supabase.auth.getUser()
 *     if (!user) redirect('/auth')
 *
 * O sea: *¿hay alguien logueado?* **De quién es la campaña de esa foto no se
 * preguntaba nunca.** Cualquier distribuidora autenticada podía aprobar la foto
 * de la campaña de otra, y aprobar una foto dispara `actualizarEstadoMision`,
 * que cuando la misión queda completa libera el bounty retenido y **acredita
 * puntos**. El middleware no cubre esto: chequea `pathname.startsWith(
 * '/distribuidora')`, no CUÁL distribuidora.
 *
 * Medido el 25/9/2026, antes de arreglarlo: 1590 puntos en fotos pendientes en
 * dev y 160 en producción quedaban al alcance de cualquier actor autenticado.
 * Es poco porque prod es chica, no porque algo lo frenara — y
 * `accionMasivaDistri` lo hace con N fotos en una sola llamada.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 * **El id del objeto viene del cliente; el alcance se deriva de la sesión; y la
 * action verifica que el objeto caiga adentro.**
 *
 * No es una regla nueva: es lo que ya hace `retirarFoto` con
 * `if (foto.gondolero_id !== user.id)`, y lo que hace `idsDe()` de
 * `lib/campanas-de.ts` para el panel —*la lista ES el permiso*—. Lo único que
 * faltaba era aplicarla donde se paga.
 *
 * Ojo con la tentación de "sacar el id de la firma": esa regla vale cuando el
 * parámetro es **el id de la entidad del que llama** (`marcarNotificaciones-
 * DistriLeidas(distriId)`). Acá el parámetro es el id del OBJETO y no se puede
 * derivar de nada. Por eso hace falta esta otra mitad.
 *
 * ── DE DÓNDE SALE CADA ALCANCE ──────────────────────────────────────────────
 * No se inventó ninguno: cada uno es el mismo predicado que ya usa la PANTALLA
 * que lista esas fotos. Que la action y la lista coincidan es el punto —
 * el 25/9 encontramos el caso inverso (`puedeTocar` más permisivo que la
 * bandeja) y antes el caso simétrico (`puedeTocar` preveía el comercio sin
 * campaña **para la acción y no para la lista**).
 *
 *   distribuidora  campanas.distri_id = perfil.distri_id
 *                  (app/(distribuidora)/distribuidora/gondolas/page.tsx:197)
 *   marca          campanas.marca_id  = perfil.marca_id
 *                  (app/(marca)/marca/gondolas/page.tsx:91)
 *   repositora     campanas.repositora_id = repoId, O una relación ACTIVA con
 *                  la distri o la marca dueña de la campaña
 *                  (app/(repositora)/repositora/campanas/[id]/resultados/page.tsx:45)
 *   admin          todas
 *   gondolero/fixer  ninguna — no revisan fotos
 *
 * La repositora entra desde el principio y no después: su action es un
 * `export` de la de distribuidora, así que arreglar tres de cuatro paneles es
 * dejar la puerta abierta con más trabajo hecho.
 *
 * ── Y EL ESTADO, QUE ES OTRO PROBLEMA EN LAS MISMAS LÍNEAS ──────────────────
 * Ninguna de las tres aprobaciones de a una miraba `estado` antes de escribir,
 * y `movimientos_puntos` no tiene índice único: **reaprobar una foto legacy
 * vuelve a acreditar**. Eso no lo arregla el permiso —lo puede hacer el dueño
 * legítimo, con dos clicks— así que el estado se chequea acá, junto al alcance,
 * porque son la misma lectura.
 *
 * `estados` NO tiene default, a propósito. Un parámetro que decide qué
 * significa lo que devuelve la función no lleva default: el default lo vuelve
 * opcional para el compilador y obligatorio para la verdad. Cada call site
 * declara qué estados acepta, y `cambiarEstadoFoto('archivada')` acepta otros
 * que `aprobarFoto`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

/**
 * Quién está revisando. Se construye SOLO desde la sesión: que este tipo no
 * tenga forma de fabricarse desde un parámetro es medio arreglo.
 */
export type ActorRevisor =
  | { tipo: 'distribuidora'; id: string }
  | { tipo: 'marca';         id: string }
  | { tipo: 'repositora';    id: string }
  | { tipo: 'admin' }

/** Lo mínimo para decidir. Cada action sigue haciendo su propio select. */
export type FotoRevisable = {
  id: string
  campanaId: string | null
  estado: string | null
}

export type Revisables = {
  /** Suyas Y en un estado elegible. Lo único sobre lo que se puede escribir. */
  permitidas: FotoRevisable[]
  /** Existen y NO son suyas. Una sola ya es un intento de tocar lo ajeno. */
  ajenas: string[]
  /** Suyas, pero ya no están en un estado elegible. Benigno: doble click. */
  fueraDeEstado: string[]
  /** No existen. */
  inexistentes: string[]
}

/**
 * El actor, a partir de su fila de `profiles`.
 *
 * Separada de la lectura de la sesión —que vive en `lib/actor-sesion.ts`, que
 * es el único que importa `next/headers`— para que TODA la decisión de permiso
 * de este archivo se pueda probar con ids reales y sin un request. El control
 * `probar-alcance-revision.mts` depende de eso.
 *
 * Devuelve `null` si no hay perfil o si el tipo de actor no revisa fotos.
 * `null` es denegación, no "seguí igual".
 */
export function actorRevisorDePerfil(perfil: {
  tipo_actor: string | null
  distri_id: string | null
  marca_id: string | null
  repositora_id: string | null
} | null): ActorRevisor | null {
  if (!perfil) return null
  switch (perfil.tipo_actor) {
    case 'admin':         return { tipo: 'admin' }
    case 'distribuidora': return perfil.distri_id     ? { tipo: 'distribuidora', id: perfil.distri_id }     : null
    case 'marca':         return perfil.marca_id      ? { tipo: 'marca',         id: perfil.marca_id }      : null
    case 'repositora':    return perfil.repositora_id ? { tipo: 'repositora',    id: perfil.repositora_id } : null
    // gondolero, fixer, o un tipo nuevo que nadie enchufó acá: no revisan.
    // El default deniega — un actor que no conocemos no es un actor permitido.
    default:              return null
  }
}

/**
 * ¿Esta campaña cae adentro del alcance del actor?
 *
 * Separada y exportada porque es la decisión, y se prueba sola contra ids
 * reales sin necesitar una sesión.
 */
export async function campanaEnAlcance(
  campanaId: string | null,
  actor: ActorRevisor,
  admin: Admin,
): Promise<boolean> {
  if (actor.tipo === 'admin') return true
  // Una foto sin campaña no tiene dueño contra el cual contrastar. Se deniega:
  // ante la duda, el default seguro es que no. Hoy no hay ninguna (verificado),
  // y si aparece una es un dato roto que merece mirarse, no aprobarse.
  if (!campanaId) return false

  const { data, error } = await admin
    .from('campanas')
    .select('distri_id, marca_id, repositora_id')
    .eq('id', campanaId)
    .maybeSingle()

  if (error) {
    console.error('[alcance-revision] no se pudo leer la campaña:', error.message)
    return false
  }
  if (!data) return false
  const c = data as { distri_id: string | null; marca_id: string | null; repositora_id: string | null }

  if (actor.tipo === 'distribuidora') return c.distri_id === actor.id
  if (actor.tipo === 'marca')         return c.marca_id === actor.id

  // ── Repositora ────────────────────────────────────────────────────────────
  // Tres caminos, los mismos tres que ya usa su pantalla de resultados: la
  // campaña es directamente suya, o tiene una relación ACTIVA con la distri
  // dueña, o con la marca dueña. El `estado = 'activa'` no es opcional: una
  // relación terminada no da acceso al trabajo que quedó atrás.
  if (c.repositora_id === actor.id) return true

  const [porDistri, porMarca] = await Promise.all([
    c.distri_id
      ? admin.from('distri_repo_relaciones').select('id')
          .eq('repositora_id', actor.id).eq('distri_id', c.distri_id).eq('estado', 'activa').maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    c.marca_id
      ? admin.from('marca_repo_relaciones').select('id')
          .eq('repositora_id', actor.id).eq('marca_id', c.marca_id).eq('estado', 'activa').maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (porDistri.error) console.error('[alcance-revision] distri_repo_relaciones:', porDistri.error.message)
  if (porMarca.error)  console.error('[alcance-revision] marca_repo_relaciones:',  porMarca.error.message)

  return porDistri.data !== null || porMarca.data !== null
}

/**
 * El guard. Clasifica las fotos pedidas en cuatro grupos y no escribe nada.
 *
 * Una sola definición para el caso de a una y para el masivo: el masivo pasa su
 * arreglo, el singular pasa `[fotoId]`. Dos funciones serían dos criterios, y
 * este proyecto ya pagó tres veces que dos copias de un criterio se separen.
 *
 * @param estados Los estados que el call site acepta. Sin default: ver el
 *                encabezado.
 */
export async function fotosQuePuedeRevisar(params: {
  fotoIds: string[]
  actor: ActorRevisor
  estados: string[]
  admin: Admin
}): Promise<Revisables> {
  const { fotoIds, actor, estados, admin } = params
  const vacio: Revisables = { permitidas: [], ajenas: [], fueraDeEstado: [], inexistentes: [] }
  if (fotoIds.length === 0) return vacio

  const { data, error } = await admin
    .from('fotos')
    .select('id, campana_id, estado')
    .in('id', fotoIds)

  if (error) {
    // No se deniega en silencio ni se deja pasar: no se sabe. Todo a
    // `inexistentes` hace que el call site no escriba nada, que es lo correcto
    // cuando no se pudo decidir.
    console.error('[alcance-revision] no se pudieron leer las fotos:', error.message)
    return { ...vacio, inexistentes: [...fotoIds] }
  }

  const filas = (data ?? []) as { id: string; campana_id: string | null; estado: string | null }[]
  const porId = new Map(filas.map(f => [f.id, f]))

  const out: Revisables = { permitidas: [], ajenas: [], fueraDeEstado: [], inexistentes: [] }

  // Las campañas se resuelven una sola vez aunque vengan 50 fotos de la misma:
  // el masivo del panel selecciona de una lista ya filtrada por campaña.
  const cache = new Map<string, boolean>()
  const enAlcance = async (campanaId: string | null): Promise<boolean> => {
    const clave = campanaId ?? '∅'
    const visto = cache.get(clave)
    if (visto !== undefined) return visto
    const r = await campanaEnAlcance(campanaId, actor, admin)
    cache.set(clave, r)
    return r
  }

  for (const id of fotoIds) {
    const f = porId.get(id)
    if (!f) { out.inexistentes.push(id); continue }
    if (!(await enAlcance(f.campana_id))) { out.ajenas.push(id); continue }
    // El alcance se chequea ANTES que el estado a propósito: si se hiciera al
    // revés, una foto ajena YA aprobada caería en `fueraDeEstado` y el intento
    // de tocar lo ajeno no quedaría registrado en ningún lado.
    if (!estados.includes(f.estado ?? '')) { out.fueraDeEstado.push(id); continue }
    out.permitidas.push({ id: f.id, campanaId: f.campana_id, estado: f.estado })
  }

  return out
}

/**
 * El caso de a una, que es el de las tres aprobaciones singulares.
 *
 * **Tira si la foto es ajena, y devuelve `null` si simplemente no hay nada que
 * hacer.** La asimetría es deliberada:
 *
 *  · Ajena no es un camino legítimo de la UI: es un bug o un ataque. Y las
 *    pantallas ignoran el valor de retorno de estas actions —`await
 *    aprobarFoto(fotoId)` y nada más—, así que devolver `{ error }` sería un
 *    no-op mudo, que en pantalla se ve **idéntico a que anduvo**. Lo peor
 *    posible para una denegación.
 *  · Fuera de estado SÍ es legítimo: dos revisores clickean a la vez, o alguien
 *    hace doble click. Ahí no hay nada que hacer y no hay nada que avisar: la
 *    foto ya está como se la quería dejar.
 */
export async function exigirFotoRevisable(params: {
  fotoId: string
  actor: ActorRevisor | null
  estados: string[]
  admin: Admin
  /** Para el log. El panel desde el que se llamó. */
  desde: string
}): Promise<FotoRevisable | null> {
  const { fotoId, actor, estados, admin, desde } = params

  if (!actor) {
    console.error(`[alcance-revision] ${desde}: sin actor que pueda revisar fotos.`)
    throw new Error('No tenés permiso para revisar fotos.')
  }

  const r = await fotosQuePuedeRevisar({ fotoIds: [fotoId], actor, estados, admin })

  if (r.ajenas.length > 0) {
    console.error(
      `[alcance-revision] ${desde}: ${actor.tipo}` +
      `${'id' in actor ? ' ' + actor.id : ''} intentó revisar la foto ${fotoId}, ` +
      `que es de otra campaña.`
    )
    throw new Error('Esa foto no es de una campaña tuya.')
  }

  if (r.inexistentes.length > 0) return null
  if (r.fueraDeEstado.length > 0) {
    console.warn(`[alcance-revision] ${desde}: la foto ${fotoId} ya no está en ${estados.join('|')}.`)
    return null
  }

  return r.permitidas[0] ?? null
}

/** Los estados sobre los que tiene sentido decidir. Una sola definición. */
export const ESTADOS_REVISABLES = ['pendiente', 'en_revision']
