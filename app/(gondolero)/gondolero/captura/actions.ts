'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { getConfigCompresion, type ConfigCompresion } from '@/lib/config'
import {
  crearNotificacionDistri,
  crearNotificacionMarca,
  existeNotifReciente,
} from '@/lib/notificaciones'

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

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
    .select('id, estado, max_comercios_por_gondolero')
    .eq('id', params.campanaId)
    .single()

  if (campanaErr || !campana) {
    throw new Error('La campaña no existe.')
  }
  if (campana.estado !== 'activa') {
    throw new Error('La campaña no está activa.')
  }

  // Verificar que el gondolero no superó el máximo de comercios permitido
  if (campana.max_comercios_por_gondolero) {
    const { count } = await db0
      .from('misiones')
      .select('id', { count: 'exact', head: true })
      .eq('campana_id', params.campanaId)
      .eq('gondolero_id', user.id)

    if ((count ?? 0) >= campana.max_comercios_por_gondolero) {
      throw new Error(`Ya completaste el máximo de ${campana.max_comercios_por_gondolero} comercios en esta campaña.`)
    }
  }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

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

  const puntosPorFoto = params.fotos.length > 0
    ? Math.round(params.puntosTotal / params.fotos.length)
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
        puntos_otorgados:      puntosPorFoto,
      })
      .select('id')
      .single()

    if (fotoError) {
      throw new Error('Error al guardar foto en la misión: ' + fotoError.message)
    }

    if (foto.respuestas.length > 0) {
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

  // 4. NO acreditar puntos aquí — bounty_estado='retenido' hasta aprobación.
  // Los puntos se acreditan en actualizarEstadoMision cuando todas las fotos
  // están aprobadas Y el gondolero alcanzó el mínimo de misiones para cobrar.

  // 4. Notificar a la distribuidora del gondolero y a la marca de la campaña (no bloquea el flujo)
  try {
    // Obtener en paralelo: perfil completo del gondolero + datos de la campaña
    const [
      { data: gondoleroProfile, error: profileError },
      { data: campanaData, error: campanaError },
    ] = await Promise.all([
      db.from('profiles').select('distri_id, tipo_actor, nombre').eq('id', user.id).single(),
      db.from('campanas').select('marca_id, distri_id, nombre, estado').eq('id', params.campanaId).single(),
    ])

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

  return { misionId: mision.id, puntos: params.puntosTotal }
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
