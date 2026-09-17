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
 * Validación de comercios — panel de admin.
 *
 * La lógica vive entera en `lib/validacion-comercio.ts`: acá solo está el
 * permiso y el revalidate. Antes estaba duplicada entre este archivo y el de la
 * distribuidora, y las dos copias ya se habían separado — la de acá leía
 * `puntos_otorgados` de la foto y no lo usaba, las dos leían `puntos_por_foto`
 * sin el fallback a `puntos_por_mision`, y ninguna creaba la misión del alta.
 */

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requerirSesion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
}

export async function aprobarComercio(id: string) {
  await requerirSesion()

  const resultado = await validarComercioYCrearMision(id, adminClient())

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  revalidatePath('/admin/tablero')

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true, puntos: resultado.puntos ?? 0 }
}

export async function rechazarComercio(id: string, motivo?: string) {
  await requerirSesion()

  const resultado = await rechazarComercioConMotivo(id, motivo, adminClient())

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  revalidatePath('/admin/tablero')

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true }
}
