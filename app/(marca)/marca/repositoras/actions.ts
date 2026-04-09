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

export async function generarLinkInvitacionRepo(
  marcaId: string,
  marcaNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  if (!profile?.marca_id) {
    return { error: 'Tu perfil no tiene una marca vinculada. Contactá al administrador.' }
  }

  const marcaIdSeguro = profile.marca_id
  const token = crypto.randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('marca_repo_tokens').insert({
    token,
    marca_id: marcaIdSeguro,
    expira_at: expiraAt,
  })

  if (error) return { error: `No se pudo generar el link: ${error.message}` }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gondolapp-delta.vercel.app'
  return { link: `${appUrl}/vinculacion-repo?token=${token}` }
}

export async function terminarRelacionRepo(
  relacionId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const now = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('marca_repo_relaciones')
    .update({ estado: 'terminada', fecha_fin: now, updated_at: now })
    .eq('id', relacionId)

  if (error) return { error: 'No se pudo terminar la relación' }

  revalidatePath('/marca/repositoras')
  return {}
}
