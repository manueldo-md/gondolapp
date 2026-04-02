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

  // 1. Obtener la foto con datos de la campaña en una sola query
  const { data: foto, error: fotoError } = await admin
    .from('fotos')
    .select('*, campanas(puntos_por_foto, nombre, comercios_relevados, min_comercios_para_cobrar), comercios(nombre)')
    .eq('id', fotoId)
    .single()

  if (fotoError || !foto) {
    console.error('Error obteniendo foto:', fotoError)
    return { error: 'Foto no encontrada' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campana = (foto as any).campanas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comercio = (foto as any).comercios

  // 2. Aprobar la foto y registrar puntos_otorgados
  await admin
    .from('fotos')
    .update({
      estado:           'aprobada',
      puntos_otorgados: campana.puntos_por_foto,
    })
    .eq('id', fotoId)

  // 3. Insertar movimiento de puntos
  const { error: puntosError } = await admin
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

  // 4. Incrementar puntos_disponibles y puntos_totales_ganados en profiles
  const { error: rpcError } = await admin.rpc('incrementar_puntos', {
    p_gondolero_id: foto.gondolero_id,
    p_monto:        campana.puntos_por_foto,
  })

  if (rpcError) {
    console.error('Error RPC incrementar_puntos:', rpcError)
  }

  // 5. Incrementar fotos_aprobadas y recalcular tasa_aprobacion en profiles
  const { error: rpcFotosError } = await admin.rpc('incrementar_fotos_aprobadas', {
    p_gondolero_id: foto.gondolero_id,
  })

  if (rpcFotosError) {
    console.error('Error RPC incrementar_fotos_aprobadas:', rpcFotosError)
  }

  // 5b. Notificación: foto aprobada
  await admin.from('notificaciones').insert({
    gondolero_id: foto.gondolero_id,
    tipo:         'foto_aprobada',
    titulo:       '¡Foto aprobada! ✅',
    mensaje:      `Tu foto en ${comercio?.nombre ?? 'el comercio'} fue aprobada. +${campana.puntos_por_foto} puntos`,
    campana_id:   foto.campana_id,
  })

  // 6. Verificar subida de nivel
  const { data: profileNivel } = await admin
    .from('profiles')
    .select('fotos_aprobadas, nivel')
    .eq('id', foto.gondolero_id)
    .single()

  if (profileNivel) {
    const fotosAprobadas = profileNivel.fotos_aprobadas ?? 0
    let nuevoNivel = profileNivel.nivel

    if (fotosAprobadas >= 100 && profileNivel.nivel !== 'pro') {
      nuevoNivel = 'pro'
    } else if (fotosAprobadas >= 50 && profileNivel.nivel === 'casual') {
      nuevoNivel = 'activo'
    }

    if (nuevoNivel !== profileNivel.nivel) {
      await admin.from('profiles').update({ nivel: nuevoNivel }).eq('id', foto.gondolero_id)
      await admin.from('movimientos_puntos').insert({
        gondolero_id: foto.gondolero_id,
        tipo:         'credito',
        monto:        0,
        concepto:     `🎉 ¡Subiste al nivel ${nuevoNivel.toUpperCase()}!`,
        campana_id:   foto.campana_id,
      })
      await admin.from('notificaciones').insert({
        gondolero_id: foto.gondolero_id,
        tipo:         'nivel_subido',
        titulo:       `¡Subiste al nivel ${nuevoNivel.toUpperCase()}! 🎉`,
        mensaje:      `Alcanzaste el nivel ${nuevoNivel} en GondolApp. ¡Seguí así!`,
        campana_id:   foto.campana_id,
      })
    }
  }

  // 6. Actualizar participación del gondolero
  const { data: part } = await admin
    .from('participaciones')
    .select('comercios_completados, puntos_acumulados')
    .eq('campana_id', foto.campana_id)
    .eq('gondolero_id', foto.gondolero_id)
    .single()

  if (part) {
    const nuevosComercios = (part.comercios_completados ?? 0) + 1
    const updateData: Record<string, number | string> = {
      puntos_acumulados:     (part.puntos_acumulados ?? 0) + campana.puntos_por_foto,
      comercios_completados: nuevosComercios,
    }

    // Verificar si alcanzó el mínimo para completar la campaña
    const minRequerido: number | null = campana.min_comercios_para_cobrar ?? null
    if (minRequerido !== null && nuevosComercios >= minRequerido) {
      updateData.estado = 'completada'
    }

    await admin
      .from('participaciones')
      .update(updateData)
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
  }

  // 7. Incrementar comercios_relevados en la campaña
  await admin
    .from('campanas')
    .update({
      comercios_relevados: (campana.comercios_relevados || 0) + 1,
    })
    .eq('id', foto.campana_id)

  revalidatePath('/marca/gondolas')
}

export async function rechazarFotoMarca(fotoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, comercios(nombre)')
    .eq('id', fotoId)
    .single()

  const { error } = await admin
    .from('fotos')
    .update({ estado: 'rechazada' })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo rechazar la foto: ' + error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  if (foto?.gondolero_id) {
    await admin.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_rechazada',
      titulo:       'Foto no aprobada ❌',
      mensaje:      `Tu foto en ${foto?.comercios?.nombre ?? 'el comercio'} no fue aprobada esta vez. Revisá los requisitos e intentá de nuevo.`,
      campana_id:   foto.campana_id,
    })
  }

  revalidatePath('/marca/gondolas')
}
