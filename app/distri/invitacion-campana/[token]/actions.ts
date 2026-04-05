'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aceptarInvitacionCampana(token: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás estar logueado para aceptar esta campaña.' }

  const admin = adminClient()

  // Verificar que el usuario es de tipo distribuidora
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id, tipo_actor')
    .eq('id', user.id)
    .single()

  if (profile?.tipo_actor !== 'distribuidora' || !profile?.distri_id) {
    return { error: 'Solo una distribuidora puede aceptar esta invitación.' }
  }

  // Verificar token
  const ahora = new Date().toISOString()
  const { data: tokenRow } = await admin
    .from('campana_tokens')
    .select('id, campana_id, distri_id, usado, expira_at')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) return { error: 'Link inválido o expirado.' }
  if (tokenRow.usado) return { error: 'Esta invitación ya fue procesada.' }
  if (tokenRow.expira_at < ahora) return { error: 'Este link ha expirado.' }

  // Verificar que la distri del token coincide con la del usuario
  if (tokenRow.distri_id && tokenRow.distri_id !== profile.distri_id) {
    return { error: 'Esta invitación no está dirigida a tu distribuidora.' }
  }

  // Activar campaña
  const { error: errUpdate } = await admin
    .from('campanas')
    .update({ estado: 'activa' })
    .eq('id', tokenRow.campana_id)

  if (errUpdate) return { error: errUpdate.message }

  // Marcar token como usado
  await admin
    .from('campana_tokens')
    .update({ usado: true })
    .eq('id', tokenRow.id)

  revalidatePath(`/distri/invitacion-campana/${token}`)
  return { ok: true }
}

export async function rechazarInvitacionCampana(token: string, motivo?: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás estar logueado para rechazar esta campaña.' }

  const admin = adminClient()

  // Verificar que el usuario es de tipo distribuidora
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id, tipo_actor')
    .eq('id', user.id)
    .single()

  if (profile?.tipo_actor !== 'distribuidora' || !profile?.distri_id) {
    return { error: 'Solo una distribuidora puede rechazar esta invitación.' }
  }

  // Verificar token
  const ahora = new Date().toISOString()
  const { data: tokenRow } = await admin
    .from('campana_tokens')
    .select('id, campana_id, distri_id, usado, expira_at')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) return { error: 'Link inválido o expirado.' }
  if (tokenRow.usado) return { error: 'Esta invitación ya fue procesada.' }
  if (tokenRow.expira_at < ahora) return { error: 'Este link ha expirado.' }

  if (tokenRow.distri_id && tokenRow.distri_id !== profile.distri_id) {
    return { error: 'Esta invitación no está dirigida a tu distribuidora.' }
  }

  // Volver a borrador con motivo
  const { error: errUpdate } = await admin
    .from('campanas')
    .update({ estado: 'borrador', motivo_rechazo: motivo?.trim() || null })
    .eq('id', tokenRow.campana_id)

  if (errUpdate) return { error: errUpdate.message }

  // Marcar token como usado
  await admin
    .from('campana_tokens')
    .update({ usado: true })
    .eq('id', tokenRow.id)

  revalidatePath(`/distri/invitacion-campana/${token}`)
  return { ok: true }
}
