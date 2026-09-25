'use server'
import { getAdmin } from '@/lib/admin-sesion'

import { revalidatePath } from 'next/cache'


export async function procesarCanje(canjeId: string, codigo: string | null) {
  const admin = await getAdmin()
  await admin.from('canjes').update({
    estado: 'procesado',
    codigo_entregado: codigo,
    procesado_at: new Date().toISOString(),
  }).eq('id', canjeId)
  revalidatePath('/admin/canjes')
}
