import { createClient as createAdminClient } from '@supabase/supabase-js'

export interface ConfigCompresion {
  maxSizeMB: number
  maxWidth: number
  calidad: number
}

export interface ConfigCompleta {
  foto: {
    blurThresholdMobile: number
    blurThresholdDesktop: number
    inclinacionGammaAdvertencia: number
    inclinacionGammaBloqueo: number
    inclinacionBetaMin: number
    inclinacionBetaMax: number
  }
  gps: {
    radioMetros: number
    timeoutSegundos: number
  }
  economia: {
    tokensCrearCampana: number
    puntosCanjeCelular: number
    puntosCanjeNafta: number
    puntosCanjeGiftcard: number
    puntosCanjeTransferencia: number
  }
  niveles: {
    fotosCasualAActivo: number
    fotosActivoAPro: number
  }
  operacion: {
    slaCanjesHoras: number
    alertaGondoleroInactivoDias: number
    alertaComercioSinVisitaDias: number
    alertaIgnoradaReactivacionDias: number
    offlineQueueExpiryHoras: number
  }
  compresion: ConfigCompresion
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Lee TODA la configuración desde la tabla `configuracion`.
 * Usar solo en el servidor (server actions, server components).
 */
export async function getConfig(): Promise<ConfigCompleta> {
  try {
    const admin = adminClient()
    const { data } = await admin
      .from('configuracion')
      .select('clave, valor')

    const m: Record<string, string> = {}
    for (const row of data ?? []) m[row.clave] = row.valor

    const n = (key: string, def: number) => Number(m[key] ?? def) || def

    return {
      foto: {
        blurThresholdMobile:         n('blur_threshold_mobile', 800),
        blurThresholdDesktop:        n('blur_threshold_desktop', 50),
        inclinacionGammaAdvertencia: n('inclinacion_gamma_advertencia', 20),
        inclinacionGammaBloqueo:     n('inclinacion_gamma_bloqueo', 25),
        inclinacionBetaMin:          n('inclinacion_beta_min', 60),
        inclinacionBetaMax:          n('inclinacion_beta_max', 100),
      },
      gps: {
        radioMetros:      n('gps_radio_metros', 50),
        timeoutSegundos:  n('gps_timeout_segundos', 15),
      },
      economia: {
        tokensCrearCampana:        n('tokens_crear_campana', 15),
        puntosCanjeCelular:        n('puntos_canje_celular', 300),
        puntosCanjeNafta:          n('puntos_canje_nafta', 500),
        puntosCanjeGiftcard:       n('puntos_canje_giftcard', 1000),
        puntosCanjeTransferencia:  n('puntos_canje_transferencia', 2000),
      },
      niveles: {
        fotosCasualAActivo: n('nivel_fotos_casual_a_activo', 50),
        fotosActivoAPro:    n('nivel_fotos_activo_a_pro', 100),
      },
      operacion: {
        slaCanjesHoras:                  n('sla_canjes_horas', 48),
        alertaGondoleroInactivoDias:     n('alerta_gondolero_inactivo_dias', 14),
        alertaComercioSinVisitaDias:     n('alerta_comercio_sin_visita_dias', 30),
        alertaIgnoradaReactivacionDias:  n('alerta_ignorada_reactivacion_dias', 7),
        offlineQueueExpiryHoras:         n('offline_queue_expiry_horas', 72),
      },
      compresion: {
        maxSizeMB: parseFloat(m['compresion_max_kb'] ?? '250') / 1000,
        maxWidth:  parseInt(m['compresion_max_width'] ?? '1024', 10),
        calidad:   parseFloat(m['compresion_calidad'] ?? '0.70'),
      },
    }
  } catch {
    return {
      foto: {
        blurThresholdMobile: 800, blurThresholdDesktop: 50,
        inclinacionGammaAdvertencia: 20, inclinacionGammaBloqueo: 25,
        inclinacionBetaMin: 60, inclinacionBetaMax: 100,
      },
      gps: { radioMetros: 50, timeoutSegundos: 15 },
      economia: {
        tokensCrearCampana: 15, puntosCanjeCelular: 300,
        puntosCanjeNafta: 500, puntosCanjeGiftcard: 1000,
        puntosCanjeTransferencia: 2000,
      },
      niveles: { fotosCasualAActivo: 50, fotosActivoAPro: 100 },
      operacion: {
        slaCanjesHoras: 48, alertaGondoleroInactivoDias: 14,
        alertaComercioSinVisitaDias: 30, alertaIgnoradaReactivacionDias: 7,
        offlineQueueExpiryHoras: 72,
      },
      compresion: { maxSizeMB: 0.25, maxWidth: 1024, calidad: 0.70 },
    }
  }
}

/**
 * Lee la configuración de compresión desde la tabla `configuracion`.
 * Usar solo en el servidor (server actions, server components).
 * @deprecated Usar getConfig().compresion en su lugar
 */
export async function getConfigCompresion(): Promise<ConfigCompresion> {
  const config = await getConfig()
  return config.compresion
}
