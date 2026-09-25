'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { usuarioDeLaSesion } from '@/lib/actor-sesion'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Marca como vistos los logros del que llama.
 *
 * `gondoleroId` **salió de la firma**. Hasta el 25/9/2026 llegaba por parámetro
 * y esta función no llamaba a `getUser()` ni una vez: sin sesión y sin
 * verificar nada, cualquiera podía marcarle los logros a cualquiera. Son 50
 * filas sin ver en dev y 56 en producción.
 *
 * El daño es chico —se pierde el "¡nuevo!" de una insignia— pero el agujero es
 * del mismo tipo que los caros, y se cierra igual: el id no se elige, se
 * deriva.
 */
export async function marcarLogrosVistos() {
  const userId = await usuarioDeLaSesion()
  if (!userId) return

  try {
    const admin = adminClient()
    await admin
      .from('gondolero_logros')
      .update({ visto: true })
      .eq('gondolero_id', userId)
      .eq('visto', false)
    revalidatePath('/gondolero/logros')
  } catch {
    // Silencioso — tabla puede no existir aún en ambiente sin migration
  }
}
