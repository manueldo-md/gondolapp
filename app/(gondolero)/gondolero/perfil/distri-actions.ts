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

  // Vincular el gondolero a la distribuidora
  const { error } = await admin
    .from('profiles')
    .update({ distri_id: distriId })
    .eq('id', gondoleroId)

  if (error) return { error: 'No se pudo completar la vinculación. Intentá de nuevo.' }

  // Marcar solicitud como aprobada
  await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

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

export async function desvincularseDeDistri(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Obtener distri_id actual antes de desvincularse (para guardar historial)
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const antiguoDistriId = profile?.distri_id ?? null

  // Asegurar registro histórico antes de desvincular
  if (antiguoDistriId) {
    await admin
      .from('gondolero_distri_solicitudes')
      .upsert(
        { gondolero_id: user.id, distri_id: antiguoDistriId, estado: 'aprobada', updated_at: new Date().toISOString() },
        { onConflict: 'gondolero_id,distri_id' }
      )
  }

  const { error } = await admin
    .from('profiles')
    .update({ distri_id: null })
    .eq('id', user.id)

  if (error) return { error: 'No se pudo desvincular. Intentá de nuevo.' }

  revalidatePath('/gondolero/perfil')
  return {}
}
