'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function marcarLogrosVistos(gondoleroId: string) {
  try {
    const admin = adminClient()
    await admin
      .from('gondolero_logros')
      .update({ visto: true })
      .eq('gondolero_id', gondoleroId)
      .eq('visto', false)
    revalidatePath('/gondolero/logros')
  } catch {
    // Silencioso — tabla puede no existir aún en ambiente sin migration
  }
}
