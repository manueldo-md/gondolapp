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

export async function crearRepositora(formData: FormData): Promise<{ error?: string } | undefined> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('tipo_actor')
    .eq('id', user.id)
    .single()

  if (profile?.tipo_actor !== 'admin') {
    return { error: 'No tenés permiso para realizar esta acción.' }
  }

  const razonSocial = (formData.get('razon_social') as string)?.trim()
  const cuit        = (formData.get('cuit') as string)?.trim() || null

  if (!razonSocial) return { error: 'La razón social es requerida.' }

  const { error: repoError } = await admin
    .from('repositoras')
    .insert({ razon_social: razonSocial, cuit })

  if (repoError) return { error: repoError.message }

  revalidatePath('/admin/repositoras')
  redirect('/admin/repositoras')
}
