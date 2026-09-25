'use server'
import { getAdmin } from '@/lib/admin-sesion'

import { revalidatePath } from 'next/cache'


export async function validarRepositora(repoId: string) {
  const admin = await getAdmin()
  await admin.from('repositoras').update({ validada: true }).eq('id', repoId)
  revalidatePath('/admin/repositoras')
  revalidatePath(`/admin/repositoras/${repoId}`)
}

export async function desactivarRepositora(repoId: string) {
  const admin = await getAdmin()
  await admin.from('repositoras').update({ validada: false }).eq('id', repoId)
  revalidatePath('/admin/repositoras')
  revalidatePath(`/admin/repositoras/${repoId}`)
}
