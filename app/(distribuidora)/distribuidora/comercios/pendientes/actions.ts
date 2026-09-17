'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  validarComercioYCrearMision,
  rechazarComercioConMotivo,
} from '@/lib/validacion-comercio'

/**
 * Validación de comercios — panel de distribuidora.
 *
 * Misma regla que el panel de admin (`lib/validacion-comercio.ts`); lo único
 * propio es el permiso: la distri solo toca comercios de SUS campañas.
 */

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getDistriId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single() as { data: { distri_id: string | null } | null }
  return profile?.distri_id ?? null
}

/**
 * El comercio sin `campana_id` se deja pasar: lo cargó un gondolero desde la
 * captura normal y no pertenece a ninguna campaña de altas.
 */
async function puedeTocar(comercioId: string, distriId: string): Promise<boolean> {
  const admin = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comercio } = await (admin as any)
    .from('comercios')
    .select('campana_id')
    .eq('id', comercioId)
    .maybeSingle() as { data: { campana_id: string | null } | null }

  if (!comercio?.campana_id) return true

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana } = await (admin as any)
    .from('campanas')
    .select('distri_id')
    .eq('id', comercio.campana_id)
    .maybeSingle() as { data: { distri_id: string | null } | null }

  return campana?.distri_id === distriId
}

function revalidar() {
  revalidatePath('/distribuidora/comercios/pendientes')
  revalidatePath('/distribuidora/comercios')
  revalidatePath('/distribuidora/dashboard')
}

export async function aprobarComercioDistri(id: string) {
  const distriId = await getDistriId()
  if (!distriId) redirect('/auth')

  if (!(await puedeTocar(id, distriId))) {
    return { error: 'No tenés permiso para aprobar este comercio.' }
  }

  const resultado = await validarComercioYCrearMision(id, adminClient())
  revalidar()

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true, puntos: resultado.puntos ?? 0 }
}

export async function rechazarComercioDistri(id: string, motivo?: string) {
  const distriId = await getDistriId()
  if (!distriId) redirect('/auth')

  if (!(await puedeTocar(id, distriId))) {
    return { error: 'No tenés permiso para rechazar este comercio.' }
  }

  const resultado = await rechazarComercioConMotivo(id, motivo, adminClient())
  revalidar()

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true }
}
