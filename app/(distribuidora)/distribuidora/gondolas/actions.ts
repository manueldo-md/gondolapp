'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function createAdminClient() {
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

  const adminClient = createAdminClient()

  // 1. Obtener la foto con datos de la campaña
  const { data: foto, error: fotoError } = await adminClient
    .from('fotos')
    .select('*, campanas(puntos_por_foto, nombre, comercios_relevados)')
    .eq('id', fotoId)
    .single()

  if (fotoError || !foto) {
    console.error('Error obteniendo foto:', fotoError)
    return { error: 'Foto no encontrada' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campana = (foto as any).campanas

  // 2. Aprobar la foto y marcar puntos_otorgados
  await adminClient
    .from('fotos')
    .update({
      estado:           'aprobada',
      puntos_otorgados: campana.puntos_por_foto,
    })
    .eq('id', fotoId)

  // 3. Insertar movimiento de puntos
  const { error: puntosError } = await adminClient
    .from('movimientos_puntos')
    .insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'credito',
      monto:        campana.puntos_por_foto,
      concepto:     `Foto aprobada · ${campana.nombre}`,
      campana_id:   foto.campana_id,
      foto_id:      fotoId,
    })

  if (puntosError) {
    console.error('Error insertando puntos:', puntosError)
  }

  // 4. Incrementar puntos en profiles via RPC
  // (actualiza puntos_disponibles Y puntos_totales_ganados atómicamente)
  const { error: rpcError } = await adminClient.rpc('incrementar_puntos', {
    p_gondolero_id: foto.gondolero_id,
    p_monto:        campana.puntos_por_foto,
  })

  if (rpcError) {
    console.error('Error RPC incrementar_puntos:', rpcError)
  }

  // 5. Actualizar participacion del gondolero
  const { data: part } = await adminClient
    .from('participaciones')
    .select('comercios_completados, puntos_acumulados')
    .eq('campana_id', foto.campana_id)
    .eq('gondolero_id', foto.gondolero_id)
    .single()

  if (part) {
    await adminClient
      .from('participaciones')
      .update({
        puntos_acumulados:     (part.puntos_acumulados     ?? 0) + campana.puntos_por_foto,
        comercios_completados: (part.comercios_completados ?? 0) + 1,
      })
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
  }

  // 6. Incrementar comercios_relevados
  await adminClient
    .from('campanas')
    .update({
      comercios_relevados: (campana.comercios_relevados || 0) + 1,
    })
    .eq('id', foto.campana_id)

  revalidatePath('/distribuidora/gondolas')
  revalidatePath(`/distribuidora/campanas/${foto.campana_id}`)
}

export async function rechazarFoto(fotoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { error } = await createAdminClient()
    .from('fotos')
    .update({ estado: 'rechazada' })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo rechazar la foto: ' + error.message)

  revalidatePath('/distribuidora/gondolas')
}
