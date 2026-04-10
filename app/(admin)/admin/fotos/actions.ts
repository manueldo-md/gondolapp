'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getConfig } from '@/lib/config'
import { calcularNuevoNivel } from '@/lib/nivel'
import { verificarLogros } from '@/lib/logros'
import { actualizarEstadoMision } from '@/lib/misiones'

async function getAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aprobarFotoAdmin(fotoId: string) {
  const [admin, config] = await Promise.all([getAdmin(), getConfig()])
  const { fotosCasualAActivo, fotosActivoAPro } = config.niveles

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, mision_id, campana:campanas(puntos_por_foto, min_comercios_para_cobrar, comercios_relevados, nombre), comercio:comercios(nombre)')
    .eq('id', fotoId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  const puntosPorFoto: number = foto?.campana?.puntos_por_foto ?? 0
  const minParaCobrar: number = foto?.campana?.min_comercios_para_cobrar ?? 1
  const misionId: string | null = foto?.mision_id ?? null

  // 1. Aprobar la foto
  await admin.from('fotos').update({
    estado:           'aprobada',
    puntos_otorgados: puntosPorFoto,
  }).eq('id', fotoId)

  if (foto?.gondolero_id) {
    // 2. Fotos sin misión (flujo legacy): acreditar directamente sin retención.
    //    Fotos con misión: actualizarEstadoMision acredita cuando se alcanza
    //    el mínimo de misiones para cobrar.
    //    El trigger on_movimiento_puntos actualiza profiles.puntos_disponibles automáticamente.
    if (!misionId && puntosPorFoto > 0) {
      await admin.from('movimientos_puntos').insert({
        gondolero_id: foto.gondolero_id,
        tipo:         'credito',
        monto:        puntosPorFoto,
        concepto:     `Foto aprobada · ${foto?.campana?.nombre ?? ''}`,
        campana_id:   foto.campana_id,
        foto_id:      fotoId,
      })
    }

    // 3. Notificación: foto aprobada
    const mensajeNotif = misionId
      ? `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan al completar el mínimo de misiones.`
      : `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} fue aprobada. +${puntosPorFoto} puntos`

    await admin.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_aprobada',
      titulo:       '¡Foto aprobada! ✅',
      mensaje:      mensajeNotif,
      campana_id:   foto.campana_id,
    })

    await admin.rpc('incrementar_fotos_aprobadas', { p_gondolero_id: foto.gondolero_id })

    // Verificar subida de nivel
    const { data: profileNivel } = await admin
      .from('profiles')
      .select('fotos_aprobadas, nivel')
      .eq('id', foto.gondolero_id)
      .single()

    if (profileNivel) {
      const fotosAprobadasPerfil = profileNivel.fotos_aprobadas ?? 0
      const nuevoNivel = calcularNuevoNivel(fotosAprobadasPerfil, profileNivel.nivel, fotosCasualAActivo, fotosActivoAPro)

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

    // Verificar y desbloquear logros
    await verificarLogros(
      foto.gondolero_id,
      admin,
      profileNivel?.fotos_aprobadas ?? 0,
      foto.campana_id
    )
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

export async function rechazarFotoAdmin(fotoId: string) {
  const admin = await getAdmin()

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, comercio:comercios(nombre)')
    .eq('id', fotoId)
    .single()

  await admin.from('fotos').update({ estado: 'rechazada', puntos_otorgados: 0 }).eq('id', fotoId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  if (foto?.gondolero_id) {
    await admin.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_rechazada',
      titulo:       'Foto no aprobada ❌',
      mensaje:      `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} no fue aprobada esta vez. Revisá los requisitos e intentá de nuevo.`,
      campana_id:   foto.campana_id,
    })
  }

  revalidatePath('/admin/fotos')
}

export async function accionMasiva(
  fotoIds: string[],
  accion: 'aprobada' | 'rechazada' | 'archivada' | 'pendiente'
): Promise<{ procesadas: number; errores: number }> {
  if (!fotoIds.length) return { procesadas: 0, errores: 0 }
  const admin = await getAdmin()

  // Reglas: no aprobar archivadas ni ya aprobadas, no archivar aprobadas
  let query = admin
    .from('fotos')
    .select('id, estado, gondolero_id, campana_id, mision_id, comercio:comercios(nombre), campana:campanas(puntos_por_foto, nombre, min_comercios_para_cobrar)')
    .in('id', fotoIds)

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
    const { error } = await admin.from('fotos').update({ estado: 'rechazada', puntos_otorgados: 0 }).in('id', idsElegibles)
    if (!error) {
      const notifs = fotos
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((f: any) => f.gondolero_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => ({
          gondolero_id: f.gondolero_id,
          tipo:         'foto_rechazada',
          titulo:       'Foto no aprobada ❌',
          mensaje:      `Tu foto en ${f.comercio?.nombre ?? 'el comercio'} no fue aprobada esta vez. Revisá los requisitos e intentá de nuevo.`,
          campana_id:   f.campana_id,
        }))
      if (notifs.length) await admin.from('notificaciones').insert(notifs)
    }
    revalidatePath('/admin/fotos')
    return error ? { procesadas: 0, errores: idsElegibles.length } : { procesadas: idsElegibles.length, errores: 0 }
  }

  // accion === 'aprobada': una por una para puntos y nivel
  const config = await getConfig()
  const { fotosCasualAActivo, fotosActivoAPro } = config.niveles
  let procesadas = 0, errores = 0
  for (const foto of fotos) {
    try {
      const puntos: number = foto.campana?.puntos_por_foto ?? 0
      const misionIdFoto: string | null = foto.mision_id ?? null
      await admin.from('fotos').update({ estado: 'aprobada', puntos_otorgados: puntos }).eq('id', foto.id)
      if (foto.gondolero_id) {
        // Fotos sin misión (legacy): acreditar directamente.
        // Fotos con misión: actualizarEstadoMision acredita al alcanzar el mínimo.
        if (!misionIdFoto && puntos > 0) {
          await admin.from('movimientos_puntos').insert({
            gondolero_id: foto.gondolero_id,
            tipo:         'credito',
            monto:        puntos,
            concepto:     `Foto aprobada · ${foto.campana?.nombre ?? ''}`,
            campana_id:   foto.campana_id,
            foto_id:      foto.id,
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
        await admin.rpc('incrementar_fotos_aprobadas', { p_gondolero_id: foto.gondolero_id })
        const { data: profileNivel } = await admin
          .from('profiles').select('fotos_aprobadas, nivel').eq('id', foto.gondolero_id).single()
        if (profileNivel) {
          const fotosAprobadas = profileNivel.fotos_aprobadas ?? 0
          const nuevoNivel = calcularNuevoNivel(fotosAprobadas, profileNivel.nivel, fotosCasualAActivo, fotosActivoAPro)
          if (nuevoNivel !== profileNivel.nivel) {
            await admin.from('profiles').update({ nivel: nuevoNivel }).eq('id', foto.gondolero_id)
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

export async function cambiarEstadoFoto(fotoId: string, nuevoEstado: string) {
  if (nuevoEstado === 'aprobada') {
    await aprobarFotoAdmin(fotoId)
    return
  }
  if (nuevoEstado === 'rechazada') {
    await rechazarFotoAdmin(fotoId)
    return
  }
  // pendiente | en_revision | archivada → UPDATE directo sin tocar puntos
  const admin = await getAdmin()
  await admin.from('fotos').update({ estado: nuevoEstado }).eq('id', fotoId)
  revalidatePath('/admin/fotos')
}
