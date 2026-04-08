'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function generarLinkInvitacionFixer(
  repoId: string,
  repoNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const token = randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('fixer_invitacion_tokens').insert({
    token,
    tipo: 'repositora',
    actor_id: repoId,
    expira_at: expiraAt,
  })

  if (error) return { error: 'No se pudo generar el link. Intentá de nuevo.' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gondolapp-delta.vercel.app'
  const link = `${baseUrl}/fixer-vinculacion?token=${token}`
  return { link }
}

export async function buscarFixerPorCodigo(
  codigo: string,
  repoId: string
): Promise<{ fixer?: { id: string; alias: string | null; nombre: string | null }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: perfil } = await admin
    .from('profiles')
    .select('id, alias, nombre, tipo_actor')
    .eq('codigo_gondolero', codigo.toUpperCase())
    .maybeSingle()

  if (!perfil) return { error: 'Código no encontrado. Verificá que sea correcto.' }

  if (perfil.tipo_actor === 'gondolero') {
    return { error: 'Este código pertenece a un Gondolero. Los fixers tienen códigos propios.' }
  }

  if (perfil.tipo_actor !== 'fixer') {
    return { error: 'Código no encontrado. Verificá que sea correcto.' }
  }

  const fixer = perfil

  // Verificar si ya existe vínculo aprobado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existente } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .select('estado')
    .eq('fixer_id', fixer.id)
    .eq('repositora_id', repoId)
    .maybeSingle()

  if (existente?.estado === 'aprobada') {
    return { error: 'Este fixer ya está vinculado a tu repositora.' }
  }

  return { fixer: { id: fixer.id, alias: fixer.alias, nombre: fixer.nombre } }
}

export async function vincularFixerPorCodigo(
  fixerId: string,
  repoId: string,
  repoNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .upsert(
      { fixer_id: fixerId, repositora_id: repoId, estado: 'pendiente', updated_at: new Date().toISOString() },
      { onConflict: 'fixer_id,repositora_id' }
    )

  if (error) return { error: 'No se pudo enviar la invitación. Intentá de nuevo.' }

  // Notificación al fixer
  await admin.from('notificaciones').insert({
    gondolero_id: fixerId,
    tipo: 'vinculacion_invitacion',
    titulo: `📦 ${repoNombre} quiere vincularte`,
    mensaje: `La repositora ${repoNombre} te invitó a unirte. Revisá tu perfil para aceptar o rechazar.`,
    leida: false,
  })

  revalidatePath('/repositora/fixers')
  return {}
}

export async function aprobarSolicitudFixer(
  solicitudId: string,
  fixerId: string,
  repoId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: error.message }

  // Actualizar repositora_id en el profile del fixer
  await admin.from('profiles').update({ repositora_id: repoId }).eq('id', fixerId)

  revalidatePath('/repositora/fixers')
  return {}
}

export async function rechazarSolicitudFixer(
  solicitudId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: error.message }

  revalidatePath('/repositora/fixers')
  return {}
}

export async function desvincularFixer(
  fixerId: string,
  repoId: string,
  repoNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const now = new Date().toISOString()

  const [solRes, profileRes] = await Promise.all([
    // Marcar solicitud como terminada
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_repo_solicitudes')
      .update({ estado: 'terminada', updated_at: now })
      .eq('fixer_id', fixerId)
      .eq('repositora_id', repoId)
      .eq('estado', 'aprobada'),

    // Limpiar repositora_id del profile si apunta a esta repositora
    admin
      .from('profiles')
      .update({ repositora_id: null })
      .eq('id', fixerId)
      .eq('repositora_id', repoId),
  ])

  if (solRes.error) return { error: 'No se pudo desvincular: ' + solRes.error.message }
  if (profileRes.error) return { error: 'No se pudo actualizar el perfil: ' + profileRes.error.message }

  // Notificación al fixer
  try {
    await admin.from('notificaciones').insert({
      gondolero_id: fixerId,
      actor_id:     fixerId,
      actor_tipo:   'fixer',
      tipo:         'desvinculacion_repositora',
      titulo:       'Fuiste desvinculado',
      mensaje:      `Tu relación con ${repoNombre} fue terminada.`,
      leida:        false,
    })
  } catch { /* ignorar si la notificación falla */ }

  revalidatePath('/repositora/fixers')
  return {}
}
