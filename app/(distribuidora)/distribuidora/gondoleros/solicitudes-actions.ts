'use server'

import { distriDeLaSesion } from '@/lib/actor-sesion'
import { exigirPertenencia } from '@/lib/pertenencia'
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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * Las dos de este archivo recibían `solicitudId`, `gondoleroId` y `distriId`
 * del cliente y **no verificaban ninguno**. Cualquier autenticado podía
 * aprobar o rechazar la solicitud de cualquier gondolero para cualquier
 * distribuidora.
 *
 * Los dos ids extra **estaban en la fila**, así que salieron de la firma: se
 * leen de la solicitud, igual que en las seis del lado del gondolero. Lo que
 * se verifica es el `distri_id` contra la sesión.
 * ══════════════════════════════════════════════════════════════════════════
 */
export async function aprobarSolicitud(
  solicitudId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  const sol = await exigirPertenencia({
    admin, tabla: 'gondolero_distri_solicitudes', id: solicitudId,
    columna: 'distri_id', valor: distriId, columnas: ['gondolero_id'],
    desde: 'distri/gondoleros:aprobarSolicitud',
  })
  if (!sol) return { error: 'No encontramos esa solicitud.' }
  const gondoleroId = sol.gondolero_id as string

  // ── `distri_id` solo si está en null ──────────────────────────────────────
  // Pisaba siempre, y un gondolero puede estar vinculado a VARIAS distris a la
  // vez: sobreescribirla lo movía de equipo sin desvincularlo de nada. Es el
  // mismo arreglo que ya se hizo en `aprobarSolicitudFixer` el 22/9/2026 y en
  // `aceptarVinculacionRepo` hoy. El vínculo verdadero vive en la tabla.
  const { data: perfil } = await admin
    .from('profiles').select('distri_id').eq('id', gondoleroId).maybeSingle()
  const yaTiene = (perfil as { distri_id: string | null } | null)?.distri_id

  const [profileUpdate, solicitudUpdate] = await Promise.all([
    yaTiene
      ? Promise.resolve({ error: null })
      : admin.from('profiles').update({ distri_id: distriId }).eq('id', gondoleroId),
    admin.from('gondolero_distri_solicitudes')
      .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
      .eq('id', solicitudId),
  ])

  if (profileUpdate.error) return { error: 'No se pudo aprobar. ' + profileUpdate.error.message }
  if (solicitudUpdate.error) return { error: 'No se pudo actualizar la solicitud. ' + solicitudUpdate.error.message }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    actor_id:     gondoleroId,
    actor_tipo:   'gondolero',
    tipo:         'solicitud_aprobada',
    titulo:       '¡Solicitud aprobada!',
    mensaje:      `Ya sos parte de ${distriNombre}. ¡Bienvenido al equipo!`,
    leida:        false,
  })

  revalidatePath('/distribuidora/gondoleros')
  return {}
}

export async function rechazarSolicitud(
  solicitudId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  const sol = await exigirPertenencia({
    admin, tabla: 'gondolero_distri_solicitudes', id: solicitudId,
    columna: 'distri_id', valor: distriId, columnas: ['gondolero_id'],
    desde: 'distri/gondoleros:rechazarSolicitud',
  })
  if (!sol) return { error: 'No encontramos esa solicitud.' }
  const gondoleroId = sol.gondolero_id as string

  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo rechazar. ' + error.message }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    actor_id:     gondoleroId,
    actor_tipo:   'gondolero',
    tipo:         'solicitud_rechazada',
    titulo:       'Solicitud no aprobada',
    mensaje:      `Tu solicitud a ${distriNombre} no fue aprobada. Podés solicitar otra distribuidora desde tu perfil.`,
    leida:        false,
  })

  revalidatePath('/distribuidora/gondoleros')
  return {}
}
