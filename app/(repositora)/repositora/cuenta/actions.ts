'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function actualizarCuentaRepo({ nombre, celular }: { nombre: string; celular: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('profiles')
    .update({ nombre: nombre.trim(), celular: celular.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  revalidatePath('/repositora/cuenta')
}
