/**
 * lib/misiones.ts
 * Helper de servidor para actualizar el estado de una misión
 * tras la aprobación de una de sus fotos.
 *
 * Diseño:
 * - Se invoca desde las tres actions de aprobación (admin, distri, marca).
 * - No lanza errores propios: loguea y retorna silenciosamente para no
 *   interrumpir el flujo principal de aprobación de foto.
 * - opera siempre con el client admin (service_role) que ya viene creado.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Después de aprobar una foto:
 * 1. Verifica si TODAS las fotos de la misión están aprobadas.
 * 2. Si sí → actualiza misiones.estado = 'aprobada'.
 * 3. Cuenta misiones aprobadas del gondolero en la campaña.
 * 4. Si count >= minParaCobrar → libera bounty_estado = 'acreditado'
 *    en la misión actual y en todas las anteriores que estuviesen retenidas.
 * 5. Si count < minParaCobrar → bounty_estado permanece 'retenido'.
 */
export async function actualizarEstadoMision(params: {
  fotoId:        string
  gondoleroId:   string
  campanaId:     string
  minParaCobrar: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin:         SupabaseClient<any, any, any>
}): Promise<void> {
  const { fotoId, gondoleroId, campanaId, minParaCobrar, admin } = params

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

    // 2. Verificar si TODAS las fotos de la misión están aprobadas
    const [{ count: totalFotos }, { count: fotosAprobadas }] = await Promise.all([
      admin.from('fotos')
        .select('id', { count: 'exact', head: true })
        .eq('mision_id', misionId),
      admin.from('fotos')
        .select('id', { count: 'exact', head: true })
        .eq('mision_id', misionId)
        .eq('estado', 'aprobada'),
    ])

    const todasAprobadas = (totalFotos ?? 0) > 0 && (fotosAprobadas ?? 0) === (totalFotos ?? 0)
    if (!todasAprobadas) return

    // 3. Actualizar misiones.estado = 'aprobada'
    await admin
      .from('misiones')
      .update({ estado: 'aprobada' })
      .eq('id', misionId)

    // 4. Contar misiones aprobadas del gondolero en esta campaña
    //    (incluye la que acabamos de actualizar en el paso anterior)
    const { count: misionesAprobadas } = await admin
      .from('misiones')
      .select('id', { count: 'exact', head: true })
      .eq('campana_id',  campanaId)
      .eq('gondolero_id', gondoleroId)
      .eq('estado', 'aprobada')

    const countAprobadas = misionesAprobadas ?? 0

    if (countAprobadas >= minParaCobrar) {
      // 5. Liberar todas las misiones retenidas (incluye la actual, que aún
      //    tiene bounty_estado = 'retenido' desde registrarMision)
      await admin
        .from('misiones')
        .update({ bounty_estado: 'acreditado' })
        .eq('campana_id',   campanaId)
        .eq('gondolero_id',  gondoleroId)
        .eq('bounty_estado', 'retenido')
    }
    // Si count < minParaCobrar → bounty_estado se queda en 'retenido'

  } catch (err) {
    console.error('[actualizarEstadoMision] Error (no-op):', err)
  }
}
