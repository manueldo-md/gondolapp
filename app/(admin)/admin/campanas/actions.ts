'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { crearNotificacionMarca } from '@/lib/notificaciones'

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

export async function pausarCampana(campanaId: string) {
  const admin = await getAdmin()
  await admin.from('campanas').update({ estado: 'pausada' }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}

export async function activarCampana(campanaId: string) {
  const admin = await getAdmin()
  await admin.from('campanas').update({ estado: 'activa' }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}

export async function cerrarCampana(campanaId: string) {
  const admin = await getAdmin()

  // Liberar puntos retenidos de todos los gondoleros en esta campaña
  const { data: fotosRetenidas } = await admin
    .from('fotos')
    .select('id, gondolero_id, puntos_otorgados')
    .eq('campana_id', campanaId)
    .eq('bounty_estado', 'retenido')

  if (fotosRetenidas && fotosRetenidas.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fRet = fotosRetenidas as any[]

    // Agrupar por gondolero
    const porGondolero: Record<string, number> = {}
    for (const f of fRet) {
      if (!f.gondolero_id) continue
      porGondolero[f.gondolero_id] = (porGondolero[f.gondolero_id] ?? 0) + (f.puntos_otorgados ?? 0)
    }

    // Marcar todas como acreditadas
    const idsRetenidos = fRet.map((f: { id: string }) => f.id)
    await admin.from('fotos').update({ bounty_estado: 'acreditado' }).in('id', idsRetenidos)

    // Acreditar puntos a cada gondolero
    for (const [gondoleroId, puntos] of Object.entries(porGondolero)) {
      if (puntos <= 0) continue
      await admin.from('movimientos_puntos').insert({
        gondolero_id: gondoleroId,
        tipo: 'credito',
        monto: puntos,
        concepto: 'Puntos liberados al cierre de campaña',
        campana_id: campanaId,
      })
      await admin.rpc('incrementar_puntos', {
        p_gondolero_id: gondoleroId,
        p_monto: puntos,
      })
      await admin.from('notificaciones').insert({
        gondolero_id: gondoleroId,
        tipo: 'foto_aprobada',
        titulo: '💰 Puntos acreditados',
        mensaje: `Se acreditaron ${puntos} puntos de la campaña al cierre de la misma.`,
        campana_id: campanaId,
      })
    }
  }

  await admin.from('campanas').update({ estado: 'cerrada' }).eq('id', campanaId)
  revalidatePath('/admin/campanas')
}

export async function aprobarCampanaPendiente(campanaId: string) {
  const admin = await getAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana } = await (admin as any)
    .from('campanas')
    .select('nombre, marca_id')
    .eq('id', campanaId)
    .single()

  await admin.from('campanas').update({ estado: 'activa' }).eq('id', campanaId)

  if (campana?.marca_id) {
    await crearNotificacionMarca(campana.marca_id, {
      tipo:        'campana_aprobada',
      titulo:      '¡Campaña aprobada!',
      mensaje:     `"${campana.nombre}" está activa y disponible para gondoleros.`,
      campanaId:   campanaId,
      linkDestino: `/marca/campanas/${campanaId}`,
    })
  }

  revalidatePath('/admin/campanas')
}

export async function rechazarCampanaPendiente(campanaId: string, motivo?: string) {
  const admin = await getAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana } = await (admin as any)
    .from('campanas')
    .select('nombre, marca_id')
    .eq('id', campanaId)
    .single()

  await admin.from('campanas').update({ estado: 'borrador', motivo_rechazo: motivo ?? null }).eq('id', campanaId)

  if (campana?.marca_id) {
    await crearNotificacionMarca(campana.marca_id, {
      tipo:        'campana_rechazada',
      titulo:      'Campaña rechazada',
      mensaje:     motivo ? `"${campana.nombre}" fue rechazada: ${motivo}` : `"${campana.nombre}" fue rechazada. Revisá los detalles y volvé a enviarla.`,
      campanaId:   campanaId,
      linkDestino: `/marca/campanas/${campanaId}`,
    })
  }

  revalidatePath('/admin/campanas')
}

export async function pedirCambiosCampanaPendiente(campanaId: string, motivo?: string) {
  const admin = await getAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana } = await (admin as any)
    .from('campanas')
    .select('nombre, marca_id')
    .eq('id', campanaId)
    .single()

  await admin.from('campanas').update({ estado: 'pendiente_cambios', motivo_rechazo: motivo ?? null }).eq('id', campanaId)

  if (campana?.marca_id) {
    await crearNotificacionMarca(campana.marca_id, {
      tipo:        'cambios_solicitados',
      titulo:      'Se solicitaron cambios en tu campaña',
      mensaje:     motivo ? `"${campana.nombre}": ${motivo}` : `"${campana.nombre}" requiere modificaciones antes de ser aprobada.`,
      campanaId:   campanaId,
      linkDestino: `/marca/campanas/${campanaId}/detalle`,
    })
  }

  revalidatePath('/admin/campanas')
}
