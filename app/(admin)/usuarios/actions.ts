'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoActor } from '@/types'

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

export async function cambiarTipoActor(userId: string, nuevoTipo: TipoActor) {
  const admin = await getAdmin()
  await admin.from('profiles').update({ tipo_actor: nuevoTipo }).eq('id', userId)
  revalidatePath('/admin/usuarios')
}
