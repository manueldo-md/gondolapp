'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sincronizarComerciosRelevados } from '@/lib/comercios-relevados'

export async function abandonarCampana(campanaId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await admin
    .from('participaciones')
    .update({ estado: 'abandonada' })
    .eq('campana_id', campanaId)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')
    .select()

  console.log('[abandonar] resultado:', { data, error })

  if (error) return { success: false, error: error.message }

  revalidatePath('/gondolero/misiones')
  revalidatePath(`/gondolero/misiones/${campanaId}`)
  revalidatePath('/gondolero/campanas')
  revalidatePath(`/gondolero/campanas/${campanaId}`)
  return { success: true }
}

export async function retirarFoto(fotoId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth')

    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Obtener la foto y verificar ownership + estado
    console.log('[retirarFoto] Buscando foto:', fotoId, 'gondolero:', user.id)
    const { data: foto, error: fotoError } = await admin
      .from('fotos')
      .select('id, gondolero_id, campana_id, estado, storage_path')
      .eq('id', fotoId)
      .single()

    console.log('[retirarFoto] Foto encontrada:', foto, '| Error:', fotoError?.message)

    if (fotoError || !foto) return { error: `Foto no encontrada: ${fotoError?.message ?? 'sin datos'}` }
    if (foto.gondolero_id !== user.id) return { error: 'No tenés permiso para retirar esta foto.' }
    if (foto.estado !== 'pendiente' && foto.estado !== 'en_revision') {
      return { error: `Estado inválido para retirar: ${foto.estado}` }
    }

    // 2. Eliminar de Storage si tiene path
    if (foto.storage_path) {
      const { error: storageError } = await admin.storage
        .from('fotos-gondola')
        .remove([foto.storage_path])
      console.log('[retirarFoto] Storage remove:', storageError?.message ?? 'OK')
    } else {
      console.log('[retirarFoto] Sin storage_path, omitiendo eliminación de Storage')
    }

    // 3. Eliminar movimientos_puntos asociados (FK constraint)
    const { error: movError } = await admin
      .from('movimientos_puntos')
      .delete()
      .eq('foto_id', fotoId)
    console.log('[retirarFoto] Delete movimientos_puntos:', movError?.message ?? 'OK')

    // 4. Eliminar registro de la DB
    const { error: deleteError } = await admin
      .from('fotos')
      .delete()
      .eq('id', fotoId)

    console.log('[retirarFoto] Delete fotos:', deleteError?.message ?? 'OK')
    if (deleteError) return { error: `Error al eliminar: ${deleteError.message}` }

    // 4. Decrementar comercios_completados en participaciones
    const { data: part, error: partError } = await admin
      .from('participaciones')
      .select('comercios_completados')
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', user.id)
      .single()

    console.log('[retirarFoto] Participacion:', part, '| Error:', partError?.message)

    if (part) {
      const { error: updPartError } = await admin
        .from('participaciones')
        .update({ comercios_completados: Math.max(0, (part.comercios_completados ?? 0) - 1) })
        .eq('campana_id', foto.campana_id)
        .eq('gondolero_id', user.id)
      console.log('[retirarFoto] Update participacion:', updPartError?.message ?? 'OK')
    }

    // 5. Sincronizar comercios_relevados en campanas
    //
    // Antes restaba 1 POR FOTO retirada, que es el espejo exacto del bug que se
    // sacó de aprobarFoto: una misión de dos fotos descontaba dos comercios.
    // Y peor, descontaba aunque la misión siguiera viva con sus otras fotos —
    // el comercio seguía relevado y el contador decía que no.
    //
    // El recálculo lo resuelve sin aritmética: retirar una foto no borra la
    // misión, así que el comercio sigue contando, que es lo correcto.
    const nuevo = await sincronizarComerciosRelevados(foto.campana_id, admin)
    console.log('[retirarFoto] comercios_relevados sincronizado:', nuevo)

    revalidatePath('/gondolero/misiones')
    revalidatePath(`/gondolero/misiones/${foto.campana_id}`)
    revalidatePath('/gondolero/actividad')
    revalidatePath('/gondolero/actividad/pendientes')
    console.log('[retirarFoto] Completado exitosamente')
    return {}

  } catch (e) {
    console.error('[retirarFoto] Excepción:', e)
    return { error: `Excepción: ${e instanceof Error ? e.message : String(e)}` }
  }
}
