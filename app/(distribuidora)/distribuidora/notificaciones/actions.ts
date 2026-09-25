'use server'

import { distriDeLaSesion } from '@/lib/actor-sesion'
import { marcarNotificacionLeida } from '@/lib/marcar-notificacion'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

/**
 * `distriId` SALIÓ DE LA FIRMA. Hasta el 25/9/2026 llegaba por parámetro y se
 * usaba tal cual: cualquier autenticado podía marcarle las notificaciones como
 * leídas a cualquier otra empresa. Es el caso de libro de la regla —el id de la
 * entidad del que llama se deriva de la sesión— y por eso se arregla borrándolo.
 */
export async function marcarNotificacionesDistriLeidas() {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('notificaciones')
    .update({ leida: true })
    .eq('actor_id', distriId)
    .eq('actor_tipo', 'distribuidora')
    .eq('leida', false)

  revalidatePath('/distribuidora/notificaciones')
}

function adminNotif() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Marca UNA como leída. La regla vive en lib/marcar-notificacion.ts; acá solo
 * se resuelve de quién es la bandeja. Ver el encabezado de ese archivo.
 */
export async function marcarUnaNotificacionDistriLeida(notificacionId: string) {
  const admin = adminNotif()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) return

  await marcarNotificacionLeida(notificacionId, 
    { tipo: 'distribuidora', actorId: distriId }, admin)

  revalidatePath('/distribuidora/notificaciones')
}
