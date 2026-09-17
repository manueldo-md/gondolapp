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
import { sincronizarComerciosRelevados } from '@/lib/comercios-relevados'
import { puedeRegistrarMision } from '@/lib/campana-vigencia'
import type { CodigoRechazoMision } from '@/lib/rechazo-mision'
import { calcularDistanciaMetros } from '@/lib/utils'

// Los radios viven en lib/gps-radios.ts: el de bloqueo lo usan también el paso
// de GPS del cliente y la resolución de reportes del panel de la distribuidora,
// y tienen que coincidir sí o sí.
import { RADIO_AVISO_METROS as RADIO_GPS_METROS, RADIO_BLOQUEO_METROS } from '@/lib/gps-radios'

export async function obtenerConfigCompresion(): Promise<ConfigCompresion> {
  return getConfigCompresion()
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
  /**
   * Respuestas de campos no-foto (para misiones GPS-only o bloques sin foto).
   * bloqueId permite anclar foto_id cuando el bloque tiene exactamente una foto.
   */
  respuestasDirectas?: { campo_id: string; valor: unknown; bloqueId?: string | null }[]
  /**
   * true = la misión viene de la cola offline, no de un envío en vivo.
   *
   * EXPLÍCITO Y NO DEDUCIDO: el servidor no puede distinguirlo de otra forma
   * —el camino online también guarda en IDB y también manda idempotenciaKey— y
   * apoyar un control en el timestamp del dispositivo sería una heurística.
   *
   * Cambia el trato del bloqueo por distancia: en vivo se rechaza, desde la cola
   * se registra y se marca. El motivo está en el chequeo, más abajo.
   */
  desdeCola?: boolean
  /**
   * Epoch ms de cuándo el gondolero CAPTURÓ la misión, no de cuándo llegó.
   *
   * Para envíos en vivo es ~ahora; para los de la cola es `guardadaAt` de la
   * entry de IDB. Lo usa el gate de vencimiento: quien capturó dentro del plazo
   * y sincronizó después hizo el trabajo en plazo, y rechazarlo sería el mismo
   * castigo tardío que ya sacamos del bloqueo por distancia.
   *
   * Hace falta como campo propio porque una misión de solo preguntas no tiene
   * fotos, y el único timestamp de dispositivo del payload vive dentro de ellas.
   */
  capturadoAt?: number
  /**
   * UUID generado en el cliente al guardar la misión en IDB offline.
   * Garantiza idempotencia: si el envío se reintenta (fallo de red + app reabierta),
   * el servidor devuelve la misión ya registrada sin crear un duplicado.
   * undefined para misiones enviadas sin pasar por la cola offline.
   */
  idempotenciaKey?: string
}

/**
 * Resultado de registrarMision.
 *
 * ── POR QUÉ DEVUELVE EL RECHAZO EN VEZ DE LANZARLO ──────────────────────────
 * Esto es un Server Action, y **Next.js redacta el mensaje de toda excepción no
 * atrapada en producción**: al cliente le llega "An error occurred in the Server
 * Components render" y el texto real queda solo en los logs de Vercel. O sea que
 * hasta el 17/9/2026 ninguno de los seis mensajes cuidados de esta función era
 * legible para el gondolero.
 *
 * Donde más dolía era la cola offline: guarda el mensaje como `motivoRechazo` en
 * IndexedDB y se lo muestra al gondolero con los botones Reintentar y Descartar.
 * Tenía que decidir entre los dos leyendo el error de Next.
 *
 * Un valor devuelto NO se redacta. Por eso:
 *   · rechazo de NEGOCIO (terminal, el gondolero puede entenderlo) → se devuelve
 *   · error de INFRAESTRUCTURA (transitorio, se reintenta)          → se lanza
 *
 * La distinción es la que usan los dos llamadores para decidir si la misión se
 * marca rechazada o se deja pendiente para reintentar. Cambiar uno sin el otro
 * rompe la cola: si deja de lanzar y el llamador sigue esperando la excepción,
 * toma el rechazo como éxito y borra la misión de IDB.
 *
 * ── EL CÓDIGO, ADEMÁS DEL MOTIVO (18/9/2026) ────────────────────────────────
 * `motivo` es para que el gondolero LEA. `codigo` es para que el cliente DECIDA
 * —hoy, si ofrecer "Reintentar" y si la misión vence a los 7 días.
 *
 * Están separados porque el texto se va a seguir editando y el código no. Con
 * solo el texto, la cola tendría que matchearlo para clasificar el rechazo, y
 * la primera vez que alguien mejore un mensaje el botón de Reintentar reaparece
 * donde no debe sin que nada falle visiblemente. Ver lib/rechazo-mision.ts.
 *
 * **Agregar un `return { ok: false }` nuevo obliga a elegir un código**: el tipo
 * no compila sin él, y `rechazoEsDefinitivo` tiene un case por cada uno.
 */
export type ResultadoMision =
  | { ok: true;  misionId: string; puntos: number }
  | { ok: false; codigo: CodigoRechazoMision; motivo: string }

export async function registrarMision(params: RegistrarMisionParams): Promise<ResultadoMision> {
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
    .select('id, estado, nombre, fecha_fin, max_comercios_por_gondolero, tope_total_comercios, comercios_relevados, distri_id, marca_id, min_comercios_para_cobrar')
    .eq('id', params.campanaId)
    .single()

  // Los dos casos se separan a propósito: hasta el 17/9/2026 eran un solo
  // `if (campanaErr || !campana)`.
  //
  // `campanaErr` es que FALLÓ LA QUERY — un blip de Postgres, un timeout. Si
  // eso devolviera un rechazo, la cola marcaría la misión como rechazada para
  // siempre por un error de un segundo. Se lanza, para que se reintente.
  if (campanaErr) {
    throw new Error('No pudimos leer la campaña: ' + campanaErr.message)
  }
  // `!campana` es que la campaña realmente no está. Terminal: reintentar no la
  // va a hacer aparecer.
  if (!campana) {
    return { ok: false, codigo: 'campana_inexistente', motivo: 'Esta campaña ya no existe. Elegí otra de la lista de campañas disponibles.' }
  }
  if (campana.estado !== 'activa') {
    return { ok: false, codigo: 'campana_no_activa', motivo: 'Esta campaña ya no está activa y no acepta misiones nuevas.' }
  }

  // ── Gate de vencimiento ─────────────────────────────────────────────────────
  // Hasta el 16/9/2026 esto no se chequeaba: `estado` es administrativo y nada
  // lo cierra por fecha, así que un gondolero podía relevar hoy para una campaña
  // vencida en abril y cobrar.
  //
  // Se juzga por el momento de CAPTURA y no por el de llegada: quien capturó el
  // último día válido y sincronizó dos días después hizo el trabajo en plazo.
  // Rechazarlo sería el mismo castigo tardío que ya sacamos del bloqueo por
  // distancia y del rechazo por comercio duplicado.
  const vigencia = puedeRegistrarMision({
    fechaFin:    campana.fecha_fin,
    capturadoAt: params.capturadoAt,
  })
  if (!vigencia.ok) {
    console.warn('[registrarMision] rechazada por vigencia', {
      campanaId: params.campanaId,
      fechaFin: campana.fecha_fin,
      capturadoAt: params.capturadoAt,
      desdeCola: params.desdeCola ?? false,
      motivo: vigencia.motivo,
    })
    return vigencia.motivo === 'vencida'
      ? {
          ok: false,
          codigo: 'campana_vencida',
          motivo: `Esta campaña terminó el ${campana.fecha_fin} y ya no acepta misiones. Fijate en las campañas disponibles si hay otra activa.`,
        }
      : {
          ok: false,
          codigo: 'captura_muy_vieja',
          motivo: 'Esta misión quedó demasiado tiempo sin enviarse y la campaña ya terminó. No se puede registrar.',
        }
  }

  // Admin client para tablas con RLS restringida a service_role.
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  // ── IDEMPOTENCIA OFFLINE ────────────────────────────────────────────────────
  // Si la misión viajó con una clave de idempotencia (guardada en IDB offline),
  // verificar si ya fue registrada antes de crear una nueva.
  // Escenario: el envío llegó al servidor pero la app murió antes de borrar de IDB
  // → al reintentar, esta guarda evita crear una misión duplicada.
  if (params.idempotenciaKey) {
    const { data: existente } = await db
      .from('misiones')
      .select('id, puntos_total')
      .eq('idempotencia_key', params.idempotenciaKey)
      .maybeSingle()

    if (existente) {
      console.log('[registrarMision] reintento idempotente — devolviendo misión existente:', existente.id)
      return { ok: true, misionId: existente.id, puntos: existente.puntos_total ?? params.puntosTotal }
    }
  }

  // Verificar que el gondolero no superó el máximo de COMERCIOS permitido.
  //
  // Comercios DISTINTOS, no misiones. Hasta el 17/9/2026 contaba misiones, y en
  // una campaña de seguimiento eso bloquea a la primera semana: 15 comercios ×
  // 3 visitas = 45 misiones contra un tope de 20. El repositor quedaba afuera el
  // miércoles, con un mensaje que le decía que había completado 20 comercios
  // cuando había hecho 7.
  //
  // En puntual no cambia nada: el índice único misiones_campana_comercio_uniq
  // garantiza una misión viva por comercio, así que los dos números coinciden.
  //
  // Las descartadas no cuentan: el gondolero no completó esa misión, así que le
  // queda el cupo libre para hacer otra en su lugar. El filtro va en JS y no en
  // la query: `.neq('estado','descartada')` de PostgREST descarta también las
  // filas con estado NULL —lógica de tres valores— y misiones.estado es nullable
  // (DEFAULT 'pendiente' pero sin NOT NULL). El `!==` de JS sobre null da true y
  // las conserva. Mismo motivo que en lib/comercios-relevados.ts.
  if (campana.max_comercios_por_gondolero) {
    const { data: misionesPropias, error: errCupo } = await db
      .from('misiones')
      .select('comercio_id, estado')
      .eq('campana_id', params.campanaId)
      .eq('gondolero_id', user.id)

    if (errCupo) {
      console.error('[registrarMision] Error leyendo el cupo del gondolero:', errCupo.message)
    } else {
      const comerciosPropios = new Set(
        (misionesPropias ?? [])
          .filter((m: { estado: string | null }) => m.estado !== 'descartada')
          .map((m: { comercio_id: string | null }) => m.comercio_id)
          .filter(Boolean)
      )
      // El comercio que se está relevando ahora solo ocupa cupo si es NUEVO para
      // este gondolero. En seguimiento, volver a uno que ya visitó no consume
      // nada: es exactamente lo que la campaña le pide hacer.
      const esComercioNuevo = !comerciosPropios.has(params.comercioId)
      if (esComercioNuevo && comerciosPropios.size >= campana.max_comercios_por_gondolero) {
        return {
          ok: false,
          codigo: 'cupo_propio_lleno',
          motivo:
            `Ya tenés ${comerciosPropios.size} comercios en esta campaña, que es el máximo. ` +
            `Podés seguir trabajando en los que ya tomaste.`,
        }
      }
    }
  }

  // ── Distancia al comercio ───────────────────────────────────────────────────
  // Se calcula acá, en el servidor, y no se confía en nada que mande el cliente.
  // Hasta el 15/9/2026 no se calculaba en ningún lado: el paso de GPS la mostraba
  // en pantalla y la tiraba, así que una misión hecha a 1,5 km entraba idéntica a
  // una hecha en la puerta y el que aprobaba no tenía ninguna señal.
  const { data: comercioCoords } = await db
    .from('comercios')
    .select('lat, lng')
    .eq('id', params.comercioId)
    .maybeSingle() as { data: { lat: number | null; lng: number | null } | null }

  const distanciaMetros: number | null =
    comercioCoords?.lat != null && comercioCoords?.lng != null &&
    Number.isFinite(params.lat) && Number.isFinite(params.lng) &&
    !(params.lat === 0 && params.lng === 0)
      ? Math.round(calcularDistanciaMetros(params.lat, params.lng, comercioCoords.lat, comercioCoords.lng))
      : null

  // El bloqueo trata distinto al envío en vivo y al que viene de la cola, y la
  // razón no es de implementación sino de justicia con el gondolero.
  //
  // Los dos validan contra datos distintos: el cliente comparó contra las
  // coordenadas que tenía CACHEADAS al capturar; el servidor compara contra las
  // ACTUALES. Si entre una cosa y la otra alguien corrige el pin del comercio
  // —que es exactamente lo que vamos a hacer con los comercios mal ubicados— una
  // misión que el gondolero hizo bien, parado en la puerta, pasaría a dar 400
  // metros y se rechazaría sola horas después.
  //
  // Eso es el mismo modo de falla que veníamos sacando del sistema: castigo
  // tardío por algo que la persona no podía saber. Así que desde la cola no se
  // rechaza: se registra la distancia y decide el que aprueba, que para eso
  // ahora la ve en el panel.
  if (distanciaMetros != null && distanciaMetros > RADIO_BLOQUEO_METROS) {
    if (!params.desdeCola) {
      return {
        ok: false,
        codigo: 'fuera_de_radio',
        motivo:
          `Estás a ${(distanciaMetros / 1000).toFixed(1)} km del comercio. ` +
          'Para registrar la misión tenés que estar en el comercio. ' +
          'Si el comercio está mal ubicado en el mapa, avisale a tu distribuidora.',
      }
    }
    console.warn('[registrarMision] misión de la cola fuera de radio — entra marcada', {
      comercioId: params.comercioId,
      gondoleroId: user.id,
      distanciaMetros,
      bloqueo: RADIO_BLOQUEO_METROS,
    })
  }

  // 1. Crear la misión
  const { data: mision, error: misionError } = await db
    .from('misiones')
    .insert({
      campana_id:       params.campanaId,
      comercio_id:      params.comercioId,
      gondolero_id:     user.id,
      estado:           'pendiente',
      puntos_total:     params.puntosTotal,
      bounty_estado:    'retenido',
      idempotencia_key: params.idempotenciaKey ?? null,
    })
    .select('id')
    .single()

  if (misionError) {
    // Choque contra misiones_campana_comercio_uniq: otro gondolero ya relevó
    // este comercio en esta campaña puntual. Pasa cuando dos trabajan sin señal
    // sobre el mismo comercio y sincronizan a la vez — el filtro de la lista de
    // comercios no puede verlo offline, así que el índice es la única red.
    //
    // Se filtra por NOMBRE DE ÍNDICE y no solo por código: misiones tiene otro
    // índice único (misiones_idempotencia_key_idx) que también da 23505, y ese
    // es un reintento idempotente, no un comercio duplicado. Sin el nombre, un
    // reintento le mostraría al gondolero un mensaje que no tiene nada que ver.
    const detalle = `${misionError.message ?? ''} ${misionError.details ?? ''}`
    if (misionError.code === '23505' && detalle.includes('misiones_campana_comercio_uniq')) {
      return {
        ok: false,
        codigo: 'comercio_duplicado',
        motivo:
          'Otro gondolero relevó este comercio antes que vos. Pasa cuando dos personas ' +
          'trabajan sin señal al mismo tiempo. Esta misión no se puede registrar. ' +
          'Elegí otro comercio de la lista.',
      }
    }
    throw new Error('No pudimos crear la misión: ' + misionError.message)
  }

  // Puntos distribuidos solo entre fotos de bloque (campoId === undefined).
  // Las fotos de campo siempre tienen puntos_otorgados = 0.
  const fotosBloque = params.fotos.filter(f => !f.campoId)
  const puntosPorFoto = fotosBloque.length > 0
    ? Math.round(params.puntosTotal / fotosBloque.length)
    : 0

  // 2. Insertar fotos vinculadas a la misión
  // Acumulamos bloqueId → fotoIds para poder anclar respuestasDirectas en el paso 3.
  const fotoIdsPorBloque = new Map<string, string[]>()

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
        distancia_metros:      distanciaMetros,
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

    // Acumular foto_id por bloque para anclar respuestasDirectas.
    if (foto.bloqueId) {
      if (!fotoIdsPorBloque.has(foto.bloqueId)) fotoIdsPorBloque.set(foto.bloqueId, [])
      fotoIdsPorBloque.get(foto.bloqueId)!.push(fotoData.id)
    }

    // Respuestas de formulario: solo para fotos de bloque.
    // Las fotos de campo no generan respuestas de este tipo — son su propia fila en fotos.
    // foto_id se guarda para preservar el vínculo foto↔respuesta en el lightbox del panel.
    if (!foto.campoId && foto.respuestas.length > 0) {
      await db.from('mision_respuestas').insert(
        foto.respuestas.map(r => ({
          mision_id: mision.id,
          foto_id:   fotoData.id,
          campo_id:  r.campo_id,
          valor:     r.valor,
        }))
      )
    }
  }

  // 3. Guardar respuestas directas (campos no-foto) en mision_respuestas.
  // Si el bloque tiene exactamente UNA foto, se ancla foto_id para que el
  // lightbox de resultados pueda mostrar la respuesta junto a esa foto.
  // Si tiene más de una (o ninguna), foto_id queda NULL — el lightbox no
  // muestra la respuesta, pero el dato existe y los stats son correctos.
  if (params.respuestasDirectas && params.respuestasDirectas.length > 0) {
    const rows = params.respuestasDirectas.map(r => {
      const fotoIds = r.bloqueId ? (fotoIdsPorBloque.get(r.bloqueId) ?? []) : []
      const foto_id = fotoIds.length === 1 ? fotoIds[0] : null
      return { mision_id: mision.id, campo_id: r.campo_id, valor: r.valor, foto_id }
    })
    const { error: errResp } = await db.from('mision_respuestas').insert(rows)
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

  // 5. Sincronizar comercios_relevados y verificar tope global (no bloquea el flujo)
  //
  // Recalcula en vez de sumar 1. El `+1` era correcto mientras un comercio no
  // pudiera tener dos misiones vivas, pero la modalidad 'seguimiento' —donde un
  // comercio se visita muchas veces a propósito— lo convierte en un contador de
  // VISITAS bajo un nombre que dice comercios. Ver lib/comercios-relevados.ts.
  try {
    const nuevoRelevados = await sincronizarComerciosRelevados(params.campanaId, db)
    if (nuevoRelevados === null) {
      console.error('[registrarMision] No se pudo sincronizar comercios_relevados')
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
  //
  // VA LA POSICIÓN DEL DISPOSITIVO, no la del comercio. Hasta el 15/9/2026 iba
  // `comercioCoords?.lat ?? params.lat`, y eso rompía las tres cosas que la
  // tabla existe para hacer:
  //
  //   · El filtro de 20m de registrarChecksGPSInterno SE AUTOCUMPLÍA: la
  //     distancia de un comercio a sí mismo es 0, así que el comercio destino
  //     recibía su check siempre, estuviera el gondolero en la puerta o a 1,5 km.
  //   · La fila guardaba las coordenadas del comercio, así que todos los checks
  //     de un mismo comercio eran idénticos y no probaban presencia de nadie.
  //   · Buscaba vecinos a 20m DEL COMERCIO en vez de del gondolero, así que
  //     comercios vecinos recibían checks de alguien que pudo no haber estado
  //     cerca de ninguno de los dos.
  //
  // comercios_checks es la evidencia de que el gondolero estuvo físicamente ahí.
  // Con las coordenadas del comercio no era evidencia de nada.
  try {
    console.log('[registrarMision] iniciando checks GPS', {
      comercioId: params.comercioId,
      lat: params.lat,
      lng: params.lng,
      distanciaMetros,
      gondoleroDistriId,
    })

    await registrarChecksGPSInterno({
      lat:               params.lat,
      lng:               params.lng,
      userId:            user.id,
      gondoleroDistriId: gondoleroDistriId,
      admin:             db,
    })

    console.log('[registrarMision] checks GPS completados OK')
  } catch (checksErr) {
    console.error('[registrarMision] Error en checks GPS:', checksErr)
  }

  return { ok: true, misionId: mision.id, puntos: params.puntosTotal }
}

// ── DESCARTE DE MISIÓN OFFLINE RECHAZADA ──────────────────────────────────────

export interface RegistrarDescarteParams {
  campanaId: string
  comercioId: string
  puntosTotal: number
  idempotenciaKey: string
  /** Motivo del rechazo o error que llevó al descarte. */
  motivoFallo: string
  /** epoch ms en que el gondolero descartó (client-side). */
  descartadaAt: number
}

/**
 * Registra un registro liviano (sin fotos ni respuestas) de una misión
 * offline que fue rechazada por el servidor y luego descartada por el gondolero,
 * o que alcanzó el TTL de 7 días.
 *
 * Solo metadata: el admin puede ver que la misión existió, por qué falló y
 * cuándo se descartó, sin los blobs de fotos.
 *
 * Idempotente vía idempotencia_key: si la llamada se reintenta (el primer envío
 * llegó pero la respuesta no), devuelve la fila existente sin duplicar.
 */
export async function registrarDescarte(params: RegistrarDescarteParams): Promise<{ ok: boolean }> {
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

  // Idempotencia: si ya existe un registro con esta key, no crear otro.
  const { data: existente } = await db
    .from('misiones')
    .select('id')
    .eq('idempotencia_key', params.idempotenciaKey)
    .maybeSingle()

  if (existente) return { ok: true }

  const { error } = await db.from('misiones').insert({
    campana_id:            params.campanaId,
    comercio_id:           params.comercioId,
    gondolero_id:          user.id,
    estado:                'descartada',
    puntos_total:          params.puntosTotal,
    bounty_estado:         'anulado',
    idempotencia_key:      params.idempotenciaKey,
    offline_descartada_at: new Date(params.descartadaAt).toISOString(),
    offline_motivo_fallo:  params.motivoFallo,
  })

  if (error) throw new Error('No se pudo registrar el descarte: ' + error.message)
  return { ok: true }
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
  /** Respuestas de campos no-foto del formulario rehecho (puede ser vacío). */
  respuestasDirectas: { campo_id: string; valor: unknown }[]
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

  // 3. Insertar respuestas nuevas ANTES de tocar las fotos.
  //    Orden crítico para la recuperabilidad del reintento:
  //    - Si falla AQUÍ → fotos siguen rechazadas, retake disponible, reintento OK.
  //    - Si falla en el paso 4 (fotos) → respuestas nuevas existen pero fotos
  //      siguen rechazadas: retake disponible, reintento inserta más respuestas
  //      (múltiples vigentes temporales) y completa las fotos; el paso 5 las
  //      colapsa a una sola vigente.
  //    - Si falla en el paso 5 (marcar viejas) → quedan dos vigentes por campo,
  //      recuperable con otro reintento.
  //    Nunca borramos — misma política que con las fotos.
  let nuevasIdsPorCampo = new Map<string, string>()
  if (params.respuestasDirectas.length > 0) {
    const { data: nuevasResps, error: errInsertResp } = await db
      .from('mision_respuestas')
      .insert(
        params.respuestasDirectas.map(r => ({
          mision_id: params.misionId,
          campo_id:  r.campo_id,
          valor:     r.valor,
        }))
      )
      .select('id, campo_id')

    if (errInsertResp || !nuevasResps) {
      console.error('[registrarRecaptura] Error insertando respuestas nuevas:', errInsertResp?.message)
    } else {
      for (const nr of nuevasResps as { id: string; campo_id: string }[]) {
        nuevasIdsPorCampo.set(nr.campo_id, nr.id)
      }
    }
  }

  // 4. Insertar cada foto nueva y marcar la vieja como reemplazada
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
        // La recaptura ya calculaba la distancia para loguearla; ahora también
        // la guarda. El control acá sigue blando a propósito (ver arriba): no
        // puede ser más estricto que la captura original.
        distancia_metros:      distanciaMetros,
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

  // 5. Marcar las respuestas viejas como reemplazadas, DESPUÉS de que todas las
  //    fotos quedaron OK. El marcado usa neq(id, nuevaId) + is(reemplazada_por, null)
  //    así que colapsa cualquier vigente extra que haya quedado de reintentos
  //    previos, no solo la original.
  for (const [campoId, nuevaId] of nuevasIdsPorCampo) {
    const { error: errMark } = await db
      .from('mision_respuestas')
      .update({ reemplazada_por: nuevaId })
      .eq('mision_id', params.misionId)
      .eq('campo_id', campoId)
      .is('reemplazada_por', null)
      .neq('id', nuevaId)
    if (errMark) console.error('[registrarRecaptura] Error marcando respuesta vieja:', errMark.message)
  }

  // 6. Puede pasar que la recaptura destrabe la misión: si las demás fotos ya
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
  //
  // Recalcula en vez de restar 1: en seguimiento el comercio puede tener otras
  // visitas vivas, y ahí descartar una NO lo saca del conteo de comercios
  // relevados. El helper lo resuelve sin que este flujo tenga que saberlo.
  await sincronizarComerciosRelevados(mision.campana_id, db)

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
