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

export async function crearUsuario(payload: {
  email: string
  password: string
  nombre: string
  tipo_actor: TipoActor
  distri_id?: string | null
  marca_id?: string | null
}): Promise<{ error?: string }> {
  const admin = await getAdmin()

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      tipo_actor: payload.tipo_actor,
      nombre: payload.nombre,
      distri_id: payload.distri_id || null,
      marca_id: payload.marca_id || null,
    },
  })

  if (authError) return { error: authError.message }

  // Asegurarse que el profile quede bien (por si el trigger no corrió aún)
  await admin.from('profiles').update({
    tipo_actor: payload.tipo_actor,
    nombre: payload.nombre,
    distri_id: payload.distri_id || null,
    marca_id: payload.marca_id || null,
  }).eq('id', authData.user.id)

  revalidatePath('/admin/usuarios')
  return {}
}
