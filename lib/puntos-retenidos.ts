/**
 * lib/puntos-retenidos.ts
 * Los puntos que el gondolero ganó y todavía no puede canjear.
 *
 * ── POR QUÉ SE SEPARAN DOS CASOS ────────────────────────────────────────────
 * `bounty_estado='retenido'` es el mismo en los dos, pero significan cosas
 * opuestas para quien lo lee:
 *
 *   · ESPERANDO APROBACIÓN — la misión está hecha y falta que la revisen.
 *     No puede hacer nada.
 *   · ESPERANDO EL MÍNIMO  — ya está aprobada, le faltan comercios para llegar
 *     a `min_comercios_para_cobrar`. Acá sí puede accionar.
 *
 * Mezclarlos pierde justamente la parte que lo mueve a completar el mínimo.
 *
 * Las rechazadas y descartadas no entran: su bounty queda en 'anulado', así que
 * se filtran solas.
 *
 * ── DE DÓNDE SALE "CUÁNTO FALTA" ────────────────────────────────────────────
 * De `misiones`, contando COMERCIOS DISTINTOS con misión 'aprobada'. Es
 * exactamente lo que cuenta `aprobarMisionCore` para decidir el pago, así que el
 * número que ve el gondolero es el que la base va a exigir.
 *
 * NO se usa `participaciones.comercios_completados`, que es un contador
 * guardado: lo encontramos desincronizado el 17/9/2026 por herencia del seed.
 * Un número que promete plata no puede salir de una columna que puede estar
 * vieja.
 *
 * Las descartadas quedan afuera por construcción: nunca están en 'aprobada'. Si
 * un comercio tiene una descartada Y una aprobada, cuenta por la aprobada.
 */

import { puntosDeLaCampana } from '@/lib/campana-altas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface CampanaRetenida {
  campanaId: string
  nombre: string
  /** Puntos de misiones todavía sin revisar. */
  puntosEsperandoAprobacion: number
  /**
   * Puntos de comercios CARGADOS y pendientes de validación, en campañas de altas.
   *
   * Es un tercer caso y no una variante del primero: en una campaña de altas la
   * misión no existe hasta que alguien valida el comercio, así que el gondolero
   * cargaba tres comercios, su saldo no se movía y **no veía nada pendiente** —
   * el trabajo entregado era invisible hasta que aparecía pagado de golpe.
   *
   * Se separa de "esperando aprobación" porque **validar no es aprobar**: es
   * otro acto, en otra pantalla, y lo hace otra persona. Mezclarlos le diría al
   * gondolero que espere algo que no es lo que está esperando.
   */
  puntosEsperandoValidacion: number
  /** Comercios cargados esperando validación. */
  comerciosEsperandoValidacion: number
  /** Puntos de misiones aprobadas que esperan el mínimo. */
  puntosEsperandoMinimo: number
  /** Comercios distintos con misión aprobada. Es lo que cuenta para el mínimo. */
  comerciosAprobados: number
  /**
   * Comercios entregados que todavía no están aprobados: misiones en revisión
   * MÁS altas esperando validación. Es lo que va a contar para el mínimo cuando
   * lo aprueben, así que las dos cosas suman igual.
   */
  comerciosEnRevision: number
  minimo: number
  /** Cuántos comercios le faltan de verdad. 0 = mínimo cumplido. */
  faltan: number
  /**
   * `faltan > 0` pero lo que tiene en revisión ya alcanza para cubrirlo.
   *
   * Existe para no mandarlo a hacer trabajo que ya hizo: con 1 aprobado y 2 en
   * revisión sobre un mínimo de 3, el cálculo directo dice "faltan 2" y el
   * gondolero sale a buscar dos comercios que ya relevó.
   */
  enRevisionAlcanza: boolean
  /**
   * ANOMALÍA: el mínimo está cumplido y todavía hay puntos aprobados retenidos.
   *
   * No debería ocurrir. `aprobarMisionCore` corre la barrida de liberación en
   * CADA aprobación, así que alcanzado el mínimo no puede quedar nada aprobado
   * en 'retenido'. Si esto aparece, la liberación no corrió cuando debía —
   * probablemente un error tragado en el camino de aprobación.
   */
  listoPeroRetenido: boolean
}

export interface ResumenRetenidos {
  total: number
  totalEsperandoAprobacion: number
  totalEsperandoMinimo: number
  /** Altas cargadas esperando que la distribuidora valide el comercio. */
  totalEsperandoValidacion: number
  /** Ordenadas por accionabilidad: primero las que están más cerca del mínimo. */
  campanas: CampanaRetenida[]
}

const VACIO: ResumenRetenidos = {
  total: 0, totalEsperandoAprobacion: 0, totalEsperandoMinimo: 0,
  totalEsperandoValidacion: 0, campanas: [],
}

/**
 * Una sola consulta, que sirve a las tres pantallas que muestran esto: Logros,
 * Actividad y el detalle de campaña.
 *
 * Trae TODAS las misiones del gondolero y no solo las retenidas, a propósito:
 * para contar comercios aprobados distintos hace falta el universo completo.
 * Se podría filtrar apoyándose en que una campaña con retenidos no puede tener
 * acreditados, pero es un invariante sutil y son unas decenas de filas.
 */
export async function obtenerPuntosRetenidos(
  gondoleroId: string,
  admin: Admin,
): Promise<ResumenRetenidos> {
  try {
    const { data, error } = await admin
      .from('misiones')
      .select('campana_id, comercio_id, estado, puntos_total, bounty_estado, campana:campanas(nombre, min_comercios_para_cobrar)')
      .eq('gondolero_id', gondoleroId)

    if (error) {
      console.error('[puntos-retenidos] error leyendo misiones:', error.message)
      return VACIO
    }

    type Fila = {
      campana_id: string | null
      comercio_id: string | null
      estado: string | null
      puntos_total: number | null
      bounty_estado: string | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      campana: any
    }
    const filas = ((data ?? []) as Fila[]).filter(f => f.campana_id)

    // ── Altas esperando validación ────────────────────────────────────────────
    //
    // Se consultan aparte porque **no hay misión de la cual colgarlas**: en una
    // campaña de altas la misión se crea recién al validar el comercio. Sin esta
    // consulta el gondolero cargaba tres comercios y el bloque no mostraba nada.
    //
    // Va acá y no en un helper propio porque el número tiene que entrar al mismo
    // cálculo de "cuánto falta para el mínimo": un comercio cargado cuenta
    // cuando lo validen, igual que una foto cuenta cuando la aprueben.
    const { data: altasData, error: errAltas } = await admin
      .from('comercios')
      .select('id, estado, campana_id, campana:campanas(nombre, tipo, min_comercios_para_cobrar, puntos_por_mision, puntos_por_foto)')
      .eq('registrado_por', gondoleroId)
      .not('campana_id', 'is', null)

    if (errAltas) console.error('[puntos-retenidos] error leyendo altas:', errAltas.message)

    type FilaAlta = {
      id: string
      estado: string | null
      campana_id: string | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      campana: any
    }
    // Solo las que esperan: una validada ya tiene misión y entra por el camino
    // de arriba; una rechazada no va a pagar nunca.
    const altas = ((altasData ?? []) as FilaAlta[])
      .filter(a => a.campana_id && a.estado === 'pendiente_validacion')

    if (filas.length === 0 && altas.length === 0) return VACIO

    const porCampana = new Map<string, {
      nombre: string
      minimo: number
      aprobados: Set<string>
      enRevision: Set<string>
      esperandoValidacion: Set<string>
      ptsAprobacion: number
      ptsMinimo: number
      ptsValidacion: number
    }>()

    for (const f of filas) {
      const campanaId = f.campana_id as string
      const camp = Array.isArray(f.campana) ? f.campana[0] : f.campana

      if (!porCampana.has(campanaId)) {
        porCampana.set(campanaId, {
          nombre:              camp?.nombre ?? 'Campaña',
          minimo:              camp?.min_comercios_para_cobrar ?? 0,
          aprobados:           new Set(),
          enRevision:          new Set(),
          esperandoValidacion: new Set(),
          ptsAprobacion:       0,
          ptsMinimo:           0,
          ptsValidacion:       0,
        })
      }
      const acc = porCampana.get(campanaId)!
      const puntos = f.puntos_total ?? 0

      if (f.estado === 'aprobada') {
        if (f.comercio_id) acc.aprobados.add(f.comercio_id)
        if (f.bounty_estado === 'retenido') acc.ptsMinimo += puntos
      } else if (f.estado !== 'descartada' && f.estado !== 'rechazada') {
        // Pendiente / en revisión. Las cerradas sin acreditar tienen el bounty
        // en 'anulado' y no suman, pero se excluyen por estado igual para no
        // contar sus comercios como "en revisión".
        if (f.comercio_id) acc.enRevision.add(f.comercio_id)
        if (f.bounty_estado === 'retenido') acc.ptsAprobacion += puntos
      }
    }

    // Las altas pendientes, después de las misiones: una campaña de altas sin
    // ninguna misión todavía no está en el mapa, así que acá se crea su entrada.
    for (const a of altas) {
      const campanaId = a.campana_id as string
      const camp = Array.isArray(a.campana) ? a.campana[0] : a.campana
      if (camp?.tipo !== 'comercios') continue   // solo el alta que se paga

      if (!porCampana.has(campanaId)) {
        porCampana.set(campanaId, {
          nombre:              camp?.nombre ?? 'Campaña',
          minimo:              camp?.min_comercios_para_cobrar ?? 0,
          aprobados:           new Set(),
          enRevision:          new Set(),
          esperandoValidacion: new Set(),
          ptsAprobacion:       0,
          ptsMinimo:           0,
          ptsValidacion:       0,
        })
      }
      const acc = porCampana.get(campanaId)!
      acc.esperandoValidacion.add(a.id)
      // Cuenta para el mínimo igual que una foto en revisión: es trabajo
      // entregado que va a contar cuando lo validen.
      acc.enRevision.add(a.id)
      acc.ptsValidacion += puntosDeLaCampana(camp ?? {})
    }

    const campanas: CampanaRetenida[] = []
    for (const [campanaId, acc] of porCampana.entries()) {
      if (acc.ptsAprobacion === 0 && acc.ptsMinimo === 0 && acc.ptsValidacion === 0) continue

      const comerciosAprobados = acc.aprobados.size
      // Un comercio que ya está aprobado no vuelve a contar como "en revisión":
      // sin esto, una segunda visita al mismo comercio inflaría la proyección.
      const enRevisionNuevos = [...acc.enRevision].filter(c => !acc.aprobados.has(c)).length
      const faltan = Math.max(0, acc.minimo - comerciosAprobados)

      campanas.push({
        campanaId,
        nombre:                       acc.nombre,
        puntosEsperandoAprobacion:    acc.ptsAprobacion,
        puntosEsperandoValidacion:    acc.ptsValidacion,
        comerciosEsperandoValidacion: acc.esperandoValidacion.size,
        puntosEsperandoMinimo:        acc.ptsMinimo,
        comerciosAprobados,
        comerciosEnRevision:          enRevisionNuevos,
        minimo:                    acc.minimo,
        faltan,
        enRevisionAlcanza:         faltan > 0 && enRevisionNuevos >= faltan,
        listoPeroRetenido:         faltan === 0 && acc.ptsMinimo > 0,
      })
    }

    // Primero lo accionable, y dentro de eso lo más cerca de cobrarse. Las que
    // solo esperan aprobación no tienen nada que hacer y van al final: así las
    // dos que se abren por defecto son siempre las dos más accionables.
    campanas.sort((a, b) => {
      const aAcc = a.faltan > 0
      const bAcc = b.faltan > 0
      if (aAcc !== bAcc) return aAcc ? -1 : 1
      if (aAcc && bAcc) return a.faltan - b.faltan
      return (b.puntosEsperandoAprobacion + b.puntosEsperandoValidacion)
           - (a.puntosEsperandoAprobacion + a.puntosEsperandoValidacion)
    })

    const totalEsperandoAprobacion = campanas.reduce((s, c) => s + c.puntosEsperandoAprobacion, 0)
    const totalEsperandoMinimo     = campanas.reduce((s, c) => s + c.puntosEsperandoMinimo, 0)
    const totalEsperandoValidacion = campanas.reduce((s, c) => s + c.puntosEsperandoValidacion, 0)

    // Si aparece en producción, la liberación no corrió cuando debía.
    const anomalas = campanas.filter(c => c.listoPeroRetenido)
    if (anomalas.length > 0) {
      console.warn(
        '[puntos-retenidos] mínimo cumplido con puntos aprobados todavía retenidos — la liberación no corrió',
        { gondoleroId, campanas: anomalas.map(c => ({ id: c.campanaId, puntos: c.puntosEsperandoMinimo })) }
      )
    }

    return {
      total: totalEsperandoAprobacion + totalEsperandoMinimo + totalEsperandoValidacion,
      totalEsperandoAprobacion,
      totalEsperandoMinimo,
      totalEsperandoValidacion,
      campanas,
    }
  } catch (err) {
    console.error('[puntos-retenidos] error inesperado:', err)
    return VACIO
  }
}

/** La frase de estado de una campaña. Una sola vez, para las tres pantallas. */
export function frasePuntosRetenidos(c: CampanaRetenida): { principal: string; detalle: string | null } {
  if (c.listoPeroRetenido) {
    return { principal: 'Listo para cobrar, esperando aprobación.', detalle: null }
  }
  if (c.puntosEsperandoMinimo > 0) {
    if (c.enRevisionAlcanza) {
      return {
        principal: 'Ya relevaste los comercios que hacen falta.',
        detalle:   'Se acreditan cuando aprueben lo que está en revisión.',
      }
    }
    // El número grande es el REAL —lo que la base va a exigir— y el matiz va
    // abajo. Decir "falta 1" contando los que están en revisión sería prometer
    // una aprobación que puede no llegar.
    const principal = `A ${c.faltan} ${c.faltan === 1 ? 'comercio' : 'comercios'} de cobrar.`
    // Cuando lo que está en camino son ALTAS, el verbo es validar. Ver abajo.
    const n = c.comerciosEnRevision
    const soloAltas = c.comerciosEsperandoValidacion === n && n > 0
    const detalle = n > 0
      ? soloAltas
        ? `Tenés ${n} ${n === 1 ? 'comercio cargado que cuenta' : 'comercios cargados que cuentan'} cuando ${n === 1 ? 'lo validen' : 'los validen'}.`
        : `Tenés ${n} en revisión que ${n === 1 ? 'cuenta' : 'cuentan'} cuando ${n === 1 ? 'lo aprueben' : 'los aprueben'}.`
      : null
    return { principal, detalle }
  }

  // ── VALIDAR NO ES APROBAR ─────────────────────────────────────────────────
  // Son dos actos distintos, en dos pantallas distintas, y los hace otra
  // persona: una foto la APRUEBA quien revisa el trabajo; un comercio nuevo lo
  // VALIDA quien decide si ese punto de venta existe y sirve. Decirle al
  // gondolero que espere una aprobación cuando lo que espera es una validación
  // lo manda a buscar algo que no va a encontrar en ningún lado.
  if (c.puntosEsperandoValidacion > 0 && c.puntosEsperandoAprobacion === 0) {
    return { principal: 'Esperando que validen los comercios que cargaste.', detalle: null }
  }
  if (c.puntosEsperandoValidacion > 0) {
    return {
      principal: 'Esperando revisión.',
      detalle:   `${c.comerciosEsperandoValidacion} ${c.comerciosEsperandoValidacion === 1 ? 'comercio espera' : 'comercios esperan'} validación.`,
    }
  }
  // "que revisen" y no "que la distribuidora revise": las campañas de marca y
  // las de GondolApp las revisa otro panel, y nombrar al revisor equivocado es
  // peor que no nombrarlo.
  return { principal: 'Esperando que revisen tus fotos.', detalle: null }
}
