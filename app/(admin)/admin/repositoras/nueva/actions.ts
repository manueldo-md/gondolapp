'use server'

import { getAdmin } from '@/lib/admin-sesion'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function crearRepositora(formData: FormData): Promise<{ error?: string } | undefined> {
  // El chequeo de tipo_actor que estaba escrito acá vive ahora en
  // getAdmin(), junto con el de las otras 39 actions del panel.
  const admin = await getAdmin()

  const razonSocial = (formData.get('razon_social') as string)?.trim()
  const cuit        = (formData.get('cuit') as string)?.trim() || null

  if (!razonSocial) return { error: 'La razón social es requerida.' }

  const { error: repoError } = await admin
    .from('repositoras')
    .insert({ razon_social: razonSocial, cuit })

  if (repoError) return { error: repoError.message }

  revalidatePath('/admin/repositoras')
  redirect('/admin/repositoras')
}
