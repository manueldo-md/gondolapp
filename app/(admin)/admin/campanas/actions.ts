'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { crearNotificacionMarca } from '@/lib/notificaciones'
import { destrabarMisiones } from '@/lib/misiones-trabadas'
import { fotoEsUnidadDePago } from '@/lib/validacion-comercio'

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

  // ── Liberar puntos retenidos de todos los gondoleros en esta campaña ──────
  //
  // Solo de las fotos que SON unidad de pago. Este barrido paga desde `fotos`
  // ignorando las misiones, así que sin el filtro pagaba dos veces el mismo
  // trabajo por dos caminos distintos:
  //
  //   · Campaña de altas: la fachada queda 'retenido' hasta que alguien valida
  //     el comercio. Si la campaña cerraba antes, el barrido la pagaba sin
  //     validación — y si después alguien validaba el comercio, la misión la
  //     pagaba OTRA VEZ. La cola de pendientes no filtra por estado de campaña,
  //     así que validar después del cierre es un click normal, no un caso raro.
  //
  //   · Cualquier campaña: una foto con `mision_id` cuyo bounty quedara en
  //     'retenido' se pagaba acá y de nuevo al aprobar su misión.
  //
  // La regla es la misma que usan los tres paneles de revisión, en una sola
  // definición: lib/validacion-comercio.ts.
  const { data: campanaCierre } = await admin
    .from('campanas')
    .select('tipo')
    .eq('id', campanaId)
    .maybeSingle() as { data: { tipo: string | null } | null }

  const { data: fotosRetenidasRaw } = await admin
    .from('fotos')
    .select('id, gondolero_id, puntos_otorgados, mision_id')
    .eq('campana_id', campanaId)
    .eq('bounty_estado', 'retenido')

  const fotosRetenidas = ((fotosRetenidasRaw ?? []) as {
    id: string; gondolero_id: string | null; puntos_otorgados: number | null; mision_id: string | null
  }[]).filter(f => fotoEsUnidadDePago({ tipoCampana: campanaCierre?.tipo, misionId: f.mision_id }))

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
      // El saldo lo mueve el trigger `on_movimiento_puntos` con el insert de
      // arriba, que es el único escritor de `profiles.puntos_disponibles`.
      //
      // Acá había un `admin.rpc('incrementar_puntos', …)` que sumaba los mismos
      // puntos por segunda vez. **Esa función NO EXISTE** —verificado el
      // 17/9/2026 en dev, PGRST202, y no está en ninguna migración—, así que la
      // llamada venía fallando en silencio desde siempre y por eso el saldo
      // daba bien. Mismo caso que `incrementar_fotos_aprobadas`.
      //
      // Se saca en vez de dejarla: si alguien crea esa función algún día
      // pensando que falta, cada cierre de campaña pasa a pagar el doble sin
      // que nadie cambie una línea de este archivo.
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

/**
 * Reintenta la aprobación de las misiones survey-only que quedaron trabadas.
 * La lógica vive en lib/misiones-trabadas.ts; acá solo va la autenticación.
 *
 * Devuelve la forma de ResultadoBackfill, para compartir el botón con
 * "Asignar alias" y "Asignar códigos": asignados y fallidos por separado.
 */
export async function destrabarMisionesTrabadas(): Promise<{
  asignados: number
  fallidos: number
  detalle: string[]
  error?: string
}> {
  const admin = await getAdmin()
  try {
    const res = await destrabarMisiones(admin)
    revalidatePath('/admin/campanas')
    return { asignados: res.resueltas, fallidos: res.fallidas, detalle: res.detalle }
  } catch (err) {
    return {
      asignados: 0,
      fallidos: 0,
      detalle: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
