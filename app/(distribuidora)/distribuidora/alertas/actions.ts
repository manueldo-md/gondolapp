'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function makeAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function ignorarAlerta(tipo: string, referenciaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = makeAdmin()

  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  if (!profile?.distri_id) return { error: 'Sin distribuidora' }

  const ignoradaHasta = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString()

  const { error } = await (admin as any)
    .from('alertas_ignoradas')
    .upsert(
      {
        distri_id:     profile.distri_id,
        tipo,
        referencia_id: referenciaId,
        ignorada_hasta: ignoradaHasta,
      },
      { onConflict: 'distri_id,tipo,referencia_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/distribuidora/alertas')
  return { ok: true }
}
