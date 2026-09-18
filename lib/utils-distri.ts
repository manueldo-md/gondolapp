import type { ContextoAcceso } from './acceso-campana'

// ── Helpers para relaciones gondolero ↔ distribuidora ────────────────────────
//
// El tipo se importa solo como TIPO: `lib/acceso-campana.ts` no importa nada y
// este archivo tampoco carga runtime ajeno.
//
// Fuente de verdad: gondolero_distri_solicitudes. NO profiles.distri_id.
//
// ── POR QUÉ NO LA COLUMNA ────────────────────────────────────────────────────
// `profiles.distri_id` tiene lugar para UNA distribuidora, y un gondolero puede
// trabajar para varias a la vez. El Walled Garden protege los DATOS de cada
// distri —la A no ve el trabajo que él hizo para la B—, no la exclusividad de
// la persona.
//
// Peor todavía: lo que la columna guarda depende de qué camino se usó. Si el
// gondolero ACEPTA una invitación, no se toca (queda la primera distri para
// siempre); si él SOLICITA y la distri aprueba, se pisa (queda la última). El
// mismo hecho produce dos resultados opuestos según quién apretó primero, así
// que la columna no dice "la principal": dice quién ganó una carrera.
//
// ── UN SOLO LUGAR ────────────────────────────────────────────────────────────
// Seis pantallas resolvían esta pregunta a mano y cada una podía derivar por su
// cuenta. La regla —qué estado significa "pertenece"— vive acá y en ningún otro
// lado. Si hace falta una variante nueva, se agrega una función en este archivo,
// no un `.eq('estado', ...)` suelto en una pantalla.

/**
 * Los dos significados posibles, escritos una sola vez.
 *
 * 'aprobada'  → el vínculo está vigente
 * 'terminada' → existió y se cortó (histórico)
 *
 * No hace falta deduplicar por gondolero: `UNIQUE (gondolero_id, distri_id)`
 * garantiza una fila por par, así que contar filas es contar personas.
 */
const ESTADOS_VIGENTE = ['aprobada']
const ESTADOS_CON_HISTORICO = ['aprobada', 'terminada']

function estadosDe(incluyeHistorico: boolean): string[] {
  return incluyeHistorico ? ESTADOS_CON_HISTORICO : ESTADOS_VIGENTE
}

/**
 * Los gondoleros de una distribuidora.
 *
 * `incluyeHistorico` viene en **false** a propósito. Casi siempre la pregunta
 * es "quiénes trabajan para mí hoy", y el histórico es la excepción: lo quiere
 * el panel de gondoleros, que muestra a los desvinculados en una sección
 * aparte. Con el default al revés, distraerse una vez devolvía a un
 * desvinculado al badge de alertas, al permiso de validar comercios y al conteo
 * del admin, sin que nadie escribiera una línea equivocada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGondolerosDeDistri(
  distriId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  incluyeHistorico: boolean = false
): Promise<string[]> {
  const { data, error } = await adminClient
    .from('gondolero_distri_solicitudes')
    .select('gondolero_id')
    .eq('distri_id', distriId)
    .in('estado', estadosDe(incluyeHistorico))

  // supabase-js no tira: un error vuelve acá con `data` en null y la pantalla
  // que llama se comporta como si la distri no tuviera un solo gondolero. Sin
  // este log, "no aparece nadie" y "falló la consulta" se ven igual.
  if (error) {
    console.error(
      '[getGondolerosDeDistri] no se pudo leer los vínculos — la pantalla va a mostrar cero gondoleros.',
      'distriId:', distriId, '—', error.message,
    )
    return []
  }

  return (data ?? []).map((d: { gondolero_id: string }) => d.gondolero_id)
}

/**
 * Cuántos gondoleros tiene cada distribuidora, en UNA consulta.
 *
 * Existe para el listado del admin, que necesita el número de varias distris a
 * la vez: llamar a `getGondolerosDeDistri` en un loop sería una consulta por
 * fila de la tabla. Usa los mismos estados, que es lo que importa — la regla
 * sigue definida una sola vez, arriba.
 *
 * Un gondolero en dos distribuidoras cuenta en las dos. Es correcto: la suma de
 * los conteos puede superar la cantidad de gondoleros distintos.
 */
export async function contarGondolerosPorDistri(
  distriIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  incluyeHistorico: boolean = false
): Promise<Map<string, number>> {
  const conteo = new Map<string, number>()
  if (distriIds.length === 0) return conteo

  const { data, error } = await adminClient
    .from('gondolero_distri_solicitudes')
    .select('distri_id')
    .in('distri_id', distriIds)
    .in('estado', estadosDe(incluyeHistorico))

  if (error) {
    console.error(
      '[contarGondolerosPorDistri] no se pudo leer los vínculos — el listado va a mostrar cero.',
      error.message,
    )
    return conteo
  }

  for (const fila of (data ?? []) as { distri_id: string }[]) {
    conteo.set(fila.distri_id, (conteo.get(fila.distri_id) ?? 0) + 1)
  }
  return conteo
}

/**
 * Las distribuidoras de un ACTOR, gondolero o fixer.
 *
 * Los fixers tienen su propia tabla —`fixer_distri_solicitudes`— así que
 * `getDistrisDeGondolero` les devuelve `[]` y los deja afuera de todo. Esta es
 * la que usan los gates, que corren para los dos.
 *
 * ── `momentoMs`: EL TRABAJO HECHO EN REGLA SE PAGA ──────────────────────────
 * Sin parámetro devuelve los vínculos vigentes AHORA. Con `momentoMs` incluye
 * además los que se terminaron DESPUÉS de ese momento, o sea los que el actor
 * tenía en ese instante.
 *
 * Existe por la cola offline: el gondolero capturó mientras estaba vinculado,
 * lo desvincularon, y sincroniza después. Ese trabajo se hizo en regla y
 * rechazarlo sería el mismo castigo tardío que ya sacamos del vencimiento —que
 * juzga por `capturadoAt` y no por la llegada— y del bloqueo por distancia.
 *
 * ── LÍMITE CONOCIDO ─────────────────────────────────────────────────────────
 * `UNIQUE (gondolero_id, distri_id)` deja UNA fila por par, así que `updated_at`
 * es la ÚLTIMA terminación y no hay historial de períodos. Si alguien se
 * vinculó, se fue, volvió y se fue de nuevo, una captura hecha durante el hueco
 * del medio pasa igual. Hoy no puede ocurrir —no hay ningún par con más de un
 * período en ninguna base— y el historial append-only ya está anotado como
 * pendiente. Sale caro y el error es a favor del gondolero.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDistrisDeActor(
  actorId: string,
  tipoActor: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  momentoMs?: number,
): Promise<string[]> {
  const esFixer = tipoActor === 'fixer'
  const tabla   = esFixer ? 'fixer_distri_solicitudes' : 'gondolero_distri_solicitudes'
  const columna = esFixer ? 'fixer_id' : 'gondolero_id'

  // Se piden las dos y se filtra en JS: `.or()` de PostgREST con una condición
  // sobre updated_at dentro es frágil, y son pocas filas por actor.
  const { data, error } = await adminClient
    .from(tabla)
    .select('distri_id, estado, updated_at')
    .eq(columna, actorId)
    .in('estado', ESTADOS_CON_HISTORICO)

  if (error) {
    console.error(
      '[getDistrisDeActor] no se pudo leer los vínculos.',
      'actorId:', actorId, 'tipo:', tipoActor, '—', error.message,
    )
    return []
  }

  type Fila = { distri_id: string; estado: string; updated_at: string | null }
  return (data ?? [])
    .filter((v: Fila) => {
      if (v.estado === 'aprobada') return true
      if (momentoMs === undefined) return false
      // Terminada: contaba si el corte fue DESPUÉS de la captura.
      if (!v.updated_at) return false
      return new Date(v.updated_at).getTime() > momentoMs
    })
    .map((v: Fila) => v.distri_id)
}

/**
 * Las distribuidoras de un gondolero. Devuelve varias: es la forma que espera
 * el lado del gondolero, que filtra campañas con `.in('distri_id', ...)`.
 *
 * Para los gates usar `getDistrisDeActor`, que también cubre fixers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDistrisDeGondolero(
  gondoleroId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any
): Promise<string[]> {
  const { data, error } = await adminClient
    .from('gondolero_distri_solicitudes')
    .select('distri_id')
    .eq('gondolero_id', gondoleroId)
    .eq('estado', 'aprobada')

  if (error) {
    console.error(
      '[getDistrisDeGondolero] no se pudo leer los vínculos — el gondolero va a ver cero campañas de distri.',
      'gondoleroId:', gondoleroId, '—', error.message,
    )
    return []
  }

  return (data ?? []).map((d: { distri_id: string }) => d.distri_id)
}

/**
 * Arma el `ContextoAcceso` que pide `accesoACampana`.
 *
 * Las dos consultas que hacen falta, en un solo lugar: los vínculos del actor y
 * las relaciones marca↔distri de esas distribuidoras. Antes cada puerta las
 * escribía a mano y por eso la del detalle se había quedado sin la segunda —
 * mostraba como disponible una campaña que `unirse` rechazaba al apretar.
 *
 * `momentoMs` se pasa SOLO desde la cola offline: ver `getDistrisDeActor`.
 */
export async function contextoAcceso(params: {
  actorId: string
  tipoActor: string | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
  momentoMs?: number
}): Promise<ContextoAcceso> {
  const { actorId, tipoActor, admin, momentoMs } = params
  const esFixer = tipoActor === 'fixer'

  // Los dos ejes. Un gondolero no tiene repositoras, así que esa consulta se
  // hace solo para fixers — donde además es LA que importa: sus campañas llevan
  // `repositora_id` y su vínculo vive en `fixer_repo_solicitudes`.
  const [misDistriIds, misRepoIds] = await Promise.all([
    getDistrisDeActor(actorId, tipoActor, admin, momentoMs),
    esFixer ? getReposDeFixer(actorId, admin, momentoMs) : Promise.resolve([]),
  ])

  if (misDistriIds.length === 0) {
    return { esFixer, misDistriIds: [], misRepoIds, relacionesMarcaDistri: [] }
  }

  const { data, error } = await admin
    .from('marca_distri_relaciones')
    .select('marca_id, distri_id')
    .in('distri_id', misDistriIds)
    .eq('estado', 'activa')

  if (error) {
    // Se loguea y se sigue con la lista vacía: el efecto es que las campañas de
    // marca sin distribuidora ejecutora quedan sin acceso. Es el lado seguro, y
    // sin este log "no tengo acceso" sería indistinguible de "falló la query".
    console.error(
      '[contextoAcceso] no se pudieron leer las relaciones marca-distri.',
      'actorId:', actorId, '—', error.message,
    )
  }

  return {
    esFixer,
    misDistriIds,
    misRepoIds,
    relacionesMarcaDistri: (data ?? []) as { marca_id: string; distri_id: string }[],
  }
}

/**
 * Las repositoras de un fixer. El eje paralelo a `getDistrisDeActor`.
 *
 * Existe porque los fixers se vinculan por `fixer_repo_solicitudes` y no por
 * `fixer_distri_solicitudes`: al 18/9/2026, los 6 fixers con misiones de prod
 * están todos ahí y ninguno en la de distribuidoras. Las campañas de fixers
 * llevan `repositora_id`, no `distri_id`.
 *
 * `momentoMs` funciona igual que en `getDistrisDeActor`: el trabajo capturado
 * antes del corte se honra.
 */
export async function getReposDeFixer(
  fixerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  momentoMs?: number,
): Promise<string[]> {
  const { data, error } = await adminClient
    .from('fixer_repo_solicitudes')
    .select('repositora_id, estado, updated_at')
    .eq('fixer_id', fixerId)
    .in('estado', ESTADOS_CON_HISTORICO)

  if (error) {
    console.error(
      '[getReposDeFixer] no se pudo leer los vínculos con repositoras.',
      'fixerId:', fixerId, '—', error.message,
    )
    return []
  }

  type Fila = { repositora_id: string; estado: string; updated_at: string | null }
  return (data ?? [])
    .filter((v: Fila) => {
      if (v.estado === 'aprobada') return true
      if (momentoMs === undefined || !v.updated_at) return false
      return new Date(v.updated_at).getTime() > momentoMs
    })
    .map((v: Fila) => v.repositora_id)
}
