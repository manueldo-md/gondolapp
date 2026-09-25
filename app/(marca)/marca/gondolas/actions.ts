'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { verificarLogros } from '@/lib/logros'
import { actualizarEstadoMision } from '@/lib/misiones'
import { sincronizarComerciosCompletados } from '@/lib/comercios-relevados'
import { fotoEsUnidadDePago } from '@/lib/validacion-comercio'
import { exigirFotoRevisable, ESTADOS_REVISABLES } from '@/lib/alcance-revision'
import { actorRevisorDeLaSesion } from '@/lib/actor-sesion'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aprobarFotoMarca(fotoId: string) {
  const admin = adminClient()

  // El id de la foto viene del cliente; el alcance, de la sesión. Hasta el
  // 25/9/2026 esto solo chequeaba que hubiera alguien logueado, y la pantalla
  // que lista estas fotos aceptaba `?campana=` sin intersectar: con esas dos
  // cosas juntas, una marca veía las fotos de otra Y las podía aprobar, que es
  // lo que libera bounty. Ver lib/alcance-revision.ts.
  const actor = await actorRevisorDeLaSesion(admin)
  if (!actor) redirect('/auth')
  const revisable = await exigirFotoRevisable({
    fotoId, actor, estados: ESTADOS_REVISABLES, admin, desde: 'marca/gondolas:aprobarFotoMarca',
  })
  if (!revisable) return

  // 1. Obtener la foto con datos de la campaña en una sola query
  const { data: foto, error: fotoError } = await admin
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

  // 2. Aprobar la foto y registrar puntos_otorgados
  await admin
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
    await admin.from('movimientos_puntos').insert({
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

  await admin.from('notificaciones').insert({
    gondolero_id: foto.gondolero_id,
    tipo:         'foto_aprobada',
    titulo:       '¡Foto aprobada! ✅',
    mensaje:      mensajeNotif,
    campana_id:   foto.campana_id,
  })

  // 6. LO QUE HABÍA ACÁ: la subida de nivel, segunda copia del mismo bloque.
  //
  // Leía `profiles.fotos_aprobadas` —que la RPC inexistente
  // `incrementar_fotos_aprobadas` nunca incrementó— y escribía `profiles.nivel`.
  // Nunca subió a nadie. El nivel ahora se deriva: lib/nivel-mensual.ts para el
  // que se muestra, lib/nivel-maximo.ts para el que abre los gates.

  // 6. Actualizar participación del gondolero
  const { data: part } = await admin
    .from('participaciones')
    .select('puntos_acumulados')
    .eq('campana_id', foto.campana_id)
    .eq('gondolero_id', foto.gondolero_id)
    .single()

  if (part) {
    await admin
      .from('participaciones')
      .update({ puntos_acumulados: (part.puntos_acumulados ?? 0) + campana.puntos_por_foto })
      .eq('campana_id', foto.campana_id)
      .eq('gondolero_id', foto.gondolero_id)
  }

  // `comercios_completados` y el estado 'completada': comercios DISTINTOS con
  // misión aprobada, recalculados. Ver lib/comercios-relevados.ts.
  await sincronizarComerciosCompletados(foto.campana_id, foto.gondolero_id, admin)

  // 7. Verificar y desbloquear logros. Cuenta las fotos aprobadas por su
  // cuenta: antes recibía el contador muerto.
  await verificarLogros(foto.gondolero_id, admin, foto.campana_id)

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

export async function rechazarFotoMarca(fotoId: string, motivoRechazo?: string) {
  // El motivo es obligatorio: con la recaptura activa, un rechazo sin explicar
  // manda al gondolero a repetir el mismo error a ciegas. Se valida en el
  // servidor y no solo en la UI, porque hay varias vias de rechazo.
  const motivo = motivoRechazo?.trim()
  if (!motivo) throw new Error('Falta el motivo del rechazo')

  const admin = adminClient()

  const actor = await actorRevisorDeLaSesion(admin)
  if (!actor) redirect('/auth')
  const revisable = await exigirFotoRevisable({
    fotoId, actor, estados: ESTADOS_REVISABLES, admin, desde: 'marca/gondolas:rechazarFotoMarca',
  })
  if (!revisable) return

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, mision_id, bloque_id, comercios(nombre)')
    .eq('id', fotoId)
    .single()

  const { error } = await admin
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
    await admin.from('notificaciones').insert({
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
      admin,
    })
  }

  revalidatePath('/marca/gondolas')
}
