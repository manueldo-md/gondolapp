'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

type EstadoError = 'nuevo' | 'revisado' | 'resuelto' | 'descartado'

async function verificarAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles').select('tipo_actor').eq('id', user.id).single()
  if (profile?.tipo_actor !== 'admin') redirect('/auth')

  return admin
}

export async function cambiarEstadoError(id: string, estado: EstadoError) {
  const admin = await verificarAdmin()
  await admin.from('errores_reportados').update({ estado }).eq('id', id)
  revalidatePath('/admin/errores')
}
