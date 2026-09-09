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
 * C. Misión con alguna foto rechazada y ninguna pendiente: se rechaza.
 *    → actualizarEstadoMision() desde actions de rechazo (nuevo)
 *
 * En B y C el entry-point es actualizarEstadoMision(), que opera sobre
 * el mision_id derivado del fotoId.
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

  // 1. Marcar misión como aprobada
  await admin
    .from('misiones')
    .update({ estado: 'aprobada' })
    .eq('id', misionId)

  // 2. Contar misiones aprobadas del gondolero en la campaña
  //    (incluye la que acabamos de actualizar)
  const { count: misionesAprobadas } = await admin
    .from('misiones')
    .select('id', { count: 'exact', head: true })
    .eq('campana_id',   campanaId)
    .eq('gondolero_id', gondoleroId)
    .eq('estado',       'aprobada')

  const countAprobadas = misionesAprobadas ?? 0

  if (countAprobadas >= minParaCobrar) {
    // 3a. Obtener puntos de las misiones retenidas antes de liberarlas
    const { data: misionesRetenidas } = await admin
      .from('misiones')
      .select('id, puntos_total')
      .eq('campana_id',   campanaId)
      .eq('gondolero_id', gondoleroId)
      .eq('bounty_estado', 'retenido')

    // 3b. Liberar todas las misiones retenidas (incluye la actual)
    await admin
      .from('misiones')
      .update({ bounty_estado: 'acreditado' })
      .eq('campana_id',   campanaId)
      .eq('gondolero_id', gondoleroId)
      .eq('bounty_estado', 'retenido')

    // 3c. Insertar movimiento por el total liberado.
    //     El trigger on_movimiento_puntos actualiza profiles.puntos_disponibles.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalPuntos = (misionesRetenidas ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum, m) => sum + (((m as any).puntos_total as number) ?? 0), 0
    )
    if (totalPuntos > 0) {
      await admin.from('movimientos_puntos').insert({
        gondolero_id: gondoleroId,
        tipo:         'credito',
        monto:        Math.round(totalPuntos),
        concepto:     `Puntos desbloqueados · ${countAprobadas} misiones aprobadas`,
        campana_id:   campanaId,
      })
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
    console.error('[resolverMisionDirecta] Error (no-op):', err)
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

    // 2. Leer estados de todas las fotos de la misión
    const { data: fotosData } = await admin
      .from('fotos')
      .select('estado')
      .eq('mision_id', misionId)

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
    // Caso C (diferido): fotos con rechazadas → misión queda en pendiente
    // hasta implementar flujo de recaptura.
    // Si aún hay pendientes/en_revision → esperar; no hacer nada.

  } catch (err) {
    console.error('[actualizarEstadoMision] Error (no-op):', err)
  }
}
