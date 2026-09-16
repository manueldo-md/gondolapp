/**
 * lib/misiones.ts
 * Helpers de servidor para gestionar el estado de misiones.
 *
 * Tres casos cubiertos:
 *
 * A. Misión sin fotos (survey-only): se aprueba al registrarse.
 *    → resolverMisionDirecta() llamada desde captura/actions.ts
 *
 * B. Misión con TODAS las fotos aprobadas: se aprueba.
 *    → actualizarEstadoMision() desde actions de aprobación
 *
 * C. Misión con alguna foto rechazada: NO se cierra. Queda viva para que el
 *    gondolero la rehaga. La salida terminal es descartarRecaptura(), que él
 *    usa cuando no puede volver al comercio.
 *    (El encabezado decía que acá se rechazaba. Era el encabezado el que estaba
 *    mal; ver el comentario en actualizarEstadoMision.)
 *
 * El entry-point de B y C es actualizarEstadoMision(), que opera sobre
 * el mision_id derivado del fotoId.
 *
 * ── LA REGLA DEL PAGO ───────────────────────────────────────────────────────
 * Solo se acredita una misión APROBADA. Está en un único lugar, el filtro de
 * aprobarMisionCore, y es del lector: no depende de que cada camino que cierre
 * una misión se acuerde de anular su bounty. Ver el comentario largo ahí.
 *
 * ── LO QUE ESTE ARCHIVO NO CUBRE ────────────────────────────────────────────
 * Una misión SIN FOTOS que no se aprobó al crearse queda trabada en 'pendiente'
 * para siempre: `actualizarEstadoMision` se dispara desde la revisión de una
 * foto, así que sin fotos nunca corre, y el `if (total === 0) return` la deja
 * pasar de largo. Es el caso de un `resolverMisionDirecta` que falló —traga los
 * errores con un console.error— o de un insert de fotos que no llegó a
 * ejecutarse. En dev hay 3 así (16/9/2026). Antes la barrida indiscriminada las
 * rescataba por accidente; con el filtro puesto, no cobran nunca. Necesitan una
 * decisión aparte: no hay forma de resolverlas desde acá.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Núcleo interno ────────────────────────────────────────────────────────────

/**
 * Aprueba una misión y libera el bounty si el gondolero alcanzó el mínimo
 * de misiones para cobrar. Compartido entre Caso A y Caso B.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aprobarMisionCore(params: {
  misionId: string
  gondoleroId: string
  campanaId: string
  minParaCobrar: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>
}): Promise<void> {
  const { misionId, gondoleroId, campanaId, minParaCobrar, admin } = params

  // Los errores se chequean uno por uno y se convierten en excepción.
  //
  // supabase-js NO tira ante un error de Postgres: lo devuelve en `.error` del
  // resultado. Hasta el 16/9/2026 ninguno de los cuatro pasos de acá lo miraba,
  // así que un fallo del paso 1 dejaba la misión en 'pendiente' y la función
  // seguía como si nada — sin excepción, sin log, sin rastro. Es lo que dejó 3
  // misiones survey-only trabadas en dev: `resolverMisionDirecta` "terminó bien"
  // y la misión nunca se aprobó.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chequear = (paso: string, error: any) => {
    if (error) {
      throw new Error(
        `[aprobarMisionCore] ${paso} falló para misión ${misionId} ` +
        `(gondolero ${gondoleroId}, campaña ${campanaId}): ${error.message}`
      )
    }
  }

  // 1. Marcar misión como aprobada
  const { error: errAprobar } = await admin
    .from('misiones')
    .update({ estado: 'aprobada' })
    .eq('id', misionId)
  chequear('marcar la misión como aprobada', errAprobar)

  // 2. Contar misiones aprobadas del gondolero en la campaña
  //    (incluye la que acabamos de actualizar)
  const { count: misionesAprobadas, error: errContar } = await admin
    .from('misiones')
    .select('id', { count: 'exact', head: true })
    .eq('campana_id',   campanaId)
    .eq('gondolero_id', gondoleroId)
    .eq('estado',       'aprobada')
  chequear('contar las misiones aprobadas', errContar)

  const countAprobadas = misionesAprobadas ?? 0

  if (countAprobadas >= minParaCobrar) {
    // 3a/3b. Liberar las misiones retenidas Y APROBADAS.
    //
    // El `estado = 'aprobada'` es la mitad del filtro y no es opcional. Sin él,
    // la barrida paga TODA misión del gondolero en la campaña que esté en
    // 'retenido' — y toda misión nace 'pendiente' + 'retenido'. Con el default
    // de min_comercios_para_cobrar = 3:
    //
    //   el gondolero manda 5 misiones          → las 5 pendiente + retenido
    //   revisan y aprueban las fotos de 1,2,3  → esas 3 pasan a aprobada
    //   al aprobar la 3ª, count = 3 >= 3       → barrida
    //   se pagan las 5, con las fotos de la 4 y la 5 sin mirar
    //
    // O sea que se pagaba trabajo no validado, y si después el revisor rechazaba
    // esas fotos la plata ya había salido. En dev pasó: 4 misiones acreditadas
    // en estado 'pendiente', 410 puntos. En prod todavía no había pasado.
    //
    // La defensa que existía era por ESCRITOR: el descarte se acuerda de poner
    // bounty_estado='anulado' en el origen (ver la migración
    // 20260909190000_misiones_estado_descartada.sql, que lo explica). Eso obliga
    // a que cada camino nuevo se acuerde. Filtrar acá lo vuelve una regla del
    // LECTOR: no se paga lo que no está aprobado, venga de donde venga.
    // El mismo filtro para leer y para escribir, en una sola definición: si los
    // dos no coinciden exactamente, el movimiento de puntos no cuadra con lo que
    // quedó acreditado.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtroLiberables = (q: any) => q
      .eq('campana_id',    campanaId)
      .eq('gondolero_id',  gondoleroId)
      .eq('bounty_estado', 'retenido')
      .eq('estado',        'aprobada')

    // 3a. Obtener puntos antes de liberar
    const { data: misionesRetenidas, error: errLeer } = await filtroLiberables(
      admin.from('misiones').select('id, puntos_total')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as { data: { id: string; puntos_total: number | null }[] | null; error: any }
    chequear('leer las misiones retenidas', errLeer)

    // 3b. Liberar (incluye la actual, que el paso 1 acaba de pasar a 'aprobada')
    const { error: errLiberar } = await filtroLiberables(
      admin.from('misiones').update({ bounty_estado: 'acreditado' })
    )
    chequear('liberar el bounty', errLiberar)

    // 3c. Insertar movimiento por el total liberado.
    //     El trigger on_movimiento_puntos actualiza profiles.puntos_disponibles.
    const totalPuntos = (misionesRetenidas ?? []).reduce(
      (sum: number, m) => sum + (m.puntos_total ?? 0), 0
    )
    if (totalPuntos > 0) {
      const { error: errMov } = await admin.from('movimientos_puntos').insert({
        gondolero_id: gondoleroId,
        tipo:         'credito',
        monto:        Math.round(totalPuntos),
        concepto:     `Puntos desbloqueados · ${countAprobadas} misiones aprobadas`,
        campana_id:   campanaId,
      })
      // El más caro de los cuatro si falla: las misiones ya quedaron en
      // 'acreditado' y el movimiento es lo único que le suma los puntos al
      // saldo. Sin el chequeo, el gondolero ve sus misiones acreditadas y el
      // saldo sin moverse, y nadie sabe por qué.
      chequear('insertar el movimiento de puntos', errMov)
    }
  }
  // Si count < minParaCobrar → bounty_estado permanece 'retenido'.
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * CASO A — Misión survey-only (sin fotos).
 * Llamar desde registrarMision() cuando params.fotos.length === 0,
 * inmediatamente después de guardar mision_respuestas.
 * Aprueba la misión y libera bounty si corresponde.
 */
export async function resolverMisionDirecta(params: {
  misionId:     string
  gondoleroId:  string
  campanaId:    string
  minParaCobrar: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>
}): Promise<void> {
  try {
    await aprobarMisionCore(params)
  } catch (err) {
    // NO se re-lanza, y es deliberado: cuando esto corre la misión y sus
    // respuestas YA están guardadas. Tirar acá haría fallar a registrarMision
    // entera, y la cola offline reintentaría una misión que en realidad se
    // grabó bien. Se perdería trabajo del gondolero por un fallo de
    // contabilidad.
    //
    // Pero deja de ser un 'no-op' silencioso: el log lleva los tres ids para
    // poder repararla, y la misión queda contable —'pendiente' + 'retenido' sin
    // ninguna foto— así que el panel de admin la puede listar y reintentar.
    // Antes decía "Error (no-op)" y nada más; es lo que dejó 3 misiones
    // trabadas en dev sin que nadie se enterara.
    console.error(
      '[resolverMisionDirecta] MISIÓN TRABADA — quedó en pendiente y no se acreditó. ' +
      'Reparar con "Destrabar misiones" en /admin/misiones.',
      {
        misionId:    params.misionId,
        gondoleroId: params.gondoleroId,
        campanaId:   params.campanaId,
        error:       err instanceof Error ? err.message : String(err),
      }
    )
  }
}

/**
 * CASO B — Después de aprobar una foto:
 *
 * B. Si TODAS las fotos de la misión están aprobadas → aprueba la misión.
 * -  Si aún hay fotos pendientes o en revisión → no hace nada.
 * -  Si hay fotos rechazadas → la misión queda en pendiente hasta que se
 *    implemente el flujo de recaptura (Caso C diferido).
 */
export async function actualizarEstadoMision(params: {
  fotoId:        string
  gondoleroId:   string
  campanaId:     string
  minParaCobrar?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>
}): Promise<void> {
  const { fotoId, gondoleroId, campanaId, minParaCobrar = 1, admin } = params

  try {
    // 1. Obtener mision_id de la foto
    const { data: fotoData } = await admin
      .from('fotos')
      .select('mision_id')
      .eq('id', fotoId)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const misionId: string | null = (fotoData as any)?.mision_id ?? null
    if (!misionId) return  // foto sin misión (flujo legacy sin misiones)

    // 1b. Una misión descartada no se reabre.
    //     Si quedaron fotos en 'pendiente' y un revisor las aprueba después,
    //     sin esta guarda aprobarMisionCore le pisa el estado con 'aprobada' y
    //     le paga los puntos que el gondolero resignó al descartar.
    const { data: misionData } = await admin
      .from('misiones')
      .select('estado')
      .eq('id', misionId)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((misionData as any)?.estado === 'descartada') return

    // 2. Leer estados de todas las fotos VIGENTES de la misión.
    //    Las reemplazadas por una recaptura no cuentan: quedan en 'rechazada'
    //    para conservar el rastro, pero si se las contara la misión no podría
    //    aprobarse nunca — aprobadas nunca llegaría a igualar el total.
    const { data: fotosData } = await admin
      .from('fotos')
      .select('estado')
      .eq('mision_id', misionId)
      .is('reemplazada_por', null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const estados = (fotosData ?? []).map((f: any) => f.estado as string)
    const total     = estados.length
    if (total === 0) return

    const aprobadas  = estados.filter(e => e === 'aprobada').length
    const rechazadas = estados.filter(e => e === 'rechazada').length
    const pendientes = estados.filter(e => e === 'pendiente' || e === 'en_revision').length

    if (aprobadas === total) {
      // Caso B: todas aprobadas → aprobar misión y liberar bounty
      await aprobarMisionCore({ misionId, gondoleroId, campanaId, minParaCobrar, admin })

    }

    // ── POR QUÉ NO HAY `else` ─────────────────────────────────────────────────
    // "Alguna foto rechazada y ninguna pendiente" NO es un estado terminal: es
    // el estado normal de "tenés una foto para rehacer". El rechazo de una foto
    // llama a esta función en el mismo acto (admin/fotos/actions.ts), así que un
    // `else` acá se dispara al instante y mata la misión ANTES de que el
    // gondolero pueda recapturar — con la notificación que acaba de recibir
    // diciéndole "podés retomar la misión y rehacer esa foto".
    //
    // La regla está en la migración 20260915140000_misiones_unico_por_comercio:
    // "El descarte libera el comercio; una foto rechazada NO lo libera, porque
    // la misión sigue viva y el gondolero la puede rehacer."
    //
    // El encabezado de este archivo decía que el Caso C se rechazaba. Estaba
    // mal el encabezado, no el código: la salida terminal ya existe y es
    // `descartarRecaptura`, que el gondolero usa cuando no puede volver al
    // comercio, y que cierra con estado='descartada' + bounty='anulado'.
    //
    // Queda un hueco real, pero su disparador es otro: si la campaña vence con
    // una recaptura pendiente, el gate de vigencia bloquea el retake y la misión
    // queda en 'pendiente' sin salida. Eso no se puede resolver desde acá —esta
    // función solo corre cuando alguien revisa una foto— y necesita una barrida
    // al vencer. Anotado en CLAUDE.md.
    //
    // Si aún hay pendientes/en_revision → esperar; no hacer nada.
    void rechazadas; void pendientes

  } catch (err) {
    console.error('[actualizarEstadoMision] Error (no-op):', err)
  }
}
