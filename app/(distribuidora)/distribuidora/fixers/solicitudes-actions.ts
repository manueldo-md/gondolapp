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

export async function aprobarSolicitudFixer(
  solicitudId: string,
  fixerId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profileUpdate, solicitudUpdate] = await Promise.all([
    admin.from('profiles').update({ distri_id: distriId }).eq('id', fixerId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_distri_solicitudes')
      .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
      .eq('id', solicitudId),
  ])

  if (profileUpdate.error) return { error: 'No se pudo aprobar. ' + profileUpdate.error.message }
  if (solicitudUpdate.error) return { error: 'No se pudo actualizar la solicitud. ' + solicitudUpdate.error.message }

  // Notificación al fixer
  await admin.from('notificaciones').insert({
    gondolero_id: fixerId,
    actor_id:     fixerId,
    actor_tipo:   'fixer',
    tipo:         'solicitud_aprobada',
    titulo:       '¡Solicitud aprobada!',
    mensaje:      `Ya sos parte de ${distriNombre}. ¡Bienvenido al equipo!`,
    leida:        false,
  })

  revalidatePath('/distribuidora/fixers')
  return {}
}

export async function rechazarSolicitudFixer(
  solicitudId: string,
  fixerId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_distri_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo rechazar. ' + error.message }

  // Notificación al fixer
  await admin.from('notificaciones').insert({
    gondolero_id: fixerId,
    actor_id:     fixerId,
    actor_tipo:   'fixer',
    tipo:         'solicitud_rechazada',
    titulo:       'Solicitud no aprobada',
    mensaje:      `Tu solicitud a ${distriNombre} no fue aprobada. Podés solicitar otra distribuidora desde tu perfil.`,
    leida:        false,
  })

  revalidatePath('/distribuidora/fixers')
  return {}
}
