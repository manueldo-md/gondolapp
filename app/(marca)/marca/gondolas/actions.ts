'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aprobarFotoMarca(fotoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Obtener datos de la foto
  const { data: foto, error: errFoto } = await admin
    .from('fotos')
    .select('campana_id, gondolero_id, puntos_otorgados')
    .eq('id', fotoId)
    .single()

  if (errFoto || !foto) throw new Error('No se encontro la foto')

  // 1. Aprobar la foto
  const { error } = await admin
    .from('fotos')
    .update({ estado: 'aprobada' })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo aprobar la foto: ' + error.message)

  // 2. Obtener datos de la campana
  const { data: campana } = await admin
    .from('campanas')
    .select('puntos_por_foto, nombre, comercios_relevados')
    .eq('id', foto.campana_id)
    .single()

  const puntos = campana?.puntos_por_foto ?? 0

  // 3. Insertar movimiento de puntos (el trigger update_gondolero_puntos
  //    se encarga de actualizar profiles.puntos_disponibles automaticamente)
  if (puntos > 0 && foto.puntos_otorgados === 0) {
    await admin.from('movimientos_puntos').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'credito',
      monto:        puntos,
      concepto:     `Foto aprobada · ${campana?.nombre ?? 'campana'}`,
      campana_id:   foto.campana_id,
      foto_id:      fotoId,
    })

    // 4. Actualizar puntos_otorgados en la foto
    await admin
      .from('fotos')
      .update({ puntos_otorgados: puntos })
      .eq('id', fotoId)
  }

  // 5. Incrementar comercios_relevados en la campana
  await admin
    .from('campanas')
    .update({ comercios_relevados: (campana?.comercios_relevados ?? 0) + 1 })
    .eq('id', foto.campana_id)

  revalidatePath('/marca/gondolas')
}

export async function rechazarFotoMarca(fotoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { error } = await adminClient()
    .from('fotos')
    .update({ estado: 'rechazada' })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo rechazar la foto: ' + error.message)

  revalidatePath('/marca/gondolas')
}
