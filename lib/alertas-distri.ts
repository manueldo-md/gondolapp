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
 * `panel_marca_pdv` —las dos fuentes, el grano por (misión, fuente), los
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
