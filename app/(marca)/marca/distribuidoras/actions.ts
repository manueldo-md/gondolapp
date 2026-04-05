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

export async function generarLinkInvitacionMarca(
  marcaId: string,
  marcaNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Verificar marca_id del perfil del usuario (seguridad + diagnóstico)
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  console.log('[generarLink] user.id:', user.id)
  console.log('[generarLink] profile:', profile)
  console.log('[generarLink] profileError:', profileError)
  console.log('[generarLink] marcaId (param):', marcaId)

  if (!profile?.marca_id) {
    console.error('[generarLink] marca_id es null en el perfil del usuario')
    return { error: 'Tu perfil no tiene una marca vinculada. Contactá al administrador.' }
  }

  // Usar siempre el marca_id del perfil, no el parámetro del cliente
  const marcaIdSeguro = profile.marca_id

  const token = crypto.randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from('marca_distri_tokens').insert({
    token,
    iniciado_por: 'marca',
    marca_id: marcaIdSeguro,
    expira_at: expiraAt,
  })

  console.log('[generarLink] insert error:', error)

  if (error) return { error: `No se pudo generar el link: ${error.message}` }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gondolapp-delta.vercel.app'
  const link = `${appUrl}/vinculacion-marca?token=${token}`
  console.log('[generarLink] link generado:', link)
  return { link }
}

export async function verificarTerminarRelacion(
  relacionId: string
): Promise<{ campanasBloqueantes: { id: string; nombre: string }[] }> {
  const admin = adminClient()

  // Obtener marca_id y distri_id de la relación
  const { data: rel } = await admin
    .from('marca_distri_relaciones')
    .select('marca_id, distri_id')
    .eq('id', relacionId)
    .single()

  if (!rel?.marca_id || !rel?.distri_id) return { campanasBloqueantes: [] }

  // Campañas activas o pendientes entre esta marca y esta distri
  const { data: campanas } = await admin
    .from('campanas')
    .select('id, nombre')
    .eq('marca_id', rel.marca_id)
    .eq('distri_id', rel.distri_id)
    .in('estado', ['activa', 'pendiente_aprobacion'])

  return { campanasBloqueantes: (campanas ?? []) as { id: string; nombre: string }[] }
}

export async function terminarRelacion(
  relacionId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { error } = await admin
    .from('marca_distri_relaciones')
    .update({ estado: 'terminada', updated_at: new Date().toISOString() })
    .eq('id', relacionId)

  if (error) return { error: 'No se pudo terminar la relación' }

  revalidatePath('/marca/distribuidoras')
  return {}
}
