'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getConfig } from '@/lib/config'
import { calcularNuevoNivel } from '@/lib/nivel'
import { verificarLogros } from '@/lib/logros'

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
    .select('gondolero_id, campana_id, campana:campanas(puntos_por_foto, min_comercios_para_cobrar, comercios_relevados, nombre), comercio:comercios(nombre)')
    .eq('id', fotoId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  const puntosPorFoto: number = foto?.campana?.puntos_por_foto ?? 0
  const minParaCobrar: number = foto?.campana?.min_comercios_para_cobrar ?? 1

  // Contar cuántas fotos aprobadas tiene este gondolero en esta campaña (incluyendo esta)
  let fotosAprobadas = 0
  if (foto?.gondolero_id && foto?.campana_id) {
    const { count } = await admin
      .from('fotos')
      .select('id', { count: 'exact', head: true })
      .eq('gondolero_id', foto.gondolero_id)
      .eq('campana_id', foto.campana_id)
      .eq('estado', 'aprobada')
    fotosAprobadas = (count ?? 0) + 1 // +1 por la foto que estamos aprobando ahora
  }

  // Determinar si los puntos se acreditan o quedan retenidos
  const puntosAlcanzan = fotosAprobadas >= minParaCobrar
  const bountyEstado = puntosAlcanzan ? 'acreditado' : 'retenido'

  await admin.from('fotos').update({
    estado: 'aprobada',
    puntos_otorgados: puntosPorFoto,
    bounty_estado: bountyEstado,
  }).eq('id', fotoId)

  if (foto?.gondolero_id) {
    // Si con esta foto el gondolero alcanza el mínimo, liberar también fotos retenidas anteriores
    if (puntosAlcanzan && fotosAprobadas === minParaCobrar) {
      // Esta foto empuja el total al mínimo: liberar todas las fotos retenidas de esta campaña
      const { data: fotosRetenidas } = await admin
        .from('fotos')
        .select('id, puntos_otorgados')
        .eq('gondolero_id', foto.gondolero_id)
        .eq('campana_id', foto.campana_id)
        .eq('bounty_estado', 'retenido')

      if (fotosRetenidas && fotosRetenidas.length > 0) {
        const idsRetenidos = (fotosRetenidas as { id: string }[]).map(f => f.id)
        await admin.from('fotos').update({ bounty_estado: 'acreditado' }).in('id', idsRetenidos)

        const puntosRetenidos = (fotosRetenidas as { puntos_otorgados: number }[])
          .reduce((sum, f) => sum + (f.puntos_otorgados ?? 0), 0)

        if (puntosRetenidos > 0) {
          await admin.from('movimientos_puntos').insert({
            gondolero_id: foto.gondolero_id,
            tipo: 'credito',
            monto: puntosRetenidos,
            concepto: `Puntos desbloqueados al alcanzar mínimo (${minParaCobrar} comercios)`,
            campana_id: foto.campana_id,
          })
          await admin.rpc('incrementar_puntos', {
            p_gondolero_id: foto.gondolero_id,
            p_monto: puntosRetenidos,
          })
        }
      }
    }

    if (puntosPorFoto > 0 && puntosAlcanzan) {
      await admin.from('movimientos_puntos').insert({
        gondolero_id: foto.gondolero_id,
        tipo: 'credito',
        monto: puntosPorFoto,
        concepto: 'Foto aprobada (admin)',
        campana_id: foto.campana_id,
      })
      await admin.rpc('incrementar_puntos', {
        p_gondolero_id: foto.gondolero_id,
        p_monto: puntosPorFoto,
      })
    }

    // Notificación: foto aprobada
    const mensajeNotif = puntosAlcanzan
      ? `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} fue aprobada. +${puntosPorFoto} puntos`
      : `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} fue aprobada. Los puntos se acreditan cuando llegues a ${minParaCobrar} comercios.`

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
    .select('id, estado, gondolero_id, campana_id, comercio:comercios(nombre), campana:campanas(puntos_por_foto, nombre)')
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
      await admin.from('fotos').update({ estado: 'aprobada', puntos_otorgados: puntos }).eq('id', foto.id)
      if (foto.gondolero_id) {
        if (puntos > 0) {
          await admin.from('movimientos_puntos').insert({
            gondolero_id: foto.gondolero_id,
            tipo: 'credito',
            monto: puntos,
            concepto: 'Foto aprobada (admin)',
            campana_id: foto.campana_id,
          })
          await admin.rpc('incrementar_puntos', { p_gondolero_id: foto.gondolero_id, p_monto: puntos })
        }
        await admin.from('notificaciones').insert({
          gondolero_id: foto.gondolero_id,
          tipo:         'foto_aprobada',
          titulo:       '¡Foto aprobada! ✅',
          mensaje:      `Tu foto en ${foto.comercio?.nombre ?? 'el comercio'} fue aprobada. +${puntos} puntos`,
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
