'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { calcularDistanciaMetros } from '@/lib/utils'
import { RADIO_BLOQUEO_METROS } from '@/lib/gps-radios'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Corrige la ubicación de un comercio.
 *
 * QUIÉN PUEDE: cualquier distribuidora, sobre cualquier comercio. El mapa es un
 * activo compartido y quien tiene evidencia de que un pin está mal es quien
 * mandó un gondolero ahí; restringirlo al "dueño" dejaría sin arreglar el caso
 * que originó todo esto. El control es el RASTRO VISIBLE, no el permiso: cada
 * corrección deja fila en comercios_ubicacion_historial y se muestra completa en
 * el detalle del comercio.
 *
 * NO SE PISA NADA. La fila de historial guarda las coordenadas anteriores, así
 * que "volver a la ubicación anterior" es otra corrección más —con su propia
 * fila— y no un borrado. El registro de lo que pasó es el control; un undo que
 * borra la fila destruye exactamente eso.
 */
export async function corregirUbicacionComercio(params: {
  comercioId: string
  lat: number
  lng: number
  /** Reportes que fundamentan la corrección. Se marcan 'aplicado'. */
  reporteIds?: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  if (!Number.isFinite(params.lat) || !Number.isFinite(params.lng)) {
    return { ok: false, error: 'Coordenadas inválidas.' }
  }

  const admin = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const { data: perfil } = await db
    .from('profiles')
    .select('distri_id, tipo_actor')
    .eq('id', user.id)
    .maybeSingle()

  if (perfil?.tipo_actor !== 'distribuidora' && perfil?.tipo_actor !== 'admin') {
    return { ok: false, error: 'No tenés permiso para corregir ubicaciones.' }
  }

  const { data: comercio } = await db
    .from('comercios')
    .select('id, lat, lng')
    .eq('id', params.comercioId)
    .maybeSingle()

  if (!comercio) return { ok: false, error: 'No encontramos el comercio.' }

  // 1. El historial PRIMERO: los reportes le apuntan con resuelto_en, así que
  //    la fila tiene que existir antes de marcarlos.
  const { data: fila, error: errHist } = await db
    .from('comercios_ubicacion_historial')
    .insert({
      comercio_id:   params.comercioId,
      lat_anterior:  comercio.lat,
      lng_anterior:  comercio.lng,
      lat_nueva:     params.lat,
      lng_nueva:     params.lng,
      corregido_por: user.id,
      distri_id:     perfil?.distri_id ?? null,
    })
    .select('id')
    .single()

  if (errHist || !fila) {
    console.error('[corregirUbicacion] error escribiendo historial:', errHist?.message)
    return { ok: false, error: 'No se pudo registrar la corrección.' }
  }

  // 2. Mover el pin.
  const { error: errUpd } = await db
    .from('comercios')
    .update({ lat: params.lat, lng: params.lng })
    .eq('id', params.comercioId)

  if (errUpd) {
    console.error('[corregirUbicacion] error moviendo el pin:', errUpd.message)
    return { ok: false, error: 'No se pudo actualizar la ubicación.' }
  }

  // 3. Resolver reportes.
  //
  //    Dos grupos, y la diferencia importa:
  //    · Los que el usuario eligió (reporteIds): alimentaron la corrección.
  //    · Los que quedaron pendientes pero cuya posición AHORA cae dentro del
  //      radio de bloqueo del pin nuevo: no entraron en el cálculo, pero la
  //      corrección igual resolvió su queja — ese gondolero ya no va a rebotar.
  //      Marcarlos es factualmente correcto.
  //
  //    Los que siguen lejos NO se tocan: quedan pendientes como señal nueva.
  //    Pueden ser un segundo local, o un reporte equivocado. En los dos casos
  //    hay que mirarlos, que es lo que 'pendiente' tiene que significar.
  //    Descartarlos en masa tiraría la única evidencia de que algo más pasa.
  const { data: pendientes } = await db
    .from('comercios_reportes_ubicacion')
    .select('id, lat, lng')
    .eq('comercio_id', params.comercioId)
    .eq('estado', 'pendiente')

  const elegidos = new Set(params.reporteIds ?? [])
  const aResolver: string[] = []

  for (const r of ((pendientes ?? []) as { id: string; lat: number; lng: number }[])) {
    if (elegidos.has(r.id)) { aResolver.push(r.id); continue }
    const d = calcularDistanciaMetros(r.lat, r.lng, params.lat, params.lng)
    if (d <= RADIO_BLOQUEO_METROS) aResolver.push(r.id)
  }

  if (aResolver.length > 0) {
    await db
      .from('comercios_reportes_ubicacion')
      .update({ estado: 'aplicado', resuelto_en: fila.id })
      .in('id', aResolver)
  }

  console.log('[corregirUbicacion] OK', {
    comercioId: params.comercioId,
    historialId: fila.id,
    reportesResueltos: aResolver.length,
    pendientesRestantes: (pendientes?.length ?? 0) - aResolver.length,
  })

  revalidatePath(`/distribuidora/comercios/${params.comercioId}`)
  revalidatePath('/distribuidora/comercios')
  return { ok: true }
}

/**
 * Descarta un reporte sin corregir nada.
 *
 * Para el reporte claramente erróneo — el gondolero que estaba en otro comercio,
 * el GPS que se fue a la loma. No borra la fila: cambia el estado, así que el
 * rastro de que alguien reportó y alguien lo descartó queda.
 */
export async function descartarReporteUbicacion(
  reporteId: string,
  comercioId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // ── El mismo chequeo que su hermana, que ésta no tenía ────────────────────
  // `corregirUbicacionComercio` exige `tipo_actor` distribuidora o admin; ésta
  // se conformaba con que hubiera alguien logueado, así que un gondolero podía
  // descartar los reportes de ubicación — o sea la evidencia de que un pin
  // está mal, que es justo lo que un gondolero produce.
  //
  // Lo que NO se agrega es un filtro por dueño, y es deliberado: la decisión
  // de producto de este archivo es que cualquier distribuidora pueda corregir
  // cualquier comercio, porque el mapa es un activo compartido y el control es
  // el RASTRO, no el permiso. Descartar es la otra mitad de esa misma
  // decisión. Ver el comentario de `corregirUbicacionComercio`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (admin as any)
    .from('profiles').select('tipo_actor').eq('id', user.id).maybeSingle()
  if (perfil?.tipo_actor !== 'distribuidora' && perfil?.tipo_actor !== 'admin') {
    return { ok: false, error: 'No tenés permiso para descartar reportes.' }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('comercios_reportes_ubicacion')
    .update({ estado: 'descartado' })
    .eq('id', reporteId)

  if (error) {
    console.error('[descartarReporte] error:', error.message)
    return { ok: false, error: 'No se pudo descartar el reporte.' }
  }

  revalidatePath(`/distribuidora/comercios/${comercioId}`)
  return { ok: true }
}
