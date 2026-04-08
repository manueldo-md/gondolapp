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
  distriId: string,
  distriNombre: string
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
    tipo: 'distri',
    actor_id: distriId,
    expira_at: expiraAt,
  })

  if (error) return { error: 'No se pudo generar el link. Intentá de nuevo.' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gondolapp-delta.vercel.app'
  const link = `${baseUrl}/fixer-vinculacion?token=${token}`
  return { link }
}

export async function buscarFixerPorCodigo(
  codigo: string,
  distriId: string
): Promise<{ fixer?: { id: string; alias: string | null; nombre: string | null }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: fixer } = await admin
    .from('profiles')
    .select('id, alias, nombre')
    .eq('codigo_gondolero', codigo.toUpperCase())
    .eq('tipo_actor', 'fixer')
    .maybeSingle()

  if (!fixer) return { error: 'Código no encontrado. Verificá que sea correcto.' }

  // Verificar si ya existe vínculo aprobado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existente } = await (admin as any)
    .from('fixer_distri_solicitudes')
    .select('estado')
    .eq('fixer_id', fixer.id)
    .eq('distri_id', distriId)
    .maybeSingle()

  if (existente?.estado === 'aprobada') {
    return { error: 'Este fixer ya está vinculado a tu distribuidora.' }
  }

  return { fixer: { id: fixer.id, alias: fixer.alias, nombre: fixer.nombre } }
}

export async function confirmarVinculacionPorCodigo(
  fixerId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_distri_solicitudes')
    .upsert(
      { fixer_id: fixerId, distri_id: distriId, estado: 'pendiente', iniciado_por: 'distri', updated_at: new Date().toISOString() },
      { onConflict: 'fixer_id,distri_id' }
    )

  if (error) return { error: 'No se pudo enviar la invitación. Intentá de nuevo.' }

  // Notificación al fixer
  await admin.from('notificaciones').insert({
    gondolero_id: fixerId,
    tipo: 'vinculacion_invitacion',
    titulo: `📦 ${distriNombre} quiere vincularte`,
    mensaje: `La distribuidora ${distriNombre} te invitó a unirte a su equipo. Revisá tu perfil para aceptar o rechazar.`,
    leida: false,
  })

  revalidatePath('/distribuidora/fixers')
  return {}
}
