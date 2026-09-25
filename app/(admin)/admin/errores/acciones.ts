'use server'

import { getAdmin } from '@/lib/admin-sesion'
import { revalidatePath } from 'next/cache'

type EstadoError = 'nuevo' | 'revisado' | 'resuelto' | 'descartado'

export async function cambiarEstadoError(id: string, estado: EstadoError) {
  const admin = await getAdmin()
  await admin.from('errores_reportados').update({ estado }).eq('id', id)
  revalidatePath('/admin/errores')
}
