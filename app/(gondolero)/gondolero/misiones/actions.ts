'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function abandonarCampana(campanaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('participaciones')
    .update({ estado: 'abandonada' })
    .eq('campana_id', campanaId)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')

  revalidatePath('/gondolero/misiones')
  revalidatePath(`/gondolero/misiones/${campanaId}`)
  revalidatePath('/gondolero/campanas')
}
