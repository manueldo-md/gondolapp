// ── Helpers para relaciones gondolero ↔ distribuidora ────────────────────────
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
 * Las distribuidoras de un gondolero. Devuelve varias: es la forma que espera
 * el lado del gondolero, que filtra campañas con `.in('distri_id', ...)`.
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
