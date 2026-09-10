'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getConfigCompresion, type ConfigCompresion } from '@/lib/config'
import {
  crearNotificacionDistri,
  crearNotificacionMarca,
  crearNotificacionAdmin,
  existeNotifReciente,
} from '@/lib/notificaciones'
import { registrarChecksGPSInterno } from './actions-checks'
import { resolverMisionDirecta } from '@/lib/misiones'
import { calcularDistanciaMetros } from '@/lib/utils'

/** Mismo radio que usa el paso de GPS del flujo normal de captura. */
const RADIO_GPS_METROS = Number(process.env.NEXT_PUBLIC_GPS_RADIO_METROS ?? 50) || 50

export async function obtenerConfigCompresion(): Promise<ConfigCompresion> {
  return getConfigCompresion()
}

export interface RegistrarFotoParams {
  campanaId: string
  bloqueId: string
  comercioId: string
  storagePath: string
  url: string
  lat: number
  lng: number
  precioConfirmado: number | null
  timestampDispositivo: string
  deviceId: string
  puntosAcreditar: number
  blurScore?: number | null
  respuestas?: { campo_id: string; valor: unknown }[]
}

export async function registrarFoto(params: RegistrarFotoParams) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Verificar que tiene participación activa
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: participacion } = await (supabase as any)
    .from('participaciones')
    .select('id, comercios_completados')
    .eq('campana_id', params.campanaId)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')
    .maybeSingle() as { data: { id: string; comercios_completados: number } | null }

  if (!participacion) {
    throw new Error('No tenés una participación activa en esta campaña.')
  }

  // Admin client para tablas con RLS restringida a service_role.
  const db = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ) as any

  // Crear registro de foto
  const { data: foto, error: fotoError } = await db
    .from('fotos')
    .insert({
      campana_id:            params.campanaId,
      bloque_id:             params.bloqueId,
      gondolero_id:          user.id,
      comercio_id:           params.comercioId,
      url:                   params.url,
      storage_path:          params.storagePath,
      lat:                   params.lat,
      lng:                   params.lng,
      timestamp_dispositivo: params.timestampDispositivo,
      device_id:             params.deviceId,
      precio_confirmado:     params.precioConfirmado,
      blur_score:            params.blurScore ?? null,
      estado:                'pendiente',
      puntos_otorgados:      params.puntosAcreditar,
    })
    .select('id')
    .single()

  if (fotoError) {
    throw new Error('No pudimos guardar la foto: ' + fotoError.message)
  }

  // NO acreditar puntos aquí — los puntos se acreditan solo al aprobar
  // la misión y cuando el gondolero alcanza el mínimo de misiones para cobrar
  // (ver actualizarEstadoMision en lib/misiones.ts).

  // Incrementar comercios_completados en la participación
  await db
    .from('participaciones')
    .update({ comercios_completados: (participacion.comercios_completados ?? 0) + 1 })
    .eq('id', participacion.id)

  // Guardar respuestas del formulario dinámico (si las hay)
  if (params.respuestas && params.respuestas.length > 0) {
    await db.from('foto_respuestas').insert(
      params.respuestas.map(r => ({
        foto_id:  foto.id,
        campo_id: r.campo_id,
        valor:    r.valor,
      }))
    )
  }

  return { fotoId: foto.id, puntos: params.puntosAcreditar }
}

// Sube una foto a Supabase Storage usando el service role para bypassear RLS.
// Recibe FormData porque los Blobs no se pueden pasar directamente a Server Actions.
export async function subirFoto(formData: FormData): Promise<{ url: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const file = formData.get('foto') as File
  const storagePath = formData.get('storagePath') as string

  if (!file || !storagePath) throw new Error('Faltan datos para subir la foto.')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await admin.storage
    .from('fotos-gondola')
    .upload(storagePath, file, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error('Error al subir la foto: ' + error.message)

  const { data: urlData } = admin.storage
    .from('fotos-gondola')
    .getPublicUrl(storagePath)

  return { url: urlData.publicUrl }
}

export interface FotoMisionInput {
  bloqueId: string
  storagePath: string
  url: string
  precioConfirmado: number | null
  timestampDispositivo: string
  blurScore: number | null
  respuestas: { campo_id: string; valor: unknown }[]
  /**
   * Presente solo para fotos de campos tipo='foto'.
   * undefined = foto del bloque (comportamiento original).
   * uuid      = foto generada para ese campo específico (campo_id en DB).
   */
  campoId?: string
}

export interface RegistrarMisionParams {
  campanaId: string
  comercioId: string
  deviceId: string
  lat: number
  lng: number
  puntosTotal: number
  fotos: FotoMisionInput[]
  /** Respuestas de campos no-foto (para misiones GPS-only o bloques sin foto) */
  respuestasDirectas?: { campo_id: string; valor: unknown }[]
}

export async function registrarMision(params: RegistrarMisionParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // ── LOG DE ENTRADA ────────────────────────────────────────────────────────
  console.log('[registrarMision] START', {
    campanaId:  params.campanaId,
    comercioId: params.comercioId,
    userId:     user.id,
    fotoCount:  params.fotos.length,
    puntosTotal: params.puntosTotal,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db0 = supabase as any

  // Verificar que la campaña existe y está activa
  const { data: campana, error: campanaErr } = await db0
    .from('campanas')
    .select('id, estado, nombre, max_comercios_por_gondolero, tope_total_comercios, comercios_relevados, distri_id, marca_id, min_comercios_para_cobrar')
    .eq('id', params.campanaId)
    .single()

  if (campanaErr || !campana) {
    throw new Error('La campaña no existe.')
  }
  if (campana.estado !== 'activa') {
    throw new Error('La campaña no está activa.')
  }

  // Admin client para tablas con RLS restringida a service_role.
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  // Verificar que el gondolero no superó el máximo de comercios permitido.
  // Las descartadas no cuentan: el gondolero no completó esa misión, así que
  // le queda el cupo libre para hacer otra en su lugar.
  if (campana.max_comercios_por_gondolero) {
    const { count } = await db
      .from('misiones')
      .select('id', { count: 'exact', head: true })
      .eq('campana_id', params.campanaId)
      .eq('gondolero_id', user.id)
      .neq('estado', 'descartada')

    if ((count ?? 0) >= campana.max_comercios_por_gondolero) {
      throw new Error(`Ya completaste el máximo de ${campana.max_comercios_por_gondolero} comercios en esta campaña.`)
    }
  }

  // 1. Crear la misión
  const { data: mision, error: misionError } = await db
    .from('misiones')
    .insert({
      campana_id:   params.campanaId,
      comercio_id:  params.comercioId,
      gondolero_id: user.id,
      estado:       'pendiente',
      puntos_total: params.puntosTotal,
      bounty_estado: 'retenido',
    })
    .select('id')
    .single()

  if (misionError) {
    throw new Error('No pudimos crear la misión: ' + misionError.message)
  }

  // Puntos distribuidos solo entre fotos de bloque (campoId === undefined).
  // Las fotos de campo siempre tienen puntos_otorgados = 0.
  const fotosBloque = params.fotos.filter(f => !f.campoId)
  const puntosPorFoto = fotosBloque.length > 0
    ? Math.round(params.puntosTotal / fotosBloque.length)
    : 0

  // 2. Insertar fotos vinculadas a la misión
  for (const foto of params.fotos) {
    const { data: fotoData, error: fotoError } = await db
      .from('fotos')
      .insert({
        campana_id:            params.campanaId,
        bloque_id:             foto.bloqueId,
        gondolero_id:          user.id,
        comercio_id:           params.comercioId,
        mision_id:             mision.id,
        url:                   foto.url,
        storage_path:          foto.storagePath,
        lat:                   params.lat,
        lng:                   params.lng,
        timestamp_dispositivo: foto.timestampDispositivo,
        device_id:             params.deviceId,
        precio_confirmado:     foto.precioConfirmado,
        blur_score:            foto.blurScore ?? null,
        estado:                'pendiente',
        // Fotos de campo: puntos 0 (los puntos van sobre la foto del bloque).
        puntos_otorgados:      foto.campoId ? 0 : puntosPorFoto,
        // Nueva columna: null para foto del bloque, uuid para foto de campo.
        campo_id:              foto.campoId ?? null,
      })
      .select('id')
      .single()

    if (fotoError) {
      throw new Error('Error al guardar foto en la misión: ' + fotoError.message)
    }

    // Respuestas de formulario: solo para fotos de bloque.
    // Las fotos de campo no generan foto_respuestas — son su propia fila en fotos.
    if (!foto.campoId && foto.respuestas.length > 0) {
      await db.from('foto_respuestas').insert(
        foto.respuestas.map(r => ({
          foto_id:  fotoData.id,
          campo_id: r.campo_id,
          valor:    r.valor,
        }))
      )
    }
  }

  // 3. Guardar respuestas directas (campos no-foto) en mision_respuestas
  if (params.respuestasDirectas && params.respuestasDirectas.length > 0) {
    const { error: errResp } = await db.from('mision_respuestas').insert(
      params.respuestasDirectas.map(r => ({
        mision_id: mision.id,
        campo_id:  r.campo_id,
        valor:     r.valor,
      }))
    )
    if (errResp) console.error('[registrarMision] Error insertando mision_respuestas:', errResp.message)
  }

  // 4. Misiones sin fotos (survey-only): aprobar inmediatamente.
  //    No hay fotos que moderar; la misión se completa en el acto.
  if (params.fotos.length === 0) {
    await resolverMisionDirecta({
      misionId:      mision.id,
      gondoleroId:   user.id,
      campanaId:     params.campanaId,
      minParaCobrar: campana.min_comercios_para_cobrar ?? 1,
      admin,
    })
  }
  // Para misiones con fotos: bounty_estado='retenido' hasta aprobación de fotos.
  // Los puntos se acreditan en actualizarEstadoMision cuando todas las fotos
  // están aprobadas Y el gondolero alcanzó el mínimo de misiones para cobrar.

  // 5. Incrementar comercios_relevados y verificar tope global (no bloquea el flujo)
  try {
    const nuevoRelevados = (campana.comercios_relevados ?? 0) + 1
    const { error: updErr } = await db
      .from('campanas')
      .update({ comercios_relevados: nuevoRelevados })
      .eq('id', params.campanaId)
    if (updErr) {
      console.error('[registrarMision] Error incrementando comercios_relevados:', updErr.message)
    } else if (
      campana.tope_total_comercios != null &&
      nuevoRelevados >= campana.tope_total_comercios
    ) {
      // Cerrar la campaña automáticamente
      const { error: closeErr } = await db
        .from('campanas')
        .update({ estado: 'cerrada' })
        .eq('id', params.campanaId)
      if (closeErr) {
        console.error('[registrarMision] Error cerrando campaña por tope:', closeErr.message)
      } else {
        console.log('[registrarMision] Campaña cerrada por tope global:', params.campanaId)
        // Notificar al admin
        await crearNotificacionAdmin({
          tipo:        'campana_cerrada_por_tope',
          titulo:      'Campaña cerrada automáticamente',
          mensaje:     `La campaña "${campana.nombre ?? params.campanaId}" alcanzó el tope de ${campana.tope_total_comercios} comercios y fue cerrada.`,
          campanaId:   params.campanaId,
          linkDestino: `/admin/campanas/${params.campanaId}`,
        })
        // Notificar a la marca (si aplica)
        if (campana.marca_id) {
          await crearNotificacionMarca(campana.marca_id, {
            tipo:        'campana_cerrada_por_tope',
            titulo:      'Campaña completada',
            mensaje:     `La campaña "${campana.nombre ?? params.campanaId}" alcanzó su cupo máximo de ${campana.tope_total_comercios} comercios y fue cerrada automáticamente.`,
            campanaId:   params.campanaId,
            linkDestino: `/marca/campanas/${params.campanaId}/detalle`,
          })
        }
        // Notificar a la distri (si aplica)
        if (campana.distri_id) {
          await crearNotificacionDistri(campana.distri_id, {
            tipo:        'campana_cerrada_por_tope',
            titulo:      'Campaña completada',
            mensaje:     `La campaña "${campana.nombre ?? params.campanaId}" alcanzó su cupo máximo de ${campana.tope_total_comercios} comercios y fue cerrada automáticamente.`,
            campanaId:   params.campanaId,
            linkDestino: `/distribuidora/campanas/${params.campanaId}/detalle`,
          })
        }
      }
    }
  } catch (topeError) {
    console.error('[registrarMision] Error en lógica de tope global:', topeError)
  }

  // 6. Notificar a la distribuidora del gondolero y a la marca de la campaña (no bloquea el flujo)
  let gondoleroDistriId: string | null = null
  try {
    // Obtener en paralelo: perfil completo del gondolero + datos de la campaña
    const [
      { data: gondoleroProfile, error: profileError },
      { data: campanaData, error: campanaError },
    ] = await Promise.all([
      db.from('profiles').select('distri_id, tipo_actor, nombre').eq('id', user.id).single(),
      db.from('campanas').select('marca_id, distri_id, nombre, estado').eq('id', params.campanaId).single(),
    ])
    gondoleroDistriId = gondoleroProfile?.distri_id ?? null

    if (profileError) console.error('[registrarMision] error al leer profile del gondolero:', profileError.message)
    if (campanaError) console.error('[registrarMision] error al leer campaña:', campanaError.message)

    console.log('[registrarMision] gondoleroProfile completo:', JSON.stringify(gondoleroProfile))
    console.log('[registrarMision] campanaData completo:', JSON.stringify(campanaData))

    // Notificar a la distribuidora del gondolero (no a la de la campaña)
    const distriId: string | null = gondoleroProfile?.distri_id ?? null
    console.log('[registrarMision] distri_id del gondolero:', distriId, '— tipo:', typeof distriId)
    if (!distriId) {
      console.warn('[registrarMision] gondolero sin distri_id vinculado — omitiendo notif distribuidora. userId:', user.id)
    } else {
      const yaNotifDistri = await existeNotifReciente(
        distriId, 'distribuidora', 'gondolero_completo_mision', params.campanaId
      )
      console.log('[registrarMision] yaNotifDistri:', yaNotifDistri)
      if (!yaNotifDistri) {
        const { error: errDistri } = await crearNotificacionDistri(distriId, {
          tipo:        'gondolero_completo_mision',
          titulo:      'Gondolero completó una misión',
          mensaje:     `Se recibió una misión de "${campanaData?.nombre ?? 'la campaña'}".`,
          campanaId:   params.campanaId,
          linkDestino: `/distribuidora/campanas/${params.campanaId}/resultados`,
        })
        if (errDistri) {
          console.error('[registrarMision] notif distri FALLÓ:', errDistri)
        } else {
          console.log('[registrarMision] notif distri creada OK')
        }
      }
    }

    // Notificar a la marca de la campaña
    const marcaId = campanaData?.marca_id ?? null
    console.log('[registrarMision] marcaId para notif:', marcaId)
    if (marcaId) {
      const yaNotifMarca = await existeNotifReciente(
        marcaId, 'marca', 'nueva_mision_recibida', params.campanaId
      )
      console.log('[registrarMision] yaNotifMarca:', yaNotifMarca)
      if (!yaNotifMarca) {
        const { error: errMarca } = await crearNotificacionMarca(marcaId, {
          tipo:        'nueva_mision_recibida',
          titulo:      'Nueva misión recibida',
          mensaje:     `Hay una nueva misión de "${campanaData?.nombre ?? 'la campaña'}" pendiente de revisión.`,
          campanaId:   params.campanaId,
          linkDestino: `/marca/campanas/${params.campanaId}/resultados`,
        })
        if (errMarca) {
          console.error('[registrarMision] notif marca FALLÓ:', errMarca)
        } else {
          console.log('[registrarMision] notif marca creada OK')
        }
      }
    }
  } catch (notifError) {
    // Las notificaciones no deben romper el flujo principal
    console.error('[registrarMision] Error al enviar notificaciones:', notifError)
  }

  // 7. Registrar checks GPS silenciosos para validación de comercios pendientes.
  // Se ejecuta con las coordenadas del comercio visitado (leídas de la DB),
  // así los logs son visibles en Vercel en lugar de en el browser.
  try {
    const { data: comercioCoords } = await db
      .from('comercios')
      .select('lat, lng')
      .eq('id', params.comercioId)
      .maybeSingle() as { data: { lat: number; lng: number } | null }

    const checkLat = comercioCoords?.lat ?? params.lat
    const checkLng = comercioCoords?.lng ?? params.lng

    console.log('[registrarMision] iniciando checks GPS', {
      comercioId: params.comercioId,
      lat: checkLat,
      lng: checkLng,
      gondoleroDistriId,
    })

    await registrarChecksGPSInterno({
      lat:               checkLat,
      lng:               checkLng,
      userId:            user.id,
      gondoleroDistriId: gondoleroDistriId,
      admin:             db,
    })

    console.log('[registrarMision] checks GPS completados OK')
  } catch (checksErr) {
    console.error('[registrarMision] Error en checks GPS:', checksErr)
  }

  return { misionId: mision.id, puntos: params.puntosTotal }
}

// ── RECAPTURA DE FOTOS RECHAZADAS ─────────────────────────────────────────────

export interface FotoRecapturaInput {
  /** Foto rechazada que se está rehaciendo */
  fotoOriginalId: string
  storagePath: string
  url: string
  timestampDispositivo: string
  blurScore: number | null
}

export interface RegistrarRecapturaParams {
  misionId: string
  deviceId: string
  lat: number
  lng: number
  fotos: FotoRecapturaInput[]
}

/**
 * Registra la recaptura de fotos rechazadas SOBRE LA MISIÓN EXISTENTE.
 *
 * Por qué no reusa registrarMision: esa función crea una misión nueva, suma al
 * contador de comercios relevados de la campaña y consume una unidad del
 * máximo de comercios por gondolero. Una recaptura no es una visita nueva —
 * es la misma misión con una foto rehecha. Usando registrarMision, rehacer una
 * foto inflaba comercios_relevados y dejaba la misión vieja intacta con su
 * foto rechazada, así que el aviso de "tenés fotos para rehacer" nunca se
 * apagaba y el retake se podía repetir sin límite.
 *
 * Qué hace: inserta la foto nueva en la misma misión y marca la vieja con
 * reemplazada_por. La vieja conserva estado='rechazada' y su motivo — el
 * rastro queda para auditar.
 */
export async function registrarRecaptura(params: RegistrarRecapturaParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  if (params.fotos.length === 0) throw new Error('No hay fotos para recapturar.')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  // 1. La misión tiene que ser del gondolero que está enviando
  const { data: mision, error: misionErr } = await db
    .from('misiones')
    .select('id, campana_id, comercio_id, gondolero_id')
    .eq('id', params.misionId)
    .single()

  if (misionErr || !mision) throw new Error('No encontramos la misión a rehacer.')
  if (mision.gondolero_id !== user.id) throw new Error('Esta misión no es tuya.')

  // 2. GPS contra el comercio de la misión.
  //
  // Sin esto la recaptura era el único camino de la app que guardaba una foto
  // sin ubicación: el flujo de retake saltea el paso de GPS, así que las
  // coordenadas llegaban en 0,0 y la foto quedaba sin evidencia de dónde se
  // sacó. Es exactamente el agujero que permitiría forzar un rechazo para
  // después rehacer la foto desde cualquier lado.
  const { data: comercio } = await db
    .from('comercios')
    .select('lat, lng')
    .eq('id', mision.comercio_id)
    .maybeSingle()

  // El control es BLANDO A PROPÓSITO, igual que la captura normal: se exige
  // que haya un fix de GPS, no que esté dentro del radio. Decidido el 9/9/2026.
  //
  // Por qué no bloquear por distancia: la recaptura no puede ser más estricta
  // que la captura original. Con un radio chico o un GPS de teléfono impreciso
  // se bloquea a gondoleros honestos, que es un costo real; el fraude, en
  // cambio, ya queda registrado, porque ahora la foto guarda lat/lng de verdad
  // y la foto rechazada que reemplaza sigue en la base con las suyas. Las dos
  // coordenadas y los dos timestamps se pueden comparar cuando haga falta.
  //
  // Si alguna vez se endurece, tiene que endurecerse el flujo normal primero.
  const sinFix = !Number.isFinite(params.lat) || !Number.isFinite(params.lng)
    || (params.lat === 0 && params.lng === 0)
  if (sinFix) {
    throw new Error('Necesitamos tu ubicación para rehacer la foto. Activá el GPS e intentá de nuevo.')
  }

  const distanciaMetros = comercio?.lat != null && comercio?.lng != null
    ? Math.round(calcularDistanciaMetros(params.lat, params.lng, comercio.lat, comercio.lng))
    : null

  console.log('[registrarRecaptura] GPS', {
    misionId: params.misionId,
    comercioId: mision.comercio_id,
    distanciaMetros,
    radio: RADIO_GPS_METROS,
    dentroDelRadio: distanciaMetros != null ? distanciaMetros <= RADIO_GPS_METROS : null,
  })

  // 3. Insertar cada foto nueva y marcar la vieja como reemplazada
  let recapturadas = 0
  for (const foto of params.fotos) {
    const { data: original } = await db
      .from('fotos')
      .select('id, campana_id, bloque_id, campo_id, comercio_id, mision_id, estado, reemplazada_por, puntos_otorgados')
      .eq('id', foto.fotoOriginalId)
      .maybeSingle()

    // Guardas: la foto tiene que ser de esta misión, estar rechazada y no
    // haber sido reemplazada ya. Sin la última, tocar "Retomar" dos veces
    // encadenaba recapturas sobre la misma foto.
    if (!original) throw new Error('No encontramos la foto a rehacer.')
    if (original.mision_id !== params.misionId) throw new Error('Esa foto no pertenece a la misión.')
    if (original.estado !== 'rechazada') throw new Error('Esa foto no está rechazada.')
    if (original.reemplazada_por) throw new Error('Esa foto ya fue rehecha.')

    const { data: nueva, error: insErr } = await db
      .from('fotos')
      .insert({
        campana_id:            original.campana_id,
        bloque_id:             original.bloque_id,
        campo_id:              original.campo_id,
        comercio_id:           original.comercio_id,
        mision_id:             original.mision_id,
        gondolero_id:          user.id,
        url:                   foto.url,
        storage_path:          foto.storagePath,
        lat:                   params.lat,
        lng:                   params.lng,
        timestamp_dispositivo: foto.timestampDispositivo,
        device_id:             params.deviceId,
        blur_score:            foto.blurScore,
        estado:                'pendiente',
        // Hereda los puntos de la foto que reemplaza: el bounty de la misión
        // no cambia porque una foto se haya rehecho.
        puntos_otorgados:      original.puntos_otorgados ?? 0,
      })
      .select('id')
      .single()

    if (insErr || !nueva) throw new Error('Error al guardar la foto rehecha: ' + (insErr?.message ?? ''))

    const { error: updErr } = await db
      .from('fotos')
      .update({ reemplazada_por: nueva.id })
      .eq('id', original.id)

    if (updErr) throw new Error('Error al vincular la foto rehecha: ' + updErr.message)
    recapturadas++
  }

  // 4. Puede pasar que la recaptura destrabe la misión: si las demás fotos ya
  //    estaban aprobadas y esta era la única rechazada, la misión sigue
  //    pendiente hasta que se apruebe la nueva. No hay nada que resolver acá.
  console.log('[registrarRecaptura] OK', { misionId: params.misionId, recapturadas })

  return { misionId: params.misionId, recapturadas }
}

/**
 * Descarta la recaptura pendiente de una misión: la cierra sin acreditar.
 *
 * Por qué existe: el gondolero se entera del rechazo horas o días después,
 * cuando ya se fue del comercio. Sin una salida, la foto rechazada queda para
 * siempre y el aviso se vuelve ruido — y un gondolero que aprende a ignorar
 * ese aviso va a ignorar el próximo que sí importa.
 *
 * Qué implica, según la regla definida:
 *   - La misión queda 'descartada': cerrada, ni pendiente ni en limbo.
 *   - No acredita puntos. bounty_estado='anulado' en la misión y en sus fotos.
 *   - No cuenta para el mínimo para cobrar ni para el máximo por gondolero
 *     (eso lo resuelven los filtros en las consultas, ver registrarMision).
 *   - comercios_relevados baja en uno: una misión descartada no es un comercio
 *     relevado.
 *   - No se borra nada. Las fotos aprobadas y las respuestas del formulario
 *     siguen visibles para la marca, y el check GPS del comercio se conserva:
 *     es evidencia de que el gondolero estuvo ahí, y eso pasó igual.
 */
export async function descartarRecaptura(misionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const { data: mision, error: misionErr } = await db
    .from('misiones')
    .select('id, campana_id, comercio_id, gondolero_id, estado')
    .eq('id', misionId)
    .single()

  if (misionErr || !mision) throw new Error('No encontramos la misión.')
  if (mision.gondolero_id !== user.id) throw new Error('Esta misión no es tuya.')
  // Idempotente: descartar dos veces no vuelve a restar comercios_relevados.
  if (mision.estado === 'descartada') return { ok: true, yaEstaba: true }
  if (mision.estado === 'aprobada') throw new Error('La misión ya está aprobada.')

  // 1. Cerrar sin acreditar.
  //    El 'anulado' no es cosmético: aprobarMisionCore libera el bounty con un
  //    UPDATE sobre TODAS las misiones del gondolero en la campaña que estén en
  //    'retenido'. Si la descartada quedara retenida, se le pagaría igual al
  //    alcanzar el mínimo con otras misiones.
  const { error: updErr } = await db
    .from('misiones')
    .update({ estado: 'descartada', bounty_estado: 'anulado' })
    .eq('id', misionId)

  if (updErr) throw new Error('No pudimos descartar la misión: ' + updErr.message)

  // 2. Anular el bounty de las fotos de la misión. Ninguna generó puntos.
  await db
    .from('fotos')
    .update({ bounty_estado: 'anulado' })
    .eq('mision_id', misionId)

  // 3. Descontar el comercio relevado.
  const { data: campana } = await db
    .from('campanas')
    .select('comercios_relevados')
    .eq('id', mision.campana_id)
    .maybeSingle()

  if (campana) {
    await db
      .from('campanas')
      .update({ comercios_relevados: Math.max(0, (campana.comercios_relevados ?? 0) - 1) })
      .eq('id', mision.campana_id)
  }

  console.log('[descartarRecaptura] OK', { misionId, campanaId: mision.campana_id })

  revalidatePath('/gondolero/campanas')
  revalidatePath(`/gondolero/campanas/${mision.campana_id}`)
  return { ok: true, yaEstaba: false }
}

// Devuelve el id de un bloque existente para la campaña, o crea uno genérico si no hay ninguno.
// Usa el admin client para evitar restricciones RLS al insertar — solo se ejecuta en el servidor.
export async function asegurarBloqueGenerico(campanaId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Cliente directo con service_role — bypasea RLS.
  // createServerClient de @supabase/ssr NO bypasea RLS; se necesita el cliente base.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ) as any

  const { data: bloques } = await db
    .from('bloques_foto')
    .select('id')
    .eq('campana_id', campanaId)
    .limit(1)

  if (bloques && bloques.length > 0) return bloques[0].id

  // No hay bloques — crear uno genérico para el MVP
  const { data: nuevo, error } = await db
    .from('bloques_foto')
    .insert({
      campana_id:     campanaId,
      orden:          1,
      instruccion:    'Fotografiá la góndola completa',
      tipo_contenido: 'ambos',
    })
    .select('id')
    .single()

  if (error) throw new Error('No se pudo configurar el bloque: ' + error.message)
  return nuevo.id
}

/**
 * Devuelve los campos mínimos de una misión para el flujo de retake.
 * Usa adminClient y valida que la misión pertenezca al usuario antes de
 * devolver cualquier dato — si no es suya, retorna null.
 * Esta server action reemplaza la query directa al browser client en captura/page.tsx.
 */
export async function getMisionParaRetake(
  misionId: string
): Promise<{ id: string; estado: string; puntos_total: number } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data } = await (admin as any)
    .from('misiones')
    .select('id, estado, puntos_total, gondolero_id')
    .eq('id', misionId)
    .maybeSingle()

  if (!data) return null
  // Validar propiedad: no devolver nada si la misión no es del usuario.
  if (data.gondolero_id !== user.id) return null

  return { id: data.id, estado: data.estado, puntos_total: data.puntos_total }
}
