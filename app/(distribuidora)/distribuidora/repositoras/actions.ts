'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function generarLinkInvitacionDistriRepo(
  distriId: string,
  distriNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  if (!profile?.distri_id) {
    return { error: 'Tu perfil no tiene una distribuidora vinculada. Contactá al administrador.' }
  }

  const distriIdSeguro = profile.distri_id
  const token = crypto.randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('distri_repo_tokens').insert({
    token,
    distri_id: distriIdSeguro,
    expira_at: expiraAt,
  })

  if (error) return { error: `No se pudo generar el link: ${error.message}` }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gondolapp-delta.vercel.app'
  return { link: `${appUrl}/vinculacion-distri-repo?token=${token}` }
}

export async function terminarRelacionDistriRepo(
  relacionId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const now = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('distri_repo_relaciones')
    .update({ estado: 'terminada', updated_at: now })
    .eq('id', relacionId)

  if (error) return { error: 'No se pudo terminar la relación' }

  revalidatePath('/distribuidora/repositoras')
  return {}
}
