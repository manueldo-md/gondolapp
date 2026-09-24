/**
 * lib/alertas-distri.ts — qué puede decir la alerta de Quiebre de stock.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * La alerta se calculaba en TRES pantallas con la misma consulta copiada:
 *
 *     fotos.declaracion = 'producto_no_encontrado'
 *       AND estado = 'aprobada'
 *       AND created_at >= hace 7 días
 *
 * y las tres decían **"✅ Sin alertas de stock activas"** / "✅ Todo en orden"
 * cuando daba cero. Medido el 23/9/2026 en las dos bases:
 *
 *     producto_no_encontrado   22 filas, TODAS del 11 y 12 de marzo de 2026
 *     en los últimos 7 días     0
 *     en los últimos 90 días    0
 *
 * O sea que el verde no significaba "no hay quiebres": significaba "hace seis
 * meses que nadie mira". Es el mismo defecto que dejaba a Suprante en 0% de
 * presencia, una pantalla más allá — y es peor que no tener la alerta, porque
 * un tilde verde es una afirmación.
 *
 * ── Y LA FUENTE NO ERA LA QUE EL CATÁLOGO DECLARA ───────────────────────────
 * `metricas.fuentes` dice de dónde sale cada métrica. Para `quiebre_stock` es
 * `{respuestas}` y NADA MÁS: la declaración de la foto no es una fuente suya.
 * (Para `presencia` sí lo es, y por eso el panel de marca la lee.)
 *
 * Así que la consulta vieja no estaba solo vencida: leía una fuente que el
 * catálogo no reconoce para esa métrica. No se arregla moviendo la ventana de
 * 7 días.
 *
 * ── LO QUE ESTA ETAPA HACE Y LO QUE NO ──────────────────────────────────────
 * Hace: que las tres pantallas digan la verdad, que es que no se está midiendo.
 * NO hace: reconstruir la alerta sobre `mision_respuestas`. Eso necesita el
 * scope por campaña que viene en la etapa siguiente, y hacerlo antes sería
 * escribir a mano, en TypeScript, las reglas que ya viven en el SQL de
 * `panel_pdv` —las dos fuentes, el grano por (misión, fuente), los
 * estados de misión excluidos—. Duplicar esas reglas es duplicar lo que más
 * costó del tramo del panel.
 */

/** El estado se DERIVA del catálogo y de las campañas; no está escrito a mano. */
export type EstadoQuiebre =
  | { midiendo: false; campos: 0 }
  | { midiendo: true;  campos: number }

/**
 * Una campaña mide quiebre de stock si tiene al menos una pregunta tipificada
 * con esa métrica. Cero preguntas = la alerta no tiene de dónde salir.
 *
 * Se cuenta sobre las PREGUNTAS y no sobre las respuestas a propósito: una
 * campaña recién publicada, con la pregunta puesta y todavía sin una sola
 * misión, **sí** está midiendo. Contar respuestas la mostraría como un hueco
 * de configuración cuando es sólo una campaña que arranca.
 */
export function estadoQuiebre(camposTipificados: number): EstadoQuiebre {
  return camposTipificados > 0
    ? { midiendo: true,  campos: camposTipificados }
    : { midiendo: false, campos: 0 }
}

/**
 * Lo que se muestra donde antes iba el tilde verde.
 *
 * Los dos textos dicen un hecho y ninguno promete una fecha. El segundo existe
 * para que el día que alguien tipifique la pregunta la pantalla lo diga, en vez
 * de seguir mostrando "no se está midiendo" para siempre — que sería el mismo
 * error de hoy con el cartel cambiado.
 */
export function textoQuiebre(e: EstadoQuiebre): { titulo: string; detalle: string } {
  if (!e.midiendo) {
    return {
      titulo: 'No se está midiendo',
      detalle:
        'Ninguna de tus campañas tiene una pregunta tipificada con la métrica ' +
        '“Quiebre de stock”. Agregala al crear o editar la campaña y los quiebres ' +
        'empiezan a contarse desde la próxima misión.',
    }
  }
  return {
    titulo: 'Todavía sin leer',
    detalle:
      `Hay ${e.campos} pregunta${e.campos === 1 ? '' : 's'} tipificada${e.campos === 1 ? '' : 's'} ` +
      'con la métrica “Quiebre de stock”, y esta pantalla todavía no las lee. ' +
      'Las respuestas que entren quedan guardadas.',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Cuántas preguntas de estas campañas están tipificadas con esa métrica.
 *
 * Tres consultas planas en lugar de un embed con `!inner`: la cadena es
 * `bloques_foto → bloque_campos → metricas` y un filtro sobre una tabla
 * embebida depende del nombre de la FK, que es justo lo que este proyecto ya
 * aprendió a no adivinar (ver `localidades.provincia_id` en CLAUDE.md).
 *
 * Devuelve 0 ante cualquier error, y lo loguea. Un fallo de consulta acá
 * muestra "no se está midiendo", que es la lectura conservadora: no afirma que
 * todo esté en orden.
 */
export async function contarCamposTipificados(
  campanaIds: string[],
  slug: string,
  admin: Admin,
): Promise<number> {
  if (campanaIds.length === 0) return 0

  const [bloquesRes, metricaRes] = await Promise.all([
    admin.from('bloques_foto').select('id').in('campana_id', campanaIds),
    admin.from('metricas').select('id').eq('slug', slug).maybeSingle(),
  ])

  if (bloquesRes.error) {
    console.error('[alertas distri] bloques_foto:', bloquesRes.error.message)
    return 0
  }
  if (metricaRes.error) {
    console.error('[alertas distri] metricas:', metricaRes.error.message)
    return 0
  }

  const bloqueIds = (bloquesRes.data ?? []).map((b: { id: string }) => b.id)
  const metricaId = metricaRes.data?.id
  if (bloqueIds.length === 0 || !metricaId) return 0

  const { count, error } = await admin
    .from('bloque_campos')
    .select('id', { count: 'exact', head: true })
    .in('bloque_id', bloqueIds)
    .eq('metrica_id', metricaId)

  if (error) {
    console.error('[alertas distri] bloque_campos:', error.message)
    return 0
  }
  return count ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS ALERTAS QUE MEDÍAN FOTOS
//
// `fotos` es una fuente equivocada para "¿hubo actividad?" desde que existen
// las campañas de solo preguntas: no producen una sola foto. La unidad de
// trabajo es la MISIÓN, y el ancla es `capturada_at` —cuándo se hizo el
// trabajo de campo— y no `created_at`, que es cuándo entró la fila. Esa
// distinción ya nos mintió en el tramo del panel, donde `created_at` decía
// 2026-09 en el 100% de las filas y colapsaba toda la historia en un punto.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los gondoleros que SÍ registraron alguna misión en las campañas del actor
 * dentro de la ventana. El llamador resta para obtener los inactivos.
 *
 * ── DOS DECISIONES QUE NO SON OBVIAS ────────────────────────────────────────
 *
 * **1. El scope son las campañas del actor, no todas.** Un gondolero puede
 * estar vinculado a varias distribuidoras a la vez (ver el Walled Garden en
 * CLAUDE.md), así que "trabajó" y "trabajó PARA VOS" son preguntas distintas.
 * Medir todas las campañas escondería al que está activo para otro y no
 * produce nada acá, que es justo lo que la distri quiere saber.
 *
 * Eso obliga a cambiar el texto: la pantalla no puede seguir diciendo "sin
 * actividad en los últimos 14 días" —una afirmación sobre la persona, que
 * sería falsa— sino "sin actividad en tus campañas".
 *
 * **2. NO se excluyen las misiones descartadas ni rechazadas.** Todo el resto
 * de este tramo las excluye, y acá sería un error: la pregunta no es "¿este
 * trabajo cuenta?" sino "¿esta persona trabajó?". Una misión rechazada es
 * trabajo hecho. Excluirlas acusaría de inactivo a alguien cuya única misión
 * de la quincena se rechazó, que es exactamente la clase de error que esta
 * etapa vino a sacar.
 */
export async function gondolerosConMision(
  gondoleroIds: string[],
  campanaIds: string[],
  desde: Date,
  admin: Admin,
): Promise<Set<string>> {
  if (gondoleroIds.length === 0 || campanaIds.length === 0) return new Set()

  const d = desde.toISOString()
  const { data, error } = await admin
    .from('misiones')
    .select('gondolero_id')
    .in('gondolero_id', gondoleroIds)
    .in('campana_id', campanaIds)
    // PostgREST no tiene COALESCE en un filtro, así que el fallback a
    // `created_at` se escribe como un OR. Hoy todas las misiones de las dos
    // bases tienen `capturada_at`, pero una fila sin él no puede volverse
    // invisible: eso acusaría a alguien por un dato que no cargó él.
    .or(`capturada_at.gte.${d},and(capturada_at.is.null,created_at.gte.${d})`)

  if (error) {
    console.error('[alertas distri] misiones recientes:', error.message)
    // Falla CERRADA: sin datos no se acusa a nadie. Devolver un set vacío
    // marcaría inactivos a los 13, que es el daño que esto viene a evitar.
    return new Set(gondoleroIds)
  }
  return new Set((data ?? []).map((m: { gondolero_id: string }) => m.gondolero_id))
}

/** Una fila de `panel_pdv`, con lo poco que esta alerta necesita. */
export type PdvVisitado = {
  comercio_id: string
  comercio_nombre: string | null
  /**
   * El nombre de la columna dice "medicion" pero es la última VISITA: sale de
   * `max(COALESCE(capturada_at, created_at))` sobre las misiones, midieran o no.
   * Es justo lo que esta alerta necesita, y por eso no hace falta otra consulta.
   */
  ultima_medicion: string | null
}

export type ComercioSinVisita = { id: string; nombre: string; dias: number }

/**
 * Los comercios que no reciben una visita desde hace más de `diasCorte`.
 *
 * ── EL UNIVERSO ES LO QUE CAMBIÓ ────────────────────────────────────────────
 * La versión vieja partía de las FOTOS de los últimos 60 días y después
 * filtraba "hace más de 30". O sea que la banda visible era 30–60 días, y todo
 * comercio con más de 60 sin visita **desaparecía de la alerta**: los más
 * abandonados se escondían justo por estar más abandonados. Medido el
 * 23/9/2026: 23 comercios en cada base.
 *
 * Ahora el universo es `panel_pdv` —los comercios con alguna misión en las
 * campañas del actor— y no hay techo. Un comercio que nunca recibió una misión
 * no aparece, y está bien que así sea: sin asignación de comercios no existe la
 * lista de "los que me interesan", así que "nadie lo tocó nunca" no se
 * distingue de "no es mío". Esa es otra alerta y necesita otra feature.
 *
 * Devuelve el TOTAL aparte de la lista recortada: el badge tiene que decir
 * cuántos hay, no cuántos entran en pantalla.
 */
export function comerciosSinVisita(
  filas: PdvVisitado[],
  opciones: { ahora: Date; diasCorte?: number; tope?: number; ignorar?: (id: string) => boolean },
): { lista: ComercioSinVisita[]; total: number } {
  const { ahora, diasCorte = 30, tope = 50, ignorar } = opciones
  const corte = ahora.getTime() - diasCorte * 24 * 60 * 60 * 1000

  const todos: ComercioSinVisita[] = []
  for (const f of filas) {
    // Sin fecha no se puede afirmar nada. No entra: decir "hace 19.000 días"
    // por un null sería inventar un número.
    if (!f.ultima_medicion) continue
    const t = new Date(f.ultima_medicion).getTime()
    if (Number.isNaN(t) || t >= corte) continue
    if (ignorar?.(f.comercio_id)) continue
    todos.push({
      id: f.comercio_id,
      nombre: f.comercio_nombre ?? 'Comercio',
      dias: Math.floor((ahora.getTime() - t) / (24 * 60 * 60 * 1000)),
    })
  }

  // El más abandonado primero: es el orden en que la distri querría atacarlos,
  // y es el que hace que el recorte se lleve los menos urgentes.
  todos.sort((a, b) => b.dias - a.dias)
  return { lista: todos.slice(0, tope), total: todos.length }
}
