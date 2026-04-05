'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

async function getAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function pausarCampana(campanaId: string) {
  const admin = await getAdmin()
  await admin.from('campanas').update({ estado: 'pausada' }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}

export async function activarCampana(campanaId: string) {
  const admin = await getAdmin()
  await admin.from('campanas').update({ estado: 'activa' }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}

export async function cerrarCampana(campanaId: string) {
  const admin = await getAdmin()
  await admin.from('campanas').update({ estado: 'cerrada' }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}

export async function aprobarCampanaPendiente(campanaId: string) {
  const admin = await getAdmin()
  await admin.from('campanas').update({ estado: 'activa' }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}

export async function rechazarCampanaPendiente(campanaId: string, motivo?: string) {
  const admin = await getAdmin()
  await admin.from('campanas').update({ estado: 'borrador', motivo_rechazo: motivo ?? null }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}
