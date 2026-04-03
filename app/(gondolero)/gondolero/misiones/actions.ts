'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function abandonarCampana(campanaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('participaciones')
    .update({ estado: 'abandonada' })
    .eq('campana_id', campanaId)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')

  revalidatePath('/gondolero/misiones')
  revalidatePath(`/gondolero/misiones/${campanaId}`)
  revalidatePath('/gondolero/campanas')
}

export async function retirarFoto(fotoId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Obtener la foto y verificar ownership + estado
  const { data: foto } = await admin
    .from('fotos')
    .select('id, gondolero_id, campana_id, estado, storage_path')
    .eq('id', fotoId)
    .single()

  if (!foto) return { error: 'Foto no encontrada.' }
  if (foto.gondolero_id !== user.id) return { error: 'No tenés permiso para retirar esta foto.' }
  if (foto.estado !== 'pendiente' && foto.estado !== 'en_revision') return { error: 'Esta foto ya fue revisada y no puede retirarse.' }

  // 2. Eliminar de Storage si tiene path
  if (foto.storage_path) {
    await admin.storage.from('fotos-gondola').remove([foto.storage_path])
  }

  // 3. Eliminar registro de la DB
  const { error: deleteError } = await admin.from('fotos').delete().eq('id', fotoId)
  if (deleteError) return { error: 'No se pudo eliminar la foto.' }

  // 4. Decrementar comercios_completados en participaciones
  const { data: part } = await admin
    .from('participaciones')
    .select('comercios_completados')
    .eq('campana_id', foto.campana_id)
    .eq('gondolero_id', user.id)
    .single()

  if (part) {
    await admin
      .from('participaciones')
      .update({ comercios_completados: Math.max(0, (part.comercios_completados ?? 0) - 1) })
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', user.id)
  }

  // 5. Decrementar comercios_relevados en campanas
  const { data: campana } = await admin
    .from('campanas')
    .select('comercios_relevados')
    .eq('id', foto.campana_id)
    .single()

  if (campana) {
    await admin
      .from('campanas')
      .update({ comercios_relevados: Math.max(0, (campana.comercios_relevados ?? 0) - 1) })
      .eq('id', foto.campana_id)
  }

  revalidatePath('/gondolero/misiones')
  revalidatePath(`/gondolero/misiones/${foto.campana_id}`)
  revalidatePath('/gondolero/actividad')
  revalidatePath('/gondolero/actividad/pendientes')
  return {}
}
