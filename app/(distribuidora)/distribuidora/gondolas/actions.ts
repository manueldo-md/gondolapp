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

export async function aprobarFoto(fotoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Obtener datos de la foto antes de aprobar
  const { data: foto, error: errFoto } = await admin
    .from('fotos')
    .select('campana_id, gondolero_id, puntos_otorgados')
    .eq('id', fotoId)
    .single()

  if (errFoto || !foto) throw new Error('No se encontró la foto')

  // 1. Aprobar la foto
  const { error } = await admin
    .from('fotos')
    .update({ estado: 'aprobada' })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo aprobar la foto: ' + error.message)

  // 2. Incrementar comercios_relevados en la campaña
  await admin.rpc('increment_comercios_relevados', { campana_id: foto.campana_id })
    .then(async ({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback manual si no existe la RPC
        const { data: camp } = await admin
          .from('campanas')
          .select('comercios_relevados')
          .eq('id', foto.campana_id)
          .single()
        await admin
          .from('campanas')
          .update({ comercios_relevados: (camp?.comercios_relevados ?? 0) + 1 })
          .eq('id', foto.campana_id)
      }
    })

  // 3. Incrementar comercios_completados en participaciones
  const { data: part } = await admin
    .from('participaciones')
    .select('comercios_completados')
    .eq('campana_id', foto.campana_id)
    .eq('gondolero_id', foto.gondolero_id)
    .single()

  if (part) {
    await admin
      .from('participaciones')
      .update({ comercios_completados: (part.comercios_completados ?? 0) + 1 })
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
  }

  // 4. Acreditar puntos si no fueron acreditados todavía
  if (foto.puntos_otorgados === 0) {
    const { data: campana } = await admin
      .from('campanas')
      .select('puntos_por_foto, nombre')
      .eq('id', foto.campana_id)
      .single()

    const puntos = campana?.puntos_por_foto ?? 0

    if (puntos > 0) {
      await admin.from('movimientos_puntos').insert({
        gondolero_id: foto.gondolero_id,
        tipo:         'credito',
        monto:        puntos,
        concepto:     `Foto aprobada - ${campana?.nombre ?? 'campaña'}`,
        campana_id:   foto.campana_id,
        foto_id:      fotoId,
      })

      await admin
        .from('fotos')
        .update({ puntos_otorgados: puntos })
        .eq('id', fotoId)

      // Actualizar puntos_disponibles del gondolero
      const { data: profile } = await admin
        .from('profiles')
        .select('puntos_disponibles')
        .eq('id', foto.gondolero_id)
        .single()

      await admin
        .from('profiles')
        .update({ puntos_disponibles: (profile?.puntos_disponibles ?? 0) + puntos })
        .eq('id', foto.gondolero_id)
    }
  }

  revalidatePath('/distribuidora/gondolas')
}

export async function rechazarFoto(fotoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { error } = await adminClient()
    .from('fotos')
    .update({ estado: 'rechazada' })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo rechazar la foto: ' + error.message)

  revalidatePath('/distribuidora/gondolas')
}
