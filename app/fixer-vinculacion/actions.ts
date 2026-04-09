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

export async function aceptarInvitacionFixer(
  tokenId: string,
  fixerId: string,
  actorId: string,
  actorNombre: string,
  actorTipo: 'distri' | 'repositora'
): Promise<{ error?: string }> {
  const admin = adminClient()

  // Marcar token como usado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('fixer_invitacion_tokens').update({ usado: true }).eq('id', tokenId)

  if (actorTipo === 'distri') {
    // Crear solicitud en fixer_distri_solicitudes con estado 'pendiente' (el distri la aprueba)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: distriData, error: distriError } = await (admin as any)
      .from('fixer_distri_solicitudes')
      .upsert(
        { fixer_id: fixerId, distri_id: actorId, estado: 'pendiente', iniciado_por: 'fixer', updated_at: new Date().toISOString() },
        { onConflict: 'fixer_id,distri_id' }
      )
      .select()
    console.log('[fixer-invite] distri insert result:', { data: distriData, error: distriError })
    if (distriError) return { error: 'No se pudo registrar la solicitud: ' + distriError.message }
  } else {
    // repositora — crear solicitud en fixer_repo_solicitudes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: repoData, error: repoError } = await (admin as any)
      .from('fixer_repo_solicitudes')
      .upsert(
        { fixer_id: fixerId, repositora_id: actorId, estado: 'pendiente', updated_at: new Date().toISOString() },
        { onConflict: 'fixer_id,repositora_id' }
      )
      .select()
    console.log('[repo-invite] insert result:', { data: repoData, error: repoError })
    if (repoError) return { error: 'No se pudo registrar la solicitud: ' + repoError.message }

    // Actualizar repositora_id en el profile del fixer si no tiene ninguno aún
    const { data: profileCheck } = await admin
      .from('profiles')
      .select('repositora_id')
      .eq('id', fixerId)
      .single()
    if (!profileCheck?.repositora_id) {
      const { error: profileError } = await admin
        .from('profiles')
        .update({ repositora_id: actorId })
        .eq('id', fixerId)
      console.log('[repo-invite] profile update:', profileError ?? 'ok')
      if (profileError) return { error: 'Solicitud registrada pero no se pudo vincular el perfil.' }
    }

    revalidatePath('/repositora/fixers')
  }

  // Notificación al fixer
  await admin.from('notificaciones').insert({
    gondolero_id: fixerId,
    tipo: 'vinculacion_invitacion_enviada',
    titulo: `Te uniste al equipo de ${actorNombre} 🎉`,
    mensaje: `Ya sos parte de ${actorNombre}. Podés empezar a recibir misiones.`,
    leida: false,
  })

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function rechazarInvitacionFixer(
  tokenId: string
): Promise<{ error?: string }> {
  const admin = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('fixer_invitacion_tokens').update({ usado: true }).eq('id', tokenId)
  return {}
}
