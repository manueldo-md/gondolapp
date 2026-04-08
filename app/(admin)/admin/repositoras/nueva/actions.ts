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
  const email       = (formData.get('email') as string)?.trim() || null
  const password    = (formData.get('password') as string)?.trim() || null

  if (!razonSocial) return { error: 'La razón social es requerida.' }

  // 1. Crear repositora
  const { data: repo, error: repoError } = await admin
    .from('repositoras')
    .insert({ razon_social: razonSocial, cuit })
    .select('id')
    .single()

  if (repoError) return { error: repoError.message }

  // 2. Crear usuario admin de la repositora (si se proporcionó email)
  if (email && password) {
    if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        tipo_actor: 'repositora',
        nombre: razonSocial,
        repositora_id: repo.id,
      },
    })

    if (authError) return { error: 'Repositora creada pero no se pudo crear el usuario: ' + authError.message }

    await admin.from('profiles').update({
      tipo_actor: 'repositora',
      nombre: razonSocial,
      repositora_id: repo.id,
    }).eq('id', authData.user.id)
  }

  revalidatePath('/admin/repositoras')
  redirect('/admin/repositoras')
}
