'use server'

import { getAdmin } from '@/lib/admin-sesion'
import { marcarNotificacionLeida } from '@/lib/marcar-notificacion'
import { revalidatePath } from 'next/cache'

export async function marcarNotificacionesAdminLeidas() {
  const admin = await getAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('notificaciones')
    .update({ leida: true })
    .eq('actor_tipo', 'admin')
    .eq('leida', false)

  revalidatePath('/admin/notificaciones')
}

/**
 * Marca UNA como leída. La regla vive en lib/marcar-notificacion.ts.
 *
 * La variante `admin` no lleva id de dueño porque la bandeja es del EQUIPO
 * —`actor_tipo = 'admin'` con `actor_id` en NULL—, así que lo único que la
 * protege es `getAdmin()`. Ver el comentario de esa variante.
 */
export async function marcarUnaNotificacionAdminLeida(notificacionId: string) {
  const admin = await getAdmin()
  await marcarNotificacionLeida(notificacionId, { tipo: 'admin' }, admin)
  revalidatePath('/admin/notificaciones')
}
