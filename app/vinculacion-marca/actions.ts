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

export async function aceptarInvitacionMarca(
  tokenId: string,
  marcaId: string,
  distriId: string,
  iniciadoPor: 'marca' | 'distri'
): Promise<{ error?: string }> {
  const admin = adminClient()

  // Marcar token como usado
  await admin
    .from('marca_distri_tokens')
    .update({ usado: true })
    .eq('id', tokenId)

  // Crear o actualizar relación
  const relacionData = {
    marca_id: marcaId,
    distri_id: distriId,
    estado: 'activa',
    iniciado_por: iniciadoPor,
    acepto_tyc_marca: iniciadoPor === 'distri' ? true : false, // quien acepta es la otra parte
    acepto_tyc_distri: iniciadoPor === 'marca' ? true : false,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin
    .from('marca_distri_relaciones')
    .upsert(relacionData, { onConflict: 'marca_id,distri_id' })

  if (error) return { error: 'No se pudo establecer la relación' }

  revalidatePath('/marca/distribuidoras')
  revalidatePath('/distribuidora/marcas')
  return {}
}
