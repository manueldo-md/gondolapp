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

export async function aprobarSolicitud(
  solicitudId: string,
  gondoleroId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Actualizar el profile del gondolero: asignarle distri_id
  const [profileUpdate, solicitudUpdate] = await Promise.all([
    admin.from('profiles').update({ distri_id: distriId }).eq('id', gondoleroId),
    admin.from('gondolero_distri_solicitudes')
      .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
      .eq('id', solicitudId),
  ])

  if (profileUpdate.error) return { error: 'No se pudo aprobar. ' + profileUpdate.error.message }
  if (solicitudUpdate.error) return { error: 'No se pudo actualizar la solicitud. ' + solicitudUpdate.error.message }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    tipo: 'solicitud_aprobada',
    titulo: '¡Solicitud aprobada! 🎉',
    mensaje: `Ya sos parte de ${distriNombre}. ¡Bienvenido al equipo!`,
    leida: false,
  })

  revalidatePath('/distribuidora/gondoleros')
  return {}
}

export async function rechazarSolicitud(
  solicitudId: string,
  gondoleroId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo rechazar. ' + error.message }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    tipo: 'solicitud_rechazada',
    titulo: 'Solicitud no aprobada',
    mensaje: `Tu solicitud a ${distriNombre} no fue aprobada. Podés solicitar otra distribuidora desde tu perfil.`,
    leida: false,
  })

  revalidatePath('/distribuidora/gondoleros')
  return {}
}
