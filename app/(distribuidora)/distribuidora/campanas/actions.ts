'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { crearNotificacionMarca } from '@/lib/notificaciones'

async function getDistriAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  if (!profile?.distri_id) redirect('/auth')

  return { admin, distriId: profile.distri_id as string }
}

export async function aprobarCampana(campanaId: string): Promise<{ error?: string }> {
  const { admin, distriId } = await getDistriAdmin()

  // Verificar que la campaña pertenece a esta distri y está pendiente
  const { data: campana } = await admin
    .from('campanas')
    .select('id, estado, distri_id')
    .eq('id', campanaId)
    .eq('distri_id', distriId)
    .eq('estado', 'pendiente_aprobacion')
    .maybeSingle()

  if (!campana) return { error: 'Campaña no encontrada o no tiene permisos para aprobarla.' }

  const { error } = await admin
    .from('campanas')
    .update({ estado: 'activa' })
    .eq('id', campanaId)

  if (error) return { error: error.message }

  revalidatePath('/distribuidora/campanas')
  return {}
}

export async function rechazarCampana(campanaId: string, motivo?: string): Promise<{ error?: string }> {
  const { admin, distriId } = await getDistriAdmin()

  // Verificar que la campaña pertenece a esta distri y está pendiente
  const { data: campana } = await admin
    .from('campanas')
    .select('id, estado, distri_id')
    .eq('id', campanaId)
    .eq('distri_id', distriId)
    .eq('estado', 'pendiente_aprobacion')
    .maybeSingle()

  if (!campana) return { error: 'Campaña no encontrada o no tiene permisos para rechazarla.' }

  const { error } = await admin
    .from('campanas')
    .update({ estado: 'borrador', motivo_rechazo: motivo ?? null })
    .eq('id', campanaId)

  if (error) return { error: error.message }

  revalidatePath('/distribuidora/campanas')
  return {}
}

export async function pedirCambiosCampana(campanaId: string, motivo?: string): Promise<{ error?: string }> {
  const { admin, distriId } = await getDistriAdmin()

  const { data: campana } = await admin
    .from('campanas')
    .select('id, nombre, estado, distri_id, marca_id')
    .eq('id', campanaId)
    .eq('distri_id', distriId)
    .eq('estado', 'pendiente_aprobacion')
    .maybeSingle()

  if (!campana) return { error: 'Campaña no encontrada o no tiene permisos para modificarla.' }

  const { error } = await admin
    .from('campanas')
    .update({ estado: 'pendiente_cambios', motivo_rechazo: motivo ?? null })
    .eq('id', campanaId)

  if (error) return { error: error.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any
  if (c.marca_id) {
    crearNotificacionMarca(c.marca_id, {
      tipo:        'cambios_solicitados',
      titulo:      'Se solicitaron cambios en tu campaña',
      mensaje:     motivo ? `"${c.nombre}": ${motivo}` : `"${c.nombre}" requiere modificaciones antes de ser aprobada.`,
      campanaId:   campanaId,
      linkDestino: `/marca/campanas/${campanaId}/detalle`,
    }).catch(() => { /* no bloquear el flujo */ })
  }

  revalidatePath('/distribuidora/campanas')
  return {}
}
