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
): Promise<{ gondolero?: { id: string; alias: string | null; nombre: string | null; nivel: string }; error?: string; vinculado?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Buscar gondolero por código
  const { data: gondolero } = await admin
    .from('profiles')
    .select('id, alias, nombre, nivel, distri_id')
    .eq('codigo_gondolero', codigoGondolero.toUpperCase())
    .eq('tipo_actor', 'gondolero')
    .maybeSingle()

  if (!gondolero) return { error: 'Código no encontrado. Verificá que sea correcto.' }
  if (gondolero.distri_id === distriId) return { error: 'Este gondolero ya está vinculado a tu distribuidora.' }
  if (gondolero.distri_id && gondolero.distri_id !== distriId) return { error: 'Este gondolero ya está vinculado a otra distribuidora.' }

  return { gondolero: { id: gondolero.id, alias: gondolero.alias, nombre: gondolero.nombre, nivel: gondolero.nivel } }
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

  const { error } = await admin
    .from('profiles')
    .update({ distri_id: distriId })
    .eq('id', gondoleroId)

  if (error) return { error: 'No se pudo vincular. Intentá de nuevo.' }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    tipo: 'vinculacion_nueva',
    titulo: `¡${distriNombre} te vinculó a su equipo! 🎉`,
    mensaje: `Ya sos parte del equipo de ${distriNombre}. ¡Bienvenido!`,
    leida: false,
  })

  revalidatePath('/distribuidora/gondoleros')
  return {}
}
