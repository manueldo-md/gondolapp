'use server'
import { getAdmin } from '@/lib/admin-sesion'

import { revalidatePath } from 'next/cache'


export async function validarDistribuidora(distriId: string) {
  const admin = await getAdmin()
  await admin.from('distribuidoras').update({ validada: true }).eq('id', distriId)
  revalidatePath('/admin/distribuidoras')
}

export async function crearDistribuidora(payload: {
  razon_social: string
  cuit: string | null
}): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.from('distribuidoras').insert({
    razon_social: payload.razon_social,
    cuit: payload.cuit,
    validada: false,
    tokens_disponibles: 0,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/distribuidoras')
  return {}
}
