'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { crearNotificacionActor } from '@/lib/notificaciones'

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
  // Por el helper y no con un insert suelto: chequea el error y lo loguea. Este
  // mismo insert venía REBOTANDO —el CHECK de `tipo` no aceptaba 'vinculacion_nueva'—
  // y como nadie miraba el error, nadie recibió nunca este aviso.
  //
  // No corta el flujo si falla: el vínculo ya quedó registrado, y perderlo por
  // un aviso sería peor que el aviso que se pierde.
  await crearNotificacionActor(gondoleroId, false, {
    tipo: 'vinculacion_nueva',
    titulo: `¡Bienvenido al equipo de ${distriNombre}! 🎉`,
    mensaje: `Ya sos parte de ${distriNombre}. Revisá las campañas disponibles.`,
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
