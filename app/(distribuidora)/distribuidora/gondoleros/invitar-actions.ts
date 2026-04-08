'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function generarLinkInvitacion(
  distriId: string,
  distriNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const token = randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from('vinculacion_tokens').insert({
    token,
    distri_id: distriId,
    tipo: 'distri_invita',
    expira_at: expiraAt,
  })

  if (error) return { error: 'No se pudo generar el link. Intentá de nuevo.' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gondolapp-delta.vercel.app'
  const link = `${baseUrl}/vinculacion?token=${token}`
  return { link }
}

export async function vincularPorCodigo(
  codigoGondolero: string,
  distriId: string,
  distriNombre: string
): Promise<{ gondolero?: { id: string; alias: string | null; nombre: string | null; nivel: string; tipo_actor: string }; error?: string; vinculado?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Buscar gondolero o fixer por código
  const { data: gondolero } = await admin
    .from('profiles')
    .select('id, alias, nombre, nivel, tipo_actor')
    .eq('codigo_gondolero', codigoGondolero.toUpperCase())
    .in('tipo_actor', ['gondolero', 'fixer'])
    .maybeSingle()

  if (!gondolero) return { error: 'Código no encontrado. Verificá que sea correcto.' }

  // Verificar si ya existe una solicitud aprobada para este par gondolero+distri
  const { data: solicitudExistente } = await admin
    .from('gondolero_distri_solicitudes')
    .select('estado')
    .eq('gondolero_id', gondolero.id)
    .eq('distri_id', distriId)
    .maybeSingle()

  if (solicitudExistente?.estado === 'aprobada') {
    const label = gondolero.tipo_actor === 'fixer' ? 'fixer' : 'gondolero'
    return { error: `Este ${label} ya está vinculado a tu distribuidora.` }
  }

  // Si hay solicitud rechazada, terminada o pendiente → se permite reenviar (upsert)
  return { gondolero: { id: gondolero.id, alias: gondolero.alias, nombre: gondolero.nombre, nivel: gondolero.nivel, tipo_actor: gondolero.tipo_actor } }
}

export async function confirmarVinculacionPorCodigo(
  gondoleroId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Crear solicitud pendiente — el gondolero debe aceptar desde su perfil
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .upsert(
      { gondolero_id: gondoleroId, distri_id: distriId, estado: 'pendiente', iniciado_por: 'distri', updated_at: new Date().toISOString() },
      { onConflict: 'gondolero_id,distri_id' }
    )

  if (error) return { error: 'No se pudo enviar la invitación. Intentá de nuevo.' }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    tipo: 'vinculacion_invitacion',
    titulo: `📦 ${distriNombre} quiere vincularte`,
    mensaje: `La distribuidora ${distriNombre} te invitó a unirte a su equipo. Revisá tu perfil para aceptar o rechazar.`,
    leida: false,
  })

  revalidatePath('/distribuidora/gondoleros')
  return {}
}
