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
