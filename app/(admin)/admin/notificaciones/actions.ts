'use server'

import { getAdmin } from '@/lib/admin-sesion'
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
