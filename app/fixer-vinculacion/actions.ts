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
    await (admin as any)
      .from('fixer_distri_solicitudes')
      .upsert(
        { fixer_id: fixerId, distri_id: actorId, estado: 'pendiente', iniciado_por: 'fixer', updated_at: new Date().toISOString() },
        { onConflict: 'fixer_id,distri_id' }
      )
  } else {
    // repositora — crear solicitud en fixer_repo_solicitudes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('fixer_repo_solicitudes')
      .upsert(
        { fixer_id: fixerId, repositora_id: actorId, estado: 'pendiente', updated_at: new Date().toISOString() },
        { onConflict: 'fixer_id,repositora_id' }
      )
  }

  // Notificación al fixer
  await admin.from('notificaciones').insert({
    gondolero_id: fixerId,
    tipo: 'vinculacion_invitacion_enviada',
    titulo: `Solicitud enviada a ${actorNombre}`,
    mensaje: `Enviaste una solicitud para unirte a ${actorNombre}. Te notificaremos cuando la aprueben.`,
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
