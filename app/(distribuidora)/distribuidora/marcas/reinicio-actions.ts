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

async function getDistriId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const admin = adminClient()
  const { data: profile } = await admin
    .from('profiles').select('distri_id').eq('id', user.id).single()
  return profile?.distri_id ?? null
}

/** Actor A (distri) solicita reinicio de relación terminada */
export async function solicitarReinicioDistri(
  relacionId: string
): Promise<{ error?: string }> {
  const distriId = await getDistriId()
  if (!distriId) return { error: 'Perfil sin distribuidora vinculada.' }

  const admin = adminClient()

  const { data: rel } = await admin
    .from('marca_distri_relaciones')
    .select('id, estado, distri_id')
    .eq('id', relacionId).single()

  if (!rel || rel.distri_id !== distriId)
    return { error: 'No tenés permiso para reiniciar esta relación.' }
  if (rel.estado !== 'terminada')
    return { error: 'Solo se pueden reiniciar relaciones terminadas.' }

  const { data: existente } = await admin
    .from('relacion_reinicio_solicitudes')
    .select('id').eq('relacion_id', relacionId).eq('estado', 'pendiente').maybeSingle()

  if (existente) return { error: 'Ya existe una solicitud de reinicio pendiente.' }

  const { error } = await admin
    .from('relacion_reinicio_solicitudes')
    .insert({ relacion_id: relacionId, solicitado_por: 'distri', estado: 'pendiente' })

  if (error) return { error: 'No se pudo enviar la solicitud.' }

  revalidatePath('/distribuidora/marcas')
  return {}
}

/** Actor B (distri) acepta solicitud enviada por la marca */
export async function aceptarReinicioDistri(
  solicitudId: string,
  relacionId: string
): Promise<{ error?: string }> {
  const distriId = await getDistriId()
  if (!distriId) return { error: 'Perfil sin distribuidora vinculada.' }

  const admin = adminClient()

  const { data: rel } = await admin
    .from('marca_distri_relaciones')
    .select('id, distri_id').eq('id', relacionId).single()

  if (!rel || rel.distri_id !== distriId)
    return { error: 'No tenés permiso para aceptar esta solicitud.' }

  const now = new Date().toISOString()

  const [solRes, relRes] = await Promise.all([
    admin.from('relacion_reinicio_solicitudes')
      .update({ estado: 'aceptada', acepto_tyc: true, updated_at: now })
      .eq('id', solicitudId),
    admin.from('marca_distri_relaciones')
      .update({
        estado: 'activa',
        fecha_fin: null,
        fecha_reinicio: now,
        updated_at: now,
        acepto_tyc_distri: true,
      })
      .eq('id', relacionId),
  ])

  if (solRes.error || relRes.error) return { error: 'No se pudo aceptar el reinicio.' }

  revalidatePath('/distribuidora/marcas')
  return {}
}

/** Actor B (distri) rechaza solicitud enviada por la marca */
export async function rechazarReinicioDistri(
  solicitudId: string,
  relacionId: string
): Promise<{ error?: string }> {
  const distriId = await getDistriId()
  if (!distriId) return { error: 'Perfil sin distribuidora vinculada.' }

  const admin = adminClient()

  const { data: rel } = await admin
    .from('marca_distri_relaciones')
    .select('id, distri_id').eq('id', relacionId).single()

  if (!rel || rel.distri_id !== distriId)
    return { error: 'No tenés permiso para rechazar esta solicitud.' }

  const { error } = await admin
    .from('relacion_reinicio_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo rechazar la solicitud.' }

  revalidatePath('/distribuidora/marcas')
  return {}
}
