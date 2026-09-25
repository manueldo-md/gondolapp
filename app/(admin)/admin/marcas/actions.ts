'use server'
import { getAdmin } from '@/lib/admin-sesion'

import { revalidatePath } from 'next/cache'


export async function validarMarca(marcaId: string) {
  const admin = await getAdmin()
  await admin.from('marcas').update({ validada: true }).eq('id', marcaId)
  revalidatePath('/admin/marcas')
  revalidatePath('/admin/tablero')
}

export async function crearMarca(payload: {
  razon_social: string
  cuit: string | null
}): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.from('marcas').insert({
    razon_social: payload.razon_social,
    cuit: payload.cuit,
    validada: false,
    tokens_disponibles: 0,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/marcas')
  return {}
}
