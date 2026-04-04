'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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

export async function rechazarCampana(campanaId: string): Promise<{ error?: string }> {
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
    .update({ estado: 'cancelada' })
    .eq('id', campanaId)

  if (error) return { error: error.message }

  revalidatePath('/distribuidora/campanas')
  return {}
}
