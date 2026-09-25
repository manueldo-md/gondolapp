'use server'
import { acreditarPorFoto } from '@/lib/credito-foto'
import { getAdmin } from '@/lib/admin-sesion'
import { redirect } from 'next/navigation'

import { revalidatePath } from 'next/cache'
import { verificarLogros } from '@/lib/logros'
import { actualizarEstadoMision } from '@/lib/misiones'
import { fotoEsUnidadDePago } from '@/lib/validacion-comercio'
import { exigirFotoRevisable, fotosQuePuedeRevisar } from '@/lib/alcance-revision'
import { actorRevisorDeLaSesion } from '@/lib/actor-sesion'


/**
 * El cliente service-role y QUIÉN está del otro lado, juntos.
 *
 * `getAdmin()` solo dice que hay una sesión; el nombre engaña, porque lo que
 * devuelve es un cliente con permisos de admin para cualquiera que pase.
 * Lo que decide es el actor, y para un admin real el alcance es "todas".
 *
 * Esto NO reemplaza el chequeo de `tipo_actor` que estas actions necesitan
 * como segunda capa —hoy las tapa solo el middleware—: un actor no-admin que
 * llegara acá quedaría acotado a SUS campañas, que es mejor que nada pero no
 * es lo mismo que rebotarlo.
 */
async function getAdminYActor() {
  const admin = await getAdmin()
  const actor = await actorRevisorDeLaSesion(admin)
  if (!actor) redirect('/auth')
  return { admin, actor }
}

/**
 * Los estados desde los que el ADMIN puede aprobar.
 *
 * Incluye `rechazada` y los otros paneles no: corregir un rechazo equivocado es
 * trabajo de admin, y es la única vía que hay. **Y deja abierto el replay por
 * la puerta de al lado**: aprobar → rechazar → aprobar vuelve a acreditar,
 * porque `rechazarFotoAdmin` no revierte el movimiento, solo pone
 * `puntos_otorgados: 0`. Eso no lo cierra un filtro de estado; lo cierra el
 * índice único sobre `movimientos_puntos(foto_id, tipo)`, que va aparte.
 */
const DESDE_DONDE_APRUEBA_ADMIN = ['pendiente', 'en_revision', 'rechazada']

export async function aprobarFotoAdmin(fotoId: string) {
  const { admin, actor } = await getAdminYActor()

  // El alcance, y de paso el estado: hasta el 25/9/2026 esta función no miraba
  // `estado`, así que reaprobar la misma foto volvía a acreditar. Ver
  // lib/alcance-revision.ts.
  const revisable = await exigirFotoRevisable({
    fotoId, actor, estados: DESDE_DONDE_APRUEBA_ADMIN, admin, desde: 'admin/fotos:aprobarFotoAdmin',
  })
  if (!revisable) return

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, mision_id, bloque_id, campana:campanas(tipo, puntos_por_foto, puntos_por_mision, min_comercios_para_cobrar, nombre), comercio:comercios(nombre)')
    .eq('id', fotoId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  const minParaCobrar: number = foto?.campana?.min_comercios_para_cobrar ?? 1
  const misionId: string | null = foto?.mision_id ?? null
  const bloqueId: string | null = foto?.bloque_id ?? null
  // Puntos efectivos: puntos_por_mision si existe, fallback a puntos_por_foto (campañas legacy)
  const puntosEfectivos: number = (foto?.campana?.puntos_por_mision ?? 0) > 0
    ? foto?.campana?.puntos_por_mision ?? 0
    : foto?.campana?.puntos_por_foto ?? 0

  // 1. Aprobar la foto
  await admin.from('fotos').update({
    estado:           'aprobada',
    puntos_otorgados: puntosEfectivos,
  }).eq('id', fotoId)

  if (foto?.gondolero_id) {
    // 2. Fotos sin misión (flujo legacy): acreditar directamente sin retención.
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
    if (fotoEsUnidadDePago({ tipoCampana: foto?.campana?.tipo, misionId }) && puntosEfectivos > 0) {
      await acreditarPorFoto({
        admin, gondoleroId: foto.gondolero_id, fotoId, campanaId: foto.campana_id,
        monto: puntosEfectivos,
        concepto: `Foto aprobada · ${foto?.campana?.nombre ?? ''}`,
        desde: 'admin/fotos:aprobarFotoAdmin',
      })
    }

    // 3. Notificación: foto aprobada
    const mensajeNotif = misionId
      ? `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan al completar el mínimo de misiones.`
      : `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} fue aprobada. +${puntosEfectivos} puntos`

    await admin.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_aprobada',
      titulo:       '¡Foto aprobada! ✅',
      mensaje:      mensajeNotif,
      campana_id:   foto.campana_id,
    })

    // ── LO QUE HABÍA ACÁ: la "subida de nivel" ────────────────────────────────
    // Una llamada a `incrementar_fotos_aprobadas` —una RPC que NO EXISTE en la
    // base, verificado el 17/9/2026— seguida de leer `profiles.fotos_aprobadas`
    // y `profiles.nivel` para decidir si el gondolero subía de nivel.
    //
    // Nunca subió a nadie: el contador que leía nunca se incrementó, así que
    // `calcularNuevoNivel` recibía siempre 0 y devolvía el mismo nivel. Las tres
    // pantallas de aprobación tenían la misma copia del bloque, y las tres
    // fallaban igual.
    //
    // El nivel ahora se DERIVA: el que se muestra sale de las misiones del mes
    // (lib/nivel-mensual.ts) y el que abre los gates es el máximo alcanzado
    // (lib/nivel-maximo.ts). No hay contador que mantener ni columna que
    // escribir, así que tampoco hay nada que hacer acá al aprobar una foto.
    //
    // Se pierde la notificación "¡Subiste al nivel X!", que igual no se envió
    // nunca. Con el nivel derivado hace falta otro disparador —comparar el nivel
    // antes y después de la misión que lo cruza— y eso es un tramo propio.

    // Verificar y desbloquear logros. `verificarLogros` cuenta las fotos
    // aprobadas por su cuenta desde el 17/9/2026: antes recibía el contador
    // muerto y por eso `primera_foto` no se desbloqueaba nunca.
    await verificarLogros(foto.gondolero_id, admin, foto.campana_id)
  }

  // Actualizar estado de la misión (si esta foto pertenece a una)
  if (foto?.gondolero_id && foto?.campana_id) {
    await actualizarEstadoMision({
      fotoId:        fotoId,
      gondoleroId:   foto.gondolero_id,
      campanaId:     foto.campana_id,
      minParaCobrar: minParaCobrar,
      admin,
    })
  }

  revalidatePath('/admin/fotos')
}

export async function rechazarFotoAdmin(fotoId: string, motivoRechazo?: string) {
  // El motivo es obligatorio: con la recaptura activa, un rechazo sin explicar
  // manda al gondolero a repetir el mismo error a ciegas. Se valida en el
  // servidor y no solo en la UI, porque hay varias vias de rechazo.
  const motivo = motivoRechazo?.trim()
  if (!motivo) throw new Error('Falta el motivo del rechazo')

  const { admin, actor } = await getAdminYActor()

  // `aprobada` está en la lista: revocar una aprobación equivocada es trabajo
  // de admin. OJO — eso NO devuelve los puntos ya acreditados; solo pone
  // `puntos_otorgados: 0`, que es un número de pantalla. Anotado aparte.
  const revisable = await exigirFotoRevisable({
    fotoId, actor, estados: ['pendiente', 'en_revision', 'aprobada'], admin,
    desde: 'admin/fotos:rechazarFotoAdmin',
  })
  if (!revisable) return

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, mision_id, bloque_id, comercio:comercios(nombre)')
    .eq('id', fotoId)
    .single()

  await admin.from('fotos').update({ estado: 'rechazada', puntos_otorgados: 0, motivo_rechazo: motivo }).eq('id', fotoId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any

  if (foto?.gondolero_id) {
    const mensajeBase = `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} no fue aprobada.`
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

  revalidatePath('/admin/fotos')
}

export async function accionMasiva(
  fotoIds: string[],
  accion: 'aprobada' | 'rechazada' | 'archivada' | 'pendiente',
  motivoRechazo?: string
): Promise<{ procesadas: number; errores: number }> {
  if (!fotoIds.length) return { procesadas: 0, errores: 0 }

  // El motivo es obligatorio también en el rechazo masivo: el gondolero rehace
  // la foto a partir de lo que dice el rechazo. Se aplica el mismo a todas.
  const motivo = motivoRechazo?.trim()
  if (accion === 'rechazada' && !motivo) throw new Error('Falta el motivo del rechazo')
  const { admin, actor } = await getAdminYActor()

  // ── El permiso, foto por foto ─────────────────────────────────────────────
  // El lote entero lo elige el cliente. Se filtra y NO se aborta: un id ajeno
  // mezclado no debe impedir el trabajo legítimo del resto del lote.
  //
  // Los estados los sigue decidiendo el bloque de abajo, que es el que sabe qué
  // permite cada acción. Acá se aceptan todos a propósito, para que la
  // clasificación de "ajena" no dependa del estado en que esté la foto de otro.
  const alcance = await fotosQuePuedeRevisar({
    fotoIds, actor, admin,
    estados: ['pendiente', 'en_revision', 'aprobada', 'rechazada', 'archivada'],
  })
  if (alcance.ajenas.length > 0) {
    console.error(
      `[alcance-revision] admin/fotos:accionMasiva: ${actor.tipo} mandó ` +
      `${alcance.ajenas.length} foto(s) fuera de su alcance en un lote de ` +
      `${fotoIds.length}. Se descartan:`, alcance.ajenas
    )
  }
  const idsPermitidos = alcance.permitidas.map(f => f.id)
  if (!idsPermitidos.length) return { procesadas: 0, errores: 0 }

  // Reglas: no aprobar archivadas ni ya aprobadas, no archivar aprobadas
  let query = admin
    .from('fotos')
    .select('id, estado, gondolero_id, campana_id, mision_id, bloque_id, comercio:comercios(nombre), campana:campanas(tipo, puntos_por_foto, puntos_por_mision, nombre, min_comercios_para_cobrar)')
    .in('id', idsPermitidos)

  if (accion === 'aprobada') {
    query = query.neq('estado', 'archivada').neq('estado', 'aprobada')
  } else if (accion === 'archivada') {
    query = query.neq('estado', 'aprobada')
  } else if (accion === 'pendiente') {
    query = query.neq('estado', 'pendiente') // excluir las que ya están pendientes
  }

  const { data: fotosRaw } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos = (fotosRaw ?? []) as any[]
  if (!fotos.length) return { procesadas: 0, errores: 0 }

  const idsElegibles = fotos.map((f: { id: string }) => f.id)

  if (accion === 'archivada') {
    const { error } = await admin.from('fotos').update({ estado: 'archivada' }).in('id', idsElegibles)
    revalidatePath('/admin/fotos')
    return error ? { procesadas: 0, errores: idsElegibles.length } : { procesadas: idsElegibles.length, errores: 0 }
  }

  if (accion === 'pendiente') {
    const { error } = await admin.from('fotos').update({ estado: 'pendiente' }).in('id', idsElegibles)
    revalidatePath('/admin/fotos')
    return error ? { procesadas: 0, errores: idsElegibles.length } : { procesadas: idsElegibles.length, errores: 0 }
  }

  if (accion === 'rechazada') {
    const { error } = await admin
      .from('fotos')
      .update({ estado: 'rechazada', puntos_otorgados: 0, motivo_rechazo: motivo })
      .in('id', idsElegibles)
    if (!error) {
      const notifs = fotos
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((f: any) => f.gondolero_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => ({
          gondolero_id: f.gondolero_id,
          tipo:         'foto_rechazada',
          titulo:       'Foto no aprobada ❌',
          mensaje:      `Tu foto en ${f.comercio?.nombre ?? 'el comercio'} no fue aprobada. Motivo: ${motivo}. Podés retomar la misión y rehacer esa foto.`,
          campana_id:   f.campana_id,
        }))
      if (notifs.length) await admin.from('notificaciones').insert(notifs)
      // Verificar por cada foto rechazada si la misión queda completa.
      // Si hay rechazadas, permanece en pendiente hasta implementar recaptura.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of fotos.filter((f: any) => f.gondolero_id && f.campana_id)) {
        await actualizarEstadoMision({
          fotoId:      f.id,
          gondoleroId: f.gondolero_id,
          campanaId:   f.campana_id,
          admin,
        })
      }
    }
    revalidatePath('/admin/fotos')
    return error ? { procesadas: 0, errores: idsElegibles.length } : { procesadas: idsElegibles.length, errores: 0 }
  }

  // accion === 'aprobada': una por una, por los puntos de cada foto.
  let procesadas = 0, errores = 0
  for (const foto of fotos) {
    try {
      const misionIdFoto: string | null = foto.mision_id ?? null
      // Puntos efectivos: puntos_por_mision si existe, fallback a puntos_por_foto (campañas legacy)
      const puntos: number = (foto.campana?.puntos_por_mision ?? 0) > 0
        ? foto.campana?.puntos_por_mision ?? 0
        : foto.campana?.puntos_por_foto ?? 0
      await admin.from('fotos').update({ estado: 'aprobada', puntos_otorgados: puntos }).eq('id', foto.id)

      if (foto.gondolero_id) {
        // Fotos sin misión (legacy): acreditar directamente.
        // Fotos con misión: actualizarEstadoMision acredita al alcanzar el mínimo.
        if (!misionIdFoto && puntos > 0) {
          await acreditarPorFoto({
            admin, gondoleroId: foto.gondolero_id, fotoId: foto.id, campanaId: foto.campana_id,
            monto: puntos,
            concepto: `Foto aprobada · ${foto.campana?.nombre ?? ''}`,
            desde: 'admin/fotos:accionMasiva',
          })
        }
        await admin.from('notificaciones').insert({
          gondolero_id: foto.gondolero_id,
          tipo:         'foto_aprobada',
          titulo:       '¡Foto aprobada! ✅',
          mensaje:      misionIdFoto
            ? `Tu foto en ${foto.comercio?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan al completar el mínimo de misiones.`
            : `Tu foto en ${foto.comercio?.nombre ?? 'el comercio'} fue aprobada. +${puntos} puntos`,
          campana_id:   foto.campana_id,
        })
        // La subida de nivel que había acá se fue con `profiles.nivel`. Ver el
        // comentario largo en `aprobarFoto`, arriba.
        // Actualizar estado de la misión y acreditar puntos si alcanzó el mínimo
        await actualizarEstadoMision({
          fotoId:        foto.id,
          gondoleroId:   foto.gondolero_id,
          campanaId:     foto.campana_id,
          minParaCobrar: foto.campana?.min_comercios_para_cobrar ?? 1,
          admin,
        })
      }
      procesadas++
    } catch {
      errores++
    }
  }

  revalidatePath('/admin/fotos')
  return { procesadas, errores }
}

export async function cambiarEstadoFoto(fotoId: string, nuevoEstado: string, motivoRechazo?: string) {
  if (nuevoEstado === 'aprobada') {
    await aprobarFotoAdmin(fotoId)
    return
  }
  if (nuevoEstado === 'rechazada') {
    await rechazarFotoAdmin(fotoId, motivoRechazo)
    return
  }
  // pendiente | en_revision | archivada → UPDATE directo sin tocar puntos
  //
  // No toca puntos, pero SÍ habilita tocarlos: mandar una foto aprobada de
  // vuelta a 'pendiente' es lo que después deja aprobarla de nuevo. Así que el
  // alcance se chequea igual, y por eso los estados de origen son todos.
  const { admin, actor } = await getAdminYActor()
  const revisable = await exigirFotoRevisable({
    fotoId, actor, admin, desde: 'admin/fotos:cambiarEstadoFoto',
    estados: ['pendiente', 'en_revision', 'aprobada', 'rechazada', 'archivada'],
  })
  if (!revisable) return

  await admin.from('fotos').update({ estado: nuevoEstado }).eq('id', fotoId)
  revalidatePath('/admin/fotos')
}
