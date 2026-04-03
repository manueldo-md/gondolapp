'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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
  const admin = await getAdmin()

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, campana:campanas(puntos_por_foto, comercios_relevados, nombre), comercio:comercios(nombre)')
    .eq('id', fotoId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  const puntosPorFoto: number = foto?.campana?.puntos_por_foto ?? 0

  await admin.from('fotos').update({
    estado: 'aprobada',
    puntos_otorgados: puntosPorFoto,
  }).eq('id', fotoId)

  if (foto?.gondolero_id) {
    if (puntosPorFoto > 0) {
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
    await admin.from('notificaciones').insert({
      gondolero_id: foto.gondolero_id,
      tipo:         'foto_aprobada',
      titulo:       '¡Foto aprobada! ✅',
      mensaje:      `Tu foto en ${foto?.comercio?.nombre ?? 'el comercio'} fue aprobada. +${puntosPorFoto} puntos`,
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
          titulo:       `🎉 ¡Subiste al nivel ${nuevoNivel.toUpperCase()}!`,
          mensaje:      nuevoNivel === 'activo'
            ? 'Felicitaciones, ahora sos nivel Activo. Tenés acceso a más campañas y mejores premios.'
            : 'Felicitaciones, ahora sos nivel Pro. Podés canjear transferencias bancarias y tenés acceso a todas las campañas.',
          campana_id:   foto.campana_id,
        })
      }
    }
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
  accion: 'aprobada' | 'rechazada' | 'archivada'
) {
  if (!fotoIds.length) return
  const admin = await getAdmin()

  // Reglas: no aprobar archivadas, no archivar aprobadas
  let query = admin
    .from('fotos')
    .select('id, estado, gondolero_id, campana_id, comercio:comercios(nombre), campana:campanas(puntos_por_foto, nombre)')
    .in('id', fotoIds)

  if (accion === 'aprobada') {
    query = query.neq('estado', 'archivada').neq('estado', 'aprobada')
  } else if (accion === 'archivada') {
    query = query.neq('estado', 'aprobada')
  }

  const { data: fotosRaw } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos = (fotosRaw ?? []) as any[]
  if (!fotos.length) return

  const idsElegibles = fotos.map((f: { id: string }) => f.id)

  if (accion === 'archivada') {
    await admin.from('fotos').update({ estado: 'archivada' }).in('id', idsElegibles)
    revalidatePath('/admin/fotos')
    return
  }

  if (accion === 'rechazada') {
    await admin.from('fotos').update({ estado: 'rechazada', puntos_otorgados: 0 }).in('id', idsElegibles)
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
    revalidatePath('/admin/fotos')
    return
  }

  // accion === 'aprobada': una por una para puntos y nivel
  for (const foto of fotos) {
    const puntos: number = foto.campana?.puntos_por_foto ?? 0
    await admin.from('fotos').update({ estado: 'aprobada', puntos_otorgados: puntos }).eq('id', foto.id)
    if (!foto.gondolero_id) continue
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
      let nuevoNivel = profileNivel.nivel
      if (fotosAprobadas >= 100 && profileNivel.nivel !== 'pro') nuevoNivel = 'pro'
      else if (fotosAprobadas >= 50 && profileNivel.nivel === 'casual') nuevoNivel = 'activo'
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

  revalidatePath('/admin/fotos')
}
