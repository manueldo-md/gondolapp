'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getConfig } from '@/lib/config'
import { calcularNuevoNivel } from '@/lib/nivel'
import { verificarLogros } from '@/lib/logros'
import { actualizarEstadoMision } from '@/lib/misiones'

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

  const [admin, config] = [adminClient(), await getConfig()]
  const { fotosCasualAActivo, fotosActivoAPro } = config.niveles

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misionId: string | null = (foto as any).mision_id ?? null

  // 2. Aprobar la foto y registrar puntos_otorgados
  await admin
    .from('fotos')
    .update({
      estado:           'aprobada',
      puntos_otorgados: campana.puntos_por_foto,
    })
    .eq('id', fotoId)

  // 3. Fotos sin misión (flujo legacy): acreditar directamente sin retención.
  //    Fotos con misión: actualizarEstadoMision acredita cuando se alcanza
  //    el mínimo de misiones para cobrar.
  //    El trigger on_movimiento_puntos actualiza profiles.puntos_disponibles automáticamente.
  if (!misionId && campana.puntos_por_foto > 0) {
    await admin.from('movimientos_puntos').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'credito',
      monto:        campana.puntos_por_foto,
      concepto:     `Foto aprobada · ${campana.nombre}`,
      campana_id:   foto.campana_id,
      foto_id:      fotoId,
    })
  }

  // 4. Incrementar fotos_aprobadas y recalcular tasa_aprobacion en profiles
  const { error: rpcFotosError } = await admin.rpc('incrementar_fotos_aprobadas', {
    p_gondolero_id: foto.gondolero_id,
  })

  if (rpcFotosError) {
    console.error('Error RPC incrementar_fotos_aprobadas:', rpcFotosError)
  }

  // 5. Notificación: foto aprobada
  const mensajeNotif = misionId
    ? `Tu foto en ${comercio?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan al completar el mínimo de misiones.`
    : `Tu foto en ${comercio?.nombre ?? 'el comercio'} fue aprobada. +${campana.puntos_por_foto} puntos`

  await admin.from('notificaciones').insert({
    gondolero_id: foto.gondolero_id,
    tipo:         'foto_aprobada',
    titulo:       '¡Foto aprobada! ✅',
    mensaje:      mensajeNotif,
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
    const nuevoNivel = calcularNuevoNivel(fotosAprobadas, profileNivel.nivel, fotosCasualAActivo, fotosActivoAPro)

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
        titulo:       `🎉 ¡Subiste al nivel ${nuevoNivel.toUpperCase()}!`,
        mensaje:      nuevoNivel === 'activo'
          ? 'Felicitaciones, ahora sos nivel Activo. Tenés acceso a más campañas y mejores premios.'
          : 'Felicitaciones, ahora sos nivel Pro. Podés canjear transferencias bancarias y tenés acceso a todas las campañas.',
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

  // 8. Verificar y desbloquear logros
  if (profileNivel) {
    await verificarLogros(
      foto.gondolero_id,
      admin,
      profileNivel.fotos_aprobadas ?? 0,
      foto.campana_id
    )
  }

  // 9. Actualizar estado de la misión (si esta foto pertenece a una)
  await actualizarEstadoMision({
    fotoId:        fotoId,
    gondoleroId:   foto.gondolero_id,
    campanaId:     foto.campana_id,
    minParaCobrar: campana.min_comercios_para_cobrar ?? 1,
    admin,
  })

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
