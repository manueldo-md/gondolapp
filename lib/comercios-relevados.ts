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
    // obtenerEstadoComercios: el índice único usa
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

/**
 * Los comercios que le OCUPAN CUPO a un gondolero en una campaña.
 *
 * ── DOS NÚMEROS DISTINTOS, Y ESTE ES EL DE ARRIBA ───────────────────────────
 * Hay dos preguntas parecidas que NO tienen la misma respuesta, y confundirlas
 * es lo que rompió la participación al cruzar el mínimo:
 *
 *   · **TOMADOS** (esta función) — comercios que ya ocupan lugar. Incluye lo
 *     pendiente de revisión, porque un comercio pendiente **ya está tomado**:
 *     nadie más lo puede relevar y él no puede pretender que no lo hizo.
 *     Gobierna `max_comercios_por_gondolero`.
 *   · **APROBADOS** (`sincronizarComerciosCompletados`) — comercios con misión
 *     aprobada. Solo se cobra lo aprobado, así que es el que se compara contra
 *     `min_comercios_para_cobrar`.
 *
 * Tomados >= aprobados, siempre. Son dos cosas y por eso esta función existe
 * aparte: hasta el 17/9/2026 la regla del cupo estaba escrita tres veces —en la
 * pantalla, en el chequeo de servidor del alta y en el flip de la participación—
 * y la tercera usaba el criterio de la otra pregunta.
 *
 * Cuenta misiones vivas (todo lo que no esté 'descartada') MÁS las altas propias
 * no rechazadas: en una campaña de altas la misión no existe hasta que alguien
 * valida, así que sin las altas el cupo daría cero mientras esperan revisión.
 */
export async function comerciosTomadosPorGondolero(
  campanaId: string,
  gondoleroId: string,
  admin: Admin,
): Promise<Set<string>> {
  const tomados = new Set<string>()

  const [{ data: misiones, error: errMis }, { data: altas, error: errAltas }] = await Promise.all([
    admin.from('misiones').select('comercio_id, estado')
      .eq('campana_id', campanaId).eq('gondolero_id', gondoleroId),
    admin.from('comercios').select('id, estado')
      .eq('campana_id', campanaId).eq('registrado_por', gondoleroId),
  ])

  if (errMis)   console.error('[comercios-tomados] error leyendo misiones:', errMis.message)
  if (errAltas) console.error('[comercios-tomados] error leyendo altas:', errAltas.message)

  // Los dos filtros van en JS y no en la query: `misiones.estado` y
  // `comercios.estado` son nullable, y un `.neq()` de PostgREST descartaría
  // también las filas con NULL por lógica de tres valores — o sea que un
  // comercio dejaría de ocupar cupo sin que nadie se entere.
  for (const m of ((misiones ?? []) as { comercio_id: string | null; estado: string | null }[])) {
    if (m.comercio_id && m.estado !== 'descartada') tomados.add(m.comercio_id)
  }
  for (const c of ((altas ?? []) as { id: string; estado: string | null }[])) {
    if (c.estado !== 'rechazado') tomados.add(c.id)
  }

  return tomados
}

/**
 * Recalcula `participaciones.comercios_completados` de UN gondolero en UNA
 * campaña: comercios DISTINTOS con al menos una misión aprobada.
 *
 * ── POR QUÉ DISTINTOS Y NO MISIONES ─────────────────────────────────────────
 * Lo que hace valioso el trabajo es la COBERTURA, no el volumen. Un gondolero
 * que visita el mismo comercio tres veces no cubrió tres puntos de venta. Es el
 * mismo criterio que el mínimo de la campaña.
 *
 * En modalidad 'puntual' no cambia nada: el índice único
 * `misiones_campana_comercio_uniq` garantiza una misión viva por comercio, así
 * que misiones aprobadas y comercios distintos son el mismo número. En
 * 'seguimiento' —donde un comercio se visita a propósito muchas veces— es la
 * diferencia entre un contador que dice comercios y uno que cuenta visitas.
 * Por eso el criterio queda igual en las dos modalidades y no hay que ramificar.
 *
 * ── POR QUÉ SOBRE APROBADAS ─────────────────────────────────────────────────
 * Distinto de `sincronizarComerciosRelevados`, que cuenta misiones VIVAS.
 * No es incoherencia, son preguntas distintas: aquélla responde "cuántos PDV
 * tocó la campaña" y ésta "cuánto trabajo VALIDADO hizo este gondolero". Y este
 * número se compara contra `min_comercios_para_cobrar`, que gobierna un pago:
 * si contara trabajo sin revisar, el gondolero vería "3 de 3" en su tarjeta y no
 * cobraría, porque el gate del pago sí exige aprobación. Dos números en la
 * misma pantalla diciendo cosas distintas.
 *
 * ── POR QUÉ RECALCULAR ──────────────────────────────────────────────────────
 * Se mantenía con `+1` repartido en cuatro lugares, y encima incrementaba por
 * FOTO aprobada: una misión con dos fotos sumaba dos. Mismo argumento que el
 * contador de la campaña — un recálculo es UNA regla y no puede desincronizarse
 * de sí misma.
 */
export async function sincronizarComerciosCompletados(
  campanaId: string,
  gondoleroId: string,
  admin: Admin,
): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from('misiones')
      .select('comercio_id')
      .eq('campana_id', campanaId)
      .eq('gondolero_id', gondoleroId)
      .eq('estado', 'aprobada')

    if (error) {
      console.error('[comercios-completados] error leyendo misiones:', error.message)
      return null
    }

    const total = new Set(
      (data ?? [])
        .map((m: { comercio_id: string | null }) => m.comercio_id)
        .filter(Boolean)
    ).size

    const update: Record<string, unknown> = { comercios_completados: total }

    // ── 'completada' es alcanzar el MÁXIMO, no el mínimo ──────────────────────
    //
    // Hasta el 17/9/2026 esto flipeaba con `total >= min_comercios_para_cobrar`,
    // y era un error de concepto con consecuencia directa: **el mínimo es el
    // piso para COBRAR, no el techo del trabajo**. Con mínimo 2 y máximo 20, el
    // gondolero cruzaba el 2, la participación pasaba a 'completada' y el gate
    // del alta —que exigía 'activa'— le decía "no tenés una participación activa
    // en esta campaña". Le quedaban 18 comercios por cargar y cobrar.
    //
    // Se mide en comercios TOMADOS y no aprobados, a propósito: es la misma
    // pregunta que responde el cupo, y tiene que dar el mismo número. Si contara
    // aprobados, la pantalla le bloquearía el botón por cupo lleno mientras la
    // participación sigue diciendo 'activa', o al revés.
    //
    // NO la reabre: si el número baja, la participación se deja en 'completada'.
    // Quitarle a alguien un estado que ya vio en pantalla es peor que dejarlo.
    //
    // Cuando la campaña cierra con el gondolero por debajo del máximo, la
    // participación queda en 'activa': el gate de campaña cerrada ya lo frena
    // por otro lado. Un estado 'cerrada' propio —que distinga "terminó el
    // trabajo" de "se quedó sin tiempo"— está anotado en CLAUDE.md.
    const { data: campana, error: errCampana } = await admin
      .from('campanas')
      .select('max_comercios_por_gondolero')
      .eq('id', campanaId)
      .maybeSingle()

    if (errCampana) {
      console.error('[comercios-completados] error leyendo campaña:', errCampana.message)
    } else {
      const maximo: number | null = campana?.max_comercios_por_gondolero ?? null
      if (maximo !== null) {
        const tomados = await comerciosTomadosPorGondolero(campanaId, gondoleroId, admin)
        if (tomados.size >= maximo) update.estado = 'completada'
      }
    }

    const { error: errUpd } = await admin
      .from('participaciones')
      .update(update)
      .eq('campana_id', campanaId)
      .eq('gondolero_id', gondoleroId)

    if (errUpd) {
      console.error('[comercios-completados] error actualizando participación:', errUpd.message)
      return null
    }

    return total
  } catch (err) {
    console.error('[comercios-completados] error inesperado:', err)
    return null
  }
}
