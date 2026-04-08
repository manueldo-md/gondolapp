'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function solicitarVinculacion(
  distriId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Verificar que la distribuidora existe y está validada
  const { data: distri } = await admin
    .from('distribuidoras')
    .select('id, razon_social')
    .eq('id', distriId)
    .eq('validada', true)
    .single()

  if (!distri) return { error: 'Distribuidora no encontrada' }

  // Insertar solicitud (si ya existe una previa rechazada, se puede volver a solicitar)
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .upsert(
      {
        gondolero_id: user.id,
        distri_id: distriId,
        estado: 'pendiente',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gondolero_id,distri_id' }
    )

  if (error) return { error: 'No se pudo enviar la solicitud. Intentá de nuevo.' }

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function aceptarVinculacionDistri(
  solicitudId: string,
  gondoleroId: string,
  distriId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Marcar solicitud como aprobada (fuente de verdad en nuevo modelo)
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo completar la vinculación. Intentá de nuevo.' }

  // Actualizar profiles.distri_id solo si no tiene ninguna distri principal aún
  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', gondoleroId).single()
  if (!profile?.distri_id) {
    await admin.from('profiles').update({ distri_id: distriId }).eq('id', gondoleroId)
  }

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function rechazarVinculacionDistri(
  solicitudId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function aceptarVinculacionRepo(
  solicitudId: string,
  fixerId: string,
  repoId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo completar la vinculación. Intentá de nuevo.' }

  await admin.from('profiles').update({ repositora_id: repoId }).eq('id', fixerId)

  revalidatePath('/gondolero/perfil')
  revalidatePath('/repositora/fixers')
  return {}
}

export async function rechazarVinculacionRepo(
  solicitudId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function aceptarVinculacionDistri_Fixer(
  solicitudId: string,
  fixerId: string,
  distriId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { error } = await admin
    .from('fixer_distri_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo completar la vinculación. Intentá de nuevo.' }

  // Actualizar distri_id en profile si no tiene ninguna aún
  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', fixerId).single()
  if (!profile?.distri_id) {
    await admin.from('profiles').update({ distri_id: distriId }).eq('id', fixerId)
  }

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function rechazarVinculacionDistri_Fixer(
  solicitudId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  await admin
    .from('fixer_distri_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function desvincularseDeDistri(distriId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Marcar la vinculación como terminada (histórico permanente)
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'terminada', updated_at: new Date().toISOString() })
    .eq('gondolero_id', user.id)
    .eq('distri_id', distriId)

  if (error) return { error: 'No se pudo desvincular. Intentá de nuevo.' }

  // Si esta era la distri principal, asignar otra activa como principal (o null)
  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', user.id).single()
  if (profile?.distri_id === distriId) {
    const { data: otraDistri } = await admin
      .from('gondolero_distri_solicitudes')
      .select('distri_id')
      .eq('gondolero_id', user.id)
      .eq('estado', 'aprobada')
      .neq('distri_id', distriId)
      .limit(1)
      .maybeSingle()

    await admin.from('profiles').update({ distri_id: otraDistri?.distri_id ?? null }).eq('id', user.id)
  }

  revalidatePath('/gondolero/perfil')
  return {}
}
