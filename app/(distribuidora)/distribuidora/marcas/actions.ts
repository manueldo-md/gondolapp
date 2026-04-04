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

export async function generarLinkInvitacionDistri(
  distriId: string,
  distriNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const token = crypto.randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from('marca_distri_tokens').insert({
    token,
    iniciado_por: 'distri',
    distri_id: distriId,
    expira_at: expiraAt,
  })

  console.log('[generarLinkDistri] distriId:', distriId)
  console.log('[generarLinkDistri] insert error:', error)

  if (error) return { error: `No se pudo generar el link: ${error.message}` }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/vinculacion-marca?token=${token}`
  return { link }
}

export async function terminarRelacionDistri(
  relacionId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { error } = await admin
    .from('marca_distri_relaciones')
    .update({ estado: 'terminada', updated_at: new Date().toISOString() })
    .eq('id', relacionId)

  if (error) return { error: 'No se pudo terminar la relación' }

  revalidatePath('/distribuidora/marcas')
  return {}
}
