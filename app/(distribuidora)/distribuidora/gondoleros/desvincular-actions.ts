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

/**
 * Verifica si el gondolero puede ser desvinculado de la distribuidora.
 * Bloquea si tiene participaciones activas en campañas de esa distri.
 */
export async function verificarDesvincularGondolero(
  gondoleroId: string,
  distriId: string
): Promise<{ campanasBloqueantes: { id: string; nombre: string }[] }> {
  const admin = adminClient()

  // Campañas activas de esta distribuidora
  const { data: campanasDistri } = await admin
    .from('campanas')
    .select('id, nombre')
    .eq('distri_id', distriId)
    .eq('estado', 'activa')

  if (!campanasDistri || campanasDistri.length === 0) return { campanasBloqueantes: [] }

  const campanaIds = campanasDistri.map((c: { id: string }) => c.id)

  // Participaciones activas del gondolero en esas campañas
  const { data: partsActivas } = await admin
    .from('participaciones')
    .select('campana_id')
    .eq('gondolero_id', gondoleroId)
    .eq('estado', 'activa')
    .in('campana_id', campanaIds)

  const idsConParticipacion = new Set((partsActivas ?? []).map((p: { campana_id: string }) => p.campana_id))
  const bloqueantes = campanasDistri.filter((c: { id: string; nombre: string }) => idsConParticipacion.has(c.id))

  return { campanasBloqueantes: bloqueantes as { id: string; nombre: string }[] }
}

/**
 * Desvincula al gondolero de la distribuidora:
 * - Marca la solicitud como 'terminada'
 * - Limpia distri_id del profile si apunta a esta distri
 * - Envía notificación al gondolero
 */
export async function desvincularGondolero(
  gondoleroId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Verificar que el usuario pertenece a esta distribuidora
  const { data: perfil } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  if (perfil?.distri_id !== distriId) {
    return { error: 'No tenés permiso para desvincular este gondolero.' }
  }

  const now = new Date().toISOString()

  const [solRes, profileRes] = await Promise.all([
    // Terminar la solicitud en gondolero_distri_solicitudes
    admin
      .from('gondolero_distri_solicitudes')
      .update({ estado: 'terminada', updated_at: now })
      .eq('gondolero_id', gondoleroId)
      .eq('distri_id', distriId)
      .eq('estado', 'aprobada'),

    // Limpiar distri_id del profile del gondolero solo si apunta a esta distri
    admin
      .from('profiles')
      .update({ distri_id: null })
      .eq('id', gondoleroId)
      .eq('distri_id', distriId),
  ])

  if (solRes.error) return { error: 'No se pudo desvincular: ' + solRes.error.message }
  if (profileRes.error) return { error: 'No se pudo actualizar el perfil: ' + profileRes.error.message }

  // Notificación al gondolero (fire-and-forget, no bloqueante)
  try {
    await admin.from('notificaciones').insert({
      gondolero_id: gondoleroId,
      tipo: 'desvinculacion_distri',
      titulo: 'Fuiste desvinculado',
      mensaje: `Tu relación con ${distriNombre} fue terminada. Podés solicitar vinculación a otra distribuidora desde tu perfil.`,
      leida: false,
    })
  } catch { /* ignorar si la notificación falla */ }

  revalidatePath('/distribuidora/gondoleros')
  return {}
}
