'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { verificarLogros } from '@/lib/logros'
import { actualizarEstadoMision } from '@/lib/misiones'
import { sincronizarComerciosCompletados } from '@/lib/comercios-relevados'
import { fotoEsUnidadDePago } from '@/lib/validacion-comercio'

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
    .select('*, campanas(tipo, puntos_por_foto, puntos_por_mision, nombre, min_comercios_para_cobrar), comercios(nombre)')
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
  // Puntos efectivos: puntos_por_mision si existe, fallback a puntos_por_foto (campañas legacy)
  const puntosEfectivos: number = (campana.puntos_por_mision ?? 0) > 0
    ? campana.puntos_por_mision
    : campana.puntos_por_foto

  // 2. Aprobar la foto y marcar puntos_otorgados
  await adminClient
    .from('fotos')
    .update({
      estado:           'aprobada',
      puntos_otorgados: puntosEfectivos,
    })
    .eq('id', fotoId)

  // 3. Fotos sin misión (flujo legacy): acreditar directamente sin retención.
  //    Fotos con misión: actualizarEstadoMision acredita cuando se alcanza
  //    el mínimo de misiones para cobrar.
  //    El trigger on_movimiento_puntos actualiza profiles.puntos_disponibles automáticamente.
  // La fachada de un alta de comercio NO se paga acá.
  //
  // Esta rama acredita cualquier foto sin mision_id, y la fachada de una
  // campaña 'comercios' no tiene misión hasta que alguien VALIDA el comercio:
  // caía justo acá y cobraba fuera del sistema de bounty, sin mínimo, sin
  // retención y sin quedar registrada en ninguna misión. En prod pasó el
  // 17/9/2026 — 200 puntos acreditados 31 segundos después del alta, con el
  // comercio todavía sin validar. Ahora la paga validarComercioYCrearMision.
  if (fotoEsUnidadDePago({ tipoCampana: campana?.tipo, misionId }) && puntosEfectivos > 0) {
    await adminClient.from('movimientos_puntos').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'credito',
      monto:        puntosEfectivos,
      concepto:     `Foto aprobada · ${campana.nombre}`,
      campana_id:   foto.campana_id,
      foto_id:      fotoId,
    })
  }

  // 5. Notificación: foto aprobada
  const mensajeNotif = misionId
    ? `Tu foto en ${comercio?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan al completar el mínimo de misiones.`
    : `Tu foto en ${comercio?.nombre ?? 'el comercio'} fue aprobada. +${puntosEfectivos} puntos`

  await adminClient.from('notificaciones').insert({
    gondolero_id: foto.gondolero_id,
    tipo:         'foto_aprobada',
    titulo:       '¡Foto aprobada! ✅',
    mensaje:      mensajeNotif,
    campana_id:   foto.campana_id,
  })

  // 6. LO QUE HABÍA ACÁ: la subida de nivel, tercera copia del mismo bloque.
  //
  // Leía `profiles.fotos_aprobadas` —un contador que la RPC inexistente
  // `incrementar_fotos_aprobadas` nunca incrementó— y escribía `profiles.nivel`.
  // Nunca subió a nadie porque el número que comparaba era siempre 0.
  //
  // El nivel ahora se deriva: el visible de las misiones del mes
  // (lib/nivel-mensual.ts), el de los gates del máximo alcanzado
  // (lib/nivel-maximo.ts). No hay nada que escribir al aprobar una foto.

  // 7. Actualizar participacion del gondolero
  const { data: part } = await adminClient
    .from('participaciones')
    .select('puntos_acumulados')
    .eq('campana_id', foto.campana_id)
    .eq('gondolero_id', foto.gondolero_id)
    .single()

  if (part) {
    await adminClient
      .from('participaciones')
      .update({ puntos_acumulados: (part.puntos_acumulados ?? 0) + campana.puntos_por_foto })
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
  }

  // `comercios_completados` y el estado 'completada' los resuelve el helper:
  // recalcula comercios DISTINTOS con misión aprobada. Antes acá había un `+1`
  // por FOTO aprobada —una misión de dos fotos sumaba dos— repetido en cuatro
  // archivos. Ver lib/comercios-relevados.ts.
  await sincronizarComerciosCompletados(foto.campana_id, foto.gondolero_id, adminClient)

  // 8. Verificar y desbloquear logros. Cuenta las fotos aprobadas por su cuenta:
  // antes recibía el contador muerto y `primera_foto` no se desbloqueaba nunca.
  await verificarLogros(foto.gondolero_id, adminClient, foto.campana_id)

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

export async function rechazarFoto(fotoId: string, motivoRechazo?: string) {
  // El motivo es obligatorio: con la recaptura activa, un rechazo sin explicar
  // manda al gondolero a repetir el mismo error a ciegas. Se valida en el
  // servidor y no solo en la UI, porque hay varias vias de rechazo.
  const motivo = motivoRechazo?.trim()
  if (!motivo) throw new Error('Falta el motivo del rechazo')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const adminClient = createAdminClient()

  const { data: fotoRaw } = await adminClient
    .from('fotos')
    .select('gondolero_id, campana_id, mision_id, bloque_id, comercios(nombre)')
    .eq('id', fotoId)
    .single()

  const { error } = await adminClient
    .from('fotos')
    .update({ estado: 'rechazada', puntos_otorgados: 0, motivo_rechazo: motivo })
    .eq('id', fotoId)

  if (error) throw new Error('No se pudo rechazar la foto: ' + error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any

  if (foto?.gondolero_id) {
    const mensajeBase = `Tu foto en ${foto?.comercios?.nombre ?? 'el comercio'} no fue aprobada.`
    // El motivo siempre está: se valida arriba. Va en la notificación y no
    // solo en la pantalla de retake, porque es donde el gondolero se entera.
    const mensajeMotivo = ` Motivo: ${motivo}. Podés retomar la misión y rehacer esa foto.`
    await adminClient.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_rechazada',
      titulo:       'Foto no aprobada ❌',
      mensaje:      mensajeBase + mensajeMotivo,
      campana_id:   foto.campana_id,
    })

    // Verificar si la misión queda completa (todas aprobadas).
    // Si hay rechazadas, la misión permanece en pendiente hasta implementar recaptura.
    await actualizarEstadoMision({
      fotoId,
      gondoleroId: foto.gondolero_id,
      campanaId:   foto.campana_id,
      admin:       adminClient,
    })
  }

  revalidatePath('/distribuidora/gondolas')
}

export async function accionMasivaDistri(
  fotoIds: string[],
  accion: 'aprobada' | 'rechazada',
  motivoRechazo?: string
) {
  if (!fotoIds.length) return

  // El motivo es obligatorio también en el rechazo masivo: el gondolero rehace
  // la foto a partir de lo que dice el rechazo. Se aplica el mismo a todas.
  const motivo = motivoRechazo?.trim()
  if (accion === 'rechazada' && !motivo) throw new Error('Falta el motivo del rechazo')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const adminClient = createAdminClient()

  // Solo fotos pendientes pueden procesarse en masa
  const { data: fotosRaw } = await adminClient
    .from('fotos')
    .select('id, gondolero_id, campana_id, mision_id, bloque_id, comercios(nombre), campanas(tipo, puntos_por_foto, puntos_por_mision, nombre, min_comercios_para_cobrar)')
    .in('id', fotoIds)
    .eq('estado', 'pendiente')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos = (fotosRaw ?? []) as any[]
  if (!fotos.length) return

  const idsElegibles = fotos.map((f: { id: string }) => f.id)

  if (accion === 'rechazada') {
    await adminClient
      .from('fotos')
      .update({ estado: 'rechazada', puntos_otorgados: 0, motivo_rechazo: motivo })
      .in('id', idsElegibles)
    const notifs = fotos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((f: any) => f.gondolero_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => ({
        gondolero_id: f.gondolero_id,
        tipo:         'foto_rechazada',
        titulo:       'Foto no aprobada ❌',
        mensaje:      `Tu foto en ${f.comercios?.nombre ?? 'el comercio'} no fue aprobada. Motivo: ${motivo}. Podés retomar la misión y rehacer esa foto.`,
        campana_id:   f.campana_id,
      }))
    if (notifs.length) await adminClient.from('notificaciones').insert(notifs)
    // Verificar por cada foto rechazada si la misión queda completa.
    // Si hay rechazadas, permanece en pendiente hasta implementar recaptura.
    for (const f of fotos.filter((f: any) => f.gondolero_id && f.campana_id)) {
      await actualizarEstadoMision({
        fotoId:      f.id,
        gondoleroId: f.gondolero_id,
        campanaId:   f.campana_id,
        admin:       adminClient,
      })
    }
    revalidatePath('/distribuidora/gondolas')
    return
  }

  // accion === 'aprobada': procesar una por una
  for (const foto of fotos) {
    const campana = foto.campanas
    const misionIdFoto: string | null = foto.mision_id ?? null
    // Puntos efectivos: puntos_por_mision si existe, fallback a puntos_por_foto (campañas legacy)
    const puntos: number = (campana?.puntos_por_mision ?? 0) > 0
      ? campana?.puntos_por_mision ?? 0
      : campana?.puntos_por_foto ?? 0

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

    // La subida de nivel que había acá se fue con `profiles.nivel`. Ver el
    // comentario en la aprobación de a una, arriba.

    // Participación
    const { data: part } = await adminClient
      .from('participaciones')
      .select('puntos_acumulados')
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
      .single()

    if (part) {
      await adminClient
        .from('participaciones')
        .update({ puntos_acumulados: (part.puntos_acumulados ?? 0) + puntos })
        .eq('campana_id', foto.campana_id)
        .eq('gondolero_id', foto.gondolero_id)
    }

    await sincronizarComerciosCompletados(foto.campana_id, foto.gondolero_id, adminClient)

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
