'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getConfig } from '@/lib/config'
import { calcularNuevoNivel } from '@/lib/nivel'
import { verificarLogros } from '@/lib/logros'
import { actualizarEstadoMision } from '@/lib/misiones'

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

  const [adminClient, config] = [createAdminClient(), await getConfig()]
  const { fotosCasualAActivo, fotosActivoAPro } = config.niveles

  // 1. Obtener la foto con datos de la campaña
  const { data: foto, error: fotoError } = await adminClient
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

  // 2. Aprobar la foto y marcar puntos_otorgados
  await adminClient
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
    await adminClient.from('movimientos_puntos').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'credito',
      monto:        campana.puntos_por_foto,
      concepto:     `Foto aprobada · ${campana.nombre}`,
      campana_id:   foto.campana_id,
      foto_id:      fotoId,
    })
  }

  // 4. Incrementar fotos_aprobadas y recalcular tasa_aprobacion en profiles
  const { error: rpcFotosError } = await adminClient.rpc('incrementar_fotos_aprobadas', {
    p_gondolero_id: foto.gondolero_id,
  })

  if (rpcFotosError) {
    console.error('Error RPC incrementar_fotos_aprobadas:', rpcFotosError)
  }

  // 5. Notificación: foto aprobada
  const mensajeNotif = misionId
    ? `Tu foto en ${comercio?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan al completar el mínimo de misiones.`
    : `Tu foto en ${comercio?.nombre ?? 'el comercio'} fue aprobada. +${campana.puntos_por_foto} puntos`

  await adminClient.from('notificaciones').insert({
    gondolero_id: foto.gondolero_id,
    tipo:         'foto_aprobada',
    titulo:       '¡Foto aprobada! ✅',
    mensaje:      mensajeNotif,
    campana_id:   foto.campana_id,
  })

  // 6. Verificar subida de nivel
  const { data: profileNivel } = await adminClient
    .from('profiles')
    .select('fotos_aprobadas, nivel')
    .eq('id', foto.gondolero_id)
    .single()

  if (profileNivel) {
    const fotosAprobadas = profileNivel.fotos_aprobadas ?? 0
    const nuevoNivel = calcularNuevoNivel(fotosAprobadas, profileNivel.nivel, fotosCasualAActivo, fotosActivoAPro)

    if (nuevoNivel !== profileNivel.nivel) {
      await adminClient.from('profiles').update({ nivel: nuevoNivel }).eq('id', foto.gondolero_id)
      await adminClient.from('movimientos_puntos').insert({
        gondolero_id: foto.gondolero_id,
        tipo:         'credito',
        monto:        0,
        concepto:     `🎉 ¡Subiste al nivel ${nuevoNivel.toUpperCase()}!`,
        campana_id:   foto.campana_id,
      })
      await adminClient.from('notificaciones').insert({
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

  // 7. Actualizar participacion del gondolero
  const { data: part } = await adminClient
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

    await adminClient
      .from('participaciones')
      .update(updateData)
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
  }

  // 8. Incrementar comercios_relevados
  await adminClient
    .from('campanas')
    .update({
      comercios_relevados: (campana.comercios_relevados || 0) + 1,
    })
    .eq('id', foto.campana_id)

  // 9. Verificar y desbloquear logros
  if (profileNivel) {
    await verificarLogros(
      foto.gondolero_id,
      adminClient,
      profileNivel.fotos_aprobadas ?? 0,
      foto.campana_id
    )
  }

  // 10. Actualizar estado de la misión (si esta foto pertenece a una)
  await actualizarEstadoMision({
    fotoId:        fotoId,
    gondoleroId:   foto.gondolero_id,
    campanaId:     foto.campana_id,
    minParaCobrar: campana.min_comercios_para_cobrar ?? 1,
    admin:         adminClient,
  })

  revalidatePath('/distribuidora/gondolas')
  revalidatePath(`/distribuidora/campanas/${foto.campana_id}`)
}

export async function rechazarFoto(fotoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const adminClient = createAdminClient()

  const { data: fotoRaw } = await adminClient
    .from('fotos')
    .select('gondolero_id, campana_id, comercios(nombre)')
    .eq('id', fotoId)
    .single()

  const { error } = await adminClient
    .from('fotos')
    .update({ estado: 'rechazada' })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo rechazar la foto: ' + error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  if (foto?.gondolero_id) {
    await adminClient.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_rechazada',
      titulo:       'Foto no aprobada ❌',
      mensaje:      `Tu foto en ${foto?.comercios?.nombre ?? 'el comercio'} no fue aprobada esta vez. Revisá los requisitos e intentá de nuevo.`,
      campana_id:   foto.campana_id,
    })
  }

  revalidatePath('/distribuidora/gondolas')
}

export async function accionMasivaDistri(
  fotoIds: string[],
  accion: 'aprobada' | 'rechazada'
) {
  if (!fotoIds.length) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const [adminClient, config] = [createAdminClient(), await getConfig()]
  const { fotosCasualAActivo, fotosActivoAPro } = config.niveles

  // Solo fotos pendientes pueden procesarse en masa
  const { data: fotosRaw } = await adminClient
    .from('fotos')
    .select('id, gondolero_id, campana_id, comercios(nombre), campanas(puntos_por_foto, nombre, comercios_relevados, min_comercios_para_cobrar)')
    .in('id', fotoIds)
    .eq('estado', 'pendiente')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos = (fotosRaw ?? []) as any[]
  if (!fotos.length) return

  const idsElegibles = fotos.map((f: { id: string }) => f.id)

  if (accion === 'rechazada') {
    await adminClient.from('fotos').update({ estado: 'rechazada' }).in('id', idsElegibles)
    const notifs = fotos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((f: any) => f.gondolero_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => ({
        gondolero_id: f.gondolero_id,
        tipo:         'foto_rechazada',
        titulo:       'Foto no aprobada ❌',
        mensaje:      `Tu foto en ${f.comercios?.nombre ?? 'el comercio'} no fue aprobada esta vez. Revisá los requisitos e intentá de nuevo.`,
        campana_id:   f.campana_id,
      }))
    if (notifs.length) await adminClient.from('notificaciones').insert(notifs)
    revalidatePath('/distribuidora/gondolas')
    return
  }

  // accion === 'aprobada': procesar una por una
  for (const foto of fotos) {
    const campana = foto.campanas
    const puntos: number = campana?.puntos_por_foto ?? 0
    const misionIdFoto: string | null = foto.mision_id ?? null

    await adminClient.from('fotos').update({ estado: 'aprobada', puntos_otorgados: puntos }).eq('id', foto.id)
    if (!foto.gondolero_id) continue

    // Fotos sin misión (legacy): acreditar directamente.
    // Fotos con misión: actualizarEstadoMision acredita al alcanzar el mínimo.
    if (!misionIdFoto && puntos > 0) {
      await adminClient.from('movimientos_puntos').insert({
        gondolero_id: foto.gondolero_id,
        tipo:         'credito',
        monto:        puntos,
        concepto:     `Foto aprobada · ${campana?.nombre ?? ''}`,
        campana_id:   foto.campana_id,
        foto_id:      foto.id,
      })
    }

    await adminClient.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_aprobada',
      titulo:       '¡Foto aprobada! ✅',
      mensaje:      misionIdFoto
        ? `Tu foto en ${foto.comercios?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan al completar el mínimo de misiones.`
        : `Tu foto en ${foto.comercios?.nombre ?? 'el comercio'} fue aprobada. +${puntos} puntos`,
      campana_id:   foto.campana_id,
    })

    await adminClient.rpc('incrementar_fotos_aprobadas', { p_gondolero_id: foto.gondolero_id })

    // Nivel
    const { data: profileNivel } = await adminClient
      .from('profiles').select('fotos_aprobadas, nivel').eq('id', foto.gondolero_id).single()
    if (profileNivel) {
      const fotosAprobadas = profileNivel.fotos_aprobadas ?? 0
      const nuevoNivel = calcularNuevoNivel(fotosAprobadas, profileNivel.nivel, fotosCasualAActivo, fotosActivoAPro)
      if (nuevoNivel !== profileNivel.nivel) {
        await adminClient.from('profiles').update({ nivel: nuevoNivel }).eq('id', foto.gondolero_id)
        await adminClient.from('notificaciones').insert({
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

    // Participación
    const { data: part } = await adminClient
      .from('participaciones')
      .select('comercios_completados, puntos_acumulados')
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
      .single()

    if (part) {
      const nuevosComercios = (part.comercios_completados ?? 0) + 1
      const updateData: Record<string, number | string> = {
        puntos_acumulados:     (part.puntos_acumulados ?? 0) + puntos,
        comercios_completados: nuevosComercios,
      }
      const minRequerido: number | null = campana?.min_comercios_para_cobrar ?? null
      if (minRequerido !== null && nuevosComercios >= minRequerido) {
        updateData.estado = 'completada'
      }
      await adminClient
        .from('participaciones')
        .update(updateData)
        .eq('campana_id', foto.campana_id)
        .eq('gondolero_id', foto.gondolero_id)
    }

    await adminClient
      .from('campanas')
      .update({ comercios_relevados: (campana?.comercios_relevados || 0) + 1 })
      .eq('id', foto.campana_id)

    // Actualizar estado de la misión y acreditar puntos si alcanzó el mínimo
    await actualizarEstadoMision({
      fotoId:        foto.id,
      gondoleroId:   foto.gondolero_id,
      campanaId:     foto.campana_id,
      minParaCobrar: campana?.min_comercios_para_cobrar ?? 1,
      admin:         adminClient,
    })
  }

  revalidatePath('/distribuidora/gondolas')
}
