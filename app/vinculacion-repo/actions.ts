'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aceptarInvitacionRepo(
  tokenId: string,
  marcaId: string,
  repoId: string
): Promise<{ error?: string }> {
  const admin = adminClient()

  // Marcar token como usado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('marca_repo_tokens').update({ usado: true }).eq('id', tokenId)

  // Crear o actualizar relación
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('marca_repo_relaciones')
    .upsert(
      { marca_id: marcaId, repositora_id: repoId, estado: 'activa', updated_at: new Date().toISOString() },
      { onConflict: 'marca_id,repositora_id' }
    )

  if (error) return { error: 'No se pudo establecer la relación: ' + error.message }

  revalidatePath('/marca/repositoras')
  revalidatePath('/repositora/dashboard')
  return {}
}

export async function rechazarInvitacionRepo(
  tokenId: string
): Promise<{ error?: string }> {
  const admin = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('marca_repo_tokens').update({ usado: true }).eq('id', tokenId)
  return {}
}
