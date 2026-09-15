/**
 * lib/comercios-relevados.ts
 *
 * Sincroniza `campanas.comercios_relevados` con la verdad: la cantidad de
 * comercios DISTINTOS con al menos una misión viva en la campaña.
 *
 * POR QUÉ RECALCULAR EN VEZ DE SUMAR Y RESTAR
 *
 * El contador se mantenía con `+1` al registrar y `-1` al descartar, repartidos
 * en tres lugares. Eso funcionaba mientras un comercio no pudiera tener más de
 * una misión viva — pero la modalidad 'seguimiento' existe desde el 15/9/2026 y
 * ahí un comercio se visita muchas veces a propósito. Con aritmética, una
 * campaña de seguimiento con 45 comercios visitados 3 veces por semana diría
 * "135 comercios relevados" a la primera semana: no es un número impreciso, mide
 * otra cosa con el nombre equivocado.
 *
 * Se podría arreglar con tres condicionales —sumar solo si el comercio no tenía
 * ya una misión viva, restar solo si era la última— pero serían tres reglas que
 * tienen que coincidir, en tres archivos. Es el patrón que ya nos mordió con los
 * radios de GPS y con la búsqueda de comercios. Un recálculo es UNA regla, y no
 * puede desincronizarse de sí misma.
 *
 * Y sale más barato de lo que parece: los tres call sites ya hacían un SELECT y
 * un UPDATE para la aritmética. Esto hace lo mismo.
 *
 * ── DEUDA CONOCIDA ──────────────────────────────────────────────────────────
 * Esta columna no debería existir. `lib/campana-avance.ts` la cita como EL
 * ejemplo de por qué no se guarda estado derivado ("se guardó, se desincronizó,
 * y tuvo una alerta rota durante meses"). Lo correcto es borrarla y que cada
 * consumidor cuente. Está anotado en CLAUDE.md con el inventario de los 17
 * archivos que la leen. Hasta entonces, este helper la mantiene honesta.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Recalcula y guarda el contador. Devuelve el valor nuevo, o null si falló
 * (nunca tira: ningún flujo debe romperse porque un contador no se pudo
 * actualizar).
 */
export async function sincronizarComerciosRelevados(
  campanaId: string,
  admin: Admin,
): Promise<number | null> {
  try {
    // Se traen los comercio_id y se cuentan distintos acá: PostgREST no expone
    // COUNT(DISTINCT). Son unos pocos cientos de uuids en el peor caso.
    //
    // El filtro de estado va en JS y no en la query, por la misma razón que en
    // obtenerComerciosRelevados: el índice único usa
    // `estado IS DISTINCT FROM 'descartada'`, que INCLUYE las filas con estado
    // NULL, y un `.neq()` de PostgREST las excluiría por lógica de tres valores.
    // El `!==` de JS sobre null da true y reproduce el predicado exacto.
    const { data, error } = await admin
      .from('misiones')
      .select('comercio_id, estado')
      .eq('campana_id', campanaId)

    if (error) {
      console.error('[comercios-relevados] error leyendo misiones:', error.message)
      return null
    }

    const distintos = new Set(
      (data ?? [])
        .filter((m: { estado: string | null }) => m.estado !== 'descartada')
        .map((m: { comercio_id: string | null }) => m.comercio_id)
        .filter(Boolean)
    )
    const total = distintos.size

    const { error: updErr } = await admin
      .from('campanas')
      .update({ comercios_relevados: total })
      .eq('id', campanaId)

    if (updErr) {
      console.error('[comercios-relevados] error actualizando campana:', updErr.message)
      return null
    }

    return total
  } catch (err) {
    console.error('[comercios-relevados] error inesperado:', err)
    return null
  }
}
