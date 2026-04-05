'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function marcarNotificacionesMarcaLeidas(marcaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('notificaciones')
    .update({ leida: true })
    .eq('actor_id', marcaId)
    .eq('actor_tipo', 'marca')
    .eq('leida', false)

  revalidatePath('/marca/notificaciones')
}
