/**
 * lib/cerrar-vinculacion.ts
 * Qué pasa con el trabajo en curso cuando se corta un vínculo gondolero↔distri.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Desde el Walled Garden un gondolero pertenece a UNA distribuidora a la vez, y
 * para cambiar tiene que desvincularse primero. Hasta el 18/9/2026, desvincular
 * no sacaba al gondolero de las campañas en las que ya estaba:
 *
 *   · `misCampanas` en campanas/page.tsx filtra por participación o misiones y
 *     NO aplica `tieneAcceso` — la campaña seguía en "En curso".
 *   · `captura/page.tsx` no chequea el vínculo.
 *   · `registrarMision` tampoco: sus siete rechazos no incluyen "ya no
 *     pertenecés a esta distribuidora".
 *
 * O sea que un gondolero desvinculado seguía relevando para la distri vieja
 * mientras trabajaba para la nueva, y el vínculo único habría sido una
 * formalidad. Cortar el vínculo tiene que cerrar el trabajo en curso.
 *
 * ── LAS DOS COSAS QUE HACE, Y POR QUÉ ───────────────────────────────────────
 *
 * **1. Cierra las participaciones activas** en campañas de esa distri, con el
 * estado `'cerrada'` (migración 20260918170000). No `'completada'`, que afirma
 * un trabajo que no terminó, ni `'abandonada'`, que le echa la culpa a él.
 *
 * **2. Paga los bounties retenidos que estén APROBADOS**, aunque no se haya
 * llegado a `min_comercios_para_cobrar`.
 *
 * El mínimo es un umbral de CANTIDAD, no de calidad: separa "contestó" de
 * "cobró", y no mira el contenido. Si el trabajo está aprobado, está aprobado.
 * Y la liberación normal la dispara **la siguiente aprobación** de una misión de
 * esa misma campaña (`aprobarMisionCore`): si el gondolero ya no puede trabajar
 * ahí, esa próxima aprobación no llega nunca y los puntos quedan retenidos para
 * siempre. Es la misma forma de falla que `lib/misiones-trabadas.ts` documenta —
 * "nada vuelve a tocarla"— y acá no hay reintento posible, porque no falló nada.
 *
 * ── EL FILTRO `estado = 'aprobada'` NO ES OPCIONAL ──────────────────────────
 * Solo se paga lo APROBADO. Toda misión nace 'pendiente' + 'retenido', así que
 * liberar por `bounty_estado` solo pagaría trabajo sin revisar. Es exactamente
 * el agujero que se cerró el 16/9/2026 en `aprobarMisionCore`, y este archivo es
 * un segundo escritor sobre las mismas filas: si su filtro no es idéntico, el
 * agujero vuelve por la puerta de al lado.
 *
 * ── EL ABUSO QUE ESTO ABRE, Y NO ESTÁ MITIGADO ──────────────────────────────
 * Pagar al cerrar convierte a la desvinculación en una forma de cobrar por
 * debajo del mínimo. Del lado de la DISTRI no preocupa: el que desvincula es el
 * que paga.
 *
 * **Del lado del GONDOLERO sí, y el argumento que justifica el pago no le
 * aplica.** La razón para pagar es que la desvinculación "no es decisión suya";
 * cuando es él quien se desvincula, sí lo es. El camino queda abierto: hace una
 * misión de una campaña con mínimo 3, se desvincula, cobra, pide que lo
 * re-inviten y repite. El mínimo pasa a ser optativo para cualquiera dispuesto a
 * desvincularse.
 *
 * Hoy la fricción es que **no existe forma de que el gondolero se auto-vincule**
 * (`solicitarVinculacion` no tiene ningún llamador), así que volver depende de
 * que la distri lo invite. Eso lo hace lento, no imposible.
 *
 * Se implementa igual en los dos caminos porque es la decisión tomada —un solo
 * comportamiento para el mismo hecho— y porque distinguirlos también tiene un
 * costo: castigar al que se va por su cuenta con la plata que ya ganó. Si algún
 * día hay que cerrarlo, el lugar es `iniciadoPor`: está en la firma y no se usa
 * para decidir, justamente para que restringirlo sea cambiar una condición acá
 * adentro y nada más.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** El concepto del movimiento. Fijo, para poder auditarlo después por texto:
 *  `movimientos_puntos.concepto` no tiene CHECK, es texto libre. */
export const CONCEPTO_CIERRE_VINCULACION = 'Puntos liberados al cerrar la vinculación'

export interface ResumenCierre {
  /** Participaciones que pasaron a 'cerrada'. */
  participacionesCerradas: number
  /** Nombres de esas campañas, para el mensaje al gondolero. */
  campanasCerradas: string[]
  /** Misiones aprobadas cuyo bounty se liberó por debajo del mínimo. */
  misionesLiberadas: number
  /** Puntos acreditados por ese concepto. */
  puntosLiberados: number
}

export const RESUMEN_VACIO: ResumenCierre = {
  participacionesCerradas: 0,
  campanasCerradas: [],
  misionesLiberadas: 0,
  puntosLiberados: 0,
}

type Resultado =
  | { ok: true;  resumen: ResumenCierre }
  | { ok: false; error: string }

/**
 * Lo que va a pasar si se corta el vínculo, sin tocar nada.
 *
 * Reemplaza a `verificarDesvincularGondolero`, que preguntaba lo mismo para
 * BLOQUEAR. Ahora la respuesta no impide nada: se muestra en la confirmación
 * para que quien desvincula sepa qué está cerrando y cuánto se va a pagar.
 */
export async function previsualizarCierre(params: {
  gondoleroId: string
  distriId: string
  admin: Admin
}): Promise<ResumenCierre> {
  const { gondoleroId, distriId, admin } = params
  try {
    const campanas = await campanasDeLaDistri(distriId, admin)
    if (campanas.length === 0) return RESUMEN_VACIO

    const ids = campanas.map(c => c.id)

    const [partRes, misRes] = await Promise.all([
      admin.from('participaciones')
        .select('campana_id')
        .eq('gondolero_id', gondoleroId)
        .eq('estado', 'activa')
        .in('campana_id', ids),
      admin.from('misiones')
        .select('puntos_total')
        .eq('gondolero_id', gondoleroId)
        .eq('estado', 'aprobada')
        .eq('bounty_estado', 'retenido')
        .in('campana_id', ids),
    ])

    const nombres = new Map(campanas.map(c => [c.id, c.nombre]))
    const parts = (partRes.data ?? []) as { campana_id: string }[]
    const mis   = (misRes.data ?? []) as { puntos_total: number | null }[]

    return {
      participacionesCerradas: parts.length,
      campanasCerradas: parts.map(p => nombres.get(p.campana_id) ?? 'una campaña'),
      misionesLiberadas: mis.length,
      puntosLiberados: mis.reduce((s, m) => s + (m.puntos_total ?? 0), 0),
    }
  } catch (err) {
    console.error('[cerrar-vinculacion] error en la previsualización:', err)
    return RESUMEN_VACIO
  }
}

/**
 * Cierra el trabajo en curso del gondolero en las campañas de esa distribuidora.
 *
 * NO toca la fila de `gondolero_distri_solicitudes` ni `profiles.distri_id`: de
 * eso se ocupa cada llamador, que es quien sabe con qué permisos y de qué lado
 * se está cortando el vínculo. Esta función es solo la parte que tiene que ser
 * idéntica en los dos caminos.
 *
 * Devuelve el error en vez de lanzarlo: los dos llamadores son Server Actions, y
 * Next redacta el mensaje de toda excepción en producción. Un valor devuelto no.
 */
export async function cerrarVinculacion(params: {
  gondoleroId: string
  distriId: string
  admin: Admin
  /** Quién cortó. Hoy no cambia el comportamiento — ver el docstring del archivo. */
  iniciadoPor: 'distri' | 'gondolero'
}): Promise<Resultado> {
  const { gondoleroId, distriId, admin } = params

  try {
    const campanas = await campanasDeLaDistri(distriId, admin)
    if (campanas.length === 0) return { ok: true, resumen: RESUMEN_VACIO }

    const ids = campanas.map(c => c.id)
    const nombres = new Map(campanas.map(c => [c.id, c.nombre]))

    // ── 1. Cerrar participaciones activas ───────────────────────────────────
    // Se leen ANTES de actualizar: después del update ya no matchean el filtro
    // y no habría forma de decir cuáles se cerraron.
    const { data: partData, error: errLeerPart } = await admin
      .from('participaciones')
      .select('id, campana_id')
      .eq('gondolero_id', gondoleroId)
      .eq('estado', 'activa')
      .in('campana_id', ids)

    // supabase-js NO lanza ante un error de Postgres: lo devuelve en `.error`.
    if (errLeerPart) return { ok: false, error: 'No se pudieron leer las campañas en curso: ' + errLeerPart.message }

    const parts = (partData ?? []) as { id: string; campana_id: string }[]

    if (parts.length > 0) {
      const { error: errCerrar } = await admin
        .from('participaciones')
        .update({ estado: 'cerrada' })
        .in('id', parts.map(p => p.id))
      if (errCerrar) return { ok: false, error: 'No se pudieron cerrar las campañas en curso: ' + errCerrar.message }
    }

    // ── 2. Liquidar los bounties retenidos que estén aprobados ──────────────
    // El filtro es el mismo que el de `aprobarMisionCore`, y tiene que seguir
    // siéndolo: los dos escriben sobre las mismas filas y el movimiento de
    // puntos tiene que cuadrar con lo que queda acreditado.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtroLiberables = (q: any) => q
      .eq('gondolero_id',  gondoleroId)
      .eq('estado',        'aprobada')
      .eq('bounty_estado', 'retenido')
      .in('campana_id',    ids)

    const { data: retenidas, error: errLeerMis } = await filtroLiberables(
      admin.from('misiones').select('id, puntos_total')
    ) as { data: { id: string; puntos_total: number | null }[] | null; error: { message: string } | null }

    if (errLeerMis) return { ok: false, error: 'No se pudieron leer las misiones retenidas: ' + errLeerMis.message }

    const mis = retenidas ?? []
    const puntos = Math.round(mis.reduce((s, m) => s + (m.puntos_total ?? 0), 0))

    if (mis.length > 0) {
      const { error: errLiberar } = await filtroLiberables(
        admin.from('misiones').update({ bounty_estado: 'acreditado' })
      )
      if (errLiberar) return { ok: false, error: 'No se pudo liberar el bounty: ' + errLiberar.message }

      // `movimientos_puntos` tiene CHECK (monto > 0): con 0 el insert falla y
      // dejaría las misiones acreditadas sin el movimiento que suma el saldo.
      if (puntos > 0) {
        const { error: errMov } = await admin.from('movimientos_puntos').insert({
          gondolero_id: gondoleroId,
          tipo:         'credito',
          monto:        puntos,
          concepto:     CONCEPTO_CIERRE_VINCULACION,
          // Sin campana_id: el movimiento puede abarcar misiones de varias
          // campañas de la misma distri, y elegir una sería arbitrario.
        })
        // El más caro de los cuatro si falla: las misiones ya quedaron en
        // 'acreditado' y el movimiento es lo único que le suma los puntos al
        // saldo. Ver el mismo comentario en aprobarMisionCore.
        if (errMov) return { ok: false, error: 'Se liberaron las misiones pero no se pudo acreditar el saldo: ' + errMov.message }
      }
    }

    return {
      ok: true,
      resumen: {
        participacionesCerradas: parts.length,
        campanasCerradas: parts.map(p => nombres.get(p.campana_id) ?? 'una campaña'),
        misionesLiberadas: mis.length,
        puntosLiberados: puntos,
      },
    }
  } catch (err) {
    console.error('[cerrar-vinculacion] error inesperado:', err)
    return { ok: false, error: 'No se pudo cerrar el trabajo en curso. Intentá de nuevo.' }
  }
}

/**
 * Campañas de la distribuidora.
 *
 * Todas, no solo las activas: una participación viva en una campaña pausada
 * también tiene que cerrarse, y una misión aprobada con bounty retenido en una
 * campaña cerrada es plata que le corresponde igual.
 */
async function campanasDeLaDistri(
  distriId: string,
  admin: Admin,
): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await admin
    .from('campanas')
    .select('id, nombre')
    .eq('distri_id', distriId)

  if (error) {
    console.error('[cerrar-vinculacion] error leyendo campañas:', error.message)
    return []
  }
  return (data ?? []) as { id: string; nombre: string }[]
}
