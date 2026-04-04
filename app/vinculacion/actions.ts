'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aceptarInvitacion(
  tokenId: string,
  gondoleroId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const admin = adminClient()

  // Marcar token como usado
  await admin.from('vinculacion_tokens').update({
    usado: true,
    gondolero_id: gondoleroId,
  }).eq('id', tokenId)

  // Registrar vinculación en solicitudes (fuente de verdad en nuevo modelo)
  await admin
    .from('gondolero_distri_solicitudes')
    .upsert(
      { gondolero_id: gondoleroId, distri_id: distriId, estado: 'aprobada', iniciado_por: 'distri', updated_at: new Date().toISOString() },
      { onConflict: 'gondolero_id,distri_id' }
    )

  // Actualizar profiles.distri_id solo si no tiene ninguna distri principal aún
  const { data: profileCheck } = await admin.from('profiles').select('distri_id').eq('id', gondoleroId).single()
  if (!profileCheck?.distri_id) {
    const { error } = await admin.from('profiles').update({ distri_id: distriId }).eq('id', gondoleroId)
    if (error) return { error: 'No se pudo completar la vinculación.' }
  }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    tipo: 'vinculacion_nueva',
    titulo: `¡Bienvenido al equipo de ${distriNombre}! 🎉`,
    mensaje: `Ya sos parte de ${distriNombre}. Revisá las campañas disponibles.`,
    leida: false,
  })

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function rechazarInvitacion(
  tokenId: string
): Promise<{ error?: string }> {
  const admin = adminClient()
  await admin.from('vinculacion_tokens').update({ usado: true }).eq('id', tokenId)
  return {}
}
