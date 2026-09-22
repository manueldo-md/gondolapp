'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── useGPS ────────────────────────────────────────────────────────────────────
//
// TRABAJAR SIN SEÑAL ES EL CASO NORMAL EN EL INTERIOR, NO EL RARO.
//
// Sin datos móviles se corta el A-GPS: el teléfono no puede usar torres ni wifi
// para asistir al chip, así que el primer fix pasa de 2-3 segundos a 30-60. La
// configuración anterior —`timeout: 15000, maximumAge: 5000`— convertía eso en
// un error a los 15 segundos, con el watch todavía vivo y buscando. El fix
// llegaba solo unos segundos después, pero la pantalla ya decía "No pudimos
// obtener tu ubicación" y ofrecía un botón de reintentar que no hacía falta.
//
// ── POR QUÉ SE SACÓ EL TIMEOUT ──────────────────────────────────────────────
// El `timeout` de `watchPosition` NO es cuánto esperamos: es cuándo se dispara
// el callback de error, y el watch sigue vivo igual. Agrandarlo a 60000 solo
// mueve la mentira 45 segundos y después vuelve a mentir. Sin timeout, el error
// queda reservado para lo que de verdad es un error —permiso denegado,
// dispositivo sin GPS— y la espera se comunica como espera.
//
// El riesgo de no tener timeout es real y está cubierto en los dos pasos:
// un teléfono con la ubicación apagada por hardware puede no dar ni fix ni
// error. A los 60 segundos `necesitaAyuda` cambia el texto por algo accionable,
// y el paso de comercios tiene además la búsqueda por nombre sin gate de GPS.
//
// ── maximumAge ALTO, PERO NO PARA VALIDAR ───────────────────────────────────
// `maximumAge: 120000` deja que el browser entregue lo que tenga en caché y el
// watch siga refinando: la lista de comercios cercanos aparece al toque en vez
// de esperar el primer fix. Eso es correcto para una SUGERENCIA sobre un radio
// de 100 m.
//
// Pero la misma posición alimenta la validación de distancia y el par lat/lng
// que se manda a `registrarMision`, que es el que queda guardado en
// `fotos.distancia_metros` y el que ve quien aprueba. Ahí una posición de hace
// un minuto no es un detalle: a pie son ~80 m y en moto por el pueblo, 500 —
// más que el radio de bloqueo entero.
//
// Por eso `Position.timestamp` —que antes se tiraba— ahora se guarda en
// `medidaEn`, y el hook expone `fresca`. La lista usa la posición sea cual sea
// su edad; la validación exige que sea fresca.

export type GPSEstado = 'idle' | 'solicitando' | 'activo' | 'error'

export interface GPSData {
  lat: number
  lng: number
  precision: number
  /** `Position.timestamp`: cuándo lo MIDIÓ el dispositivo, no cuándo llegó acá. */
  medidaEn: number
}

/**
 * Edad máxima de un fix para validar distancia contra un comercio.
 *
 * 30 s a pie son ~40 m, que está dentro del ruido del propio GPS urbano
 * (precisión típica 10-50 m). Más que eso empieza a competir con el radio de
 * aviso de 50 m, que es el número que el gondolero ve en pantalla.
 */
export const EDAD_MAX_VALIDACION_MS = 30_000

/** Lo que se le permite al browser devolver de su caché al arrancar el watch. */
const MAX_AGE_WATCH_MS = 120_000

/** A partir de acá el texto dice que puede tardar. Sin cambiar de estado. */
const UMBRAL_TARDANDO_MS = 12_000

/** A partir de acá el texto pasa a ser accionable. Sigue sin ser un error. */
const UMBRAL_AYUDA_MS = 60_000

/**
 * ¿El navegador ya sabe que el permiso está denegado?
 *
 * Sirve para decirlo de entrada en vez de quedarse buscando. Falla ABIERTO a
 * propósito: Safari viejo no soporta `permissions.query({name:'geolocation'})`
 * y tira, y un chequeo de cortesía nunca puede ser lo que impide pedir el GPS.
 */
async function permisoDenegado(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false
    const st = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return st.state === 'denied'
  } catch {
    return false
  }
}

export function useGPS() {
  const [estado, setEstado] = useState<GPSEstado>('idle')
  const [posicion, setPosicion] = useState<GPSData | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** ≥12 s buscando y todavía sin fix. */
  const [tardando, setTardando] = useState(false)
  /** ≥60 s buscando y todavía sin fix: el texto pasa a ser accionable. */
  const [necesitaAyuda, setNecesitaAyuda] = useState(false)
  /** La posición que hay es suficientemente reciente para validar distancia. */
  const [fresca, setFresca] = useState(false)

  const watchIdRef = useRef<number | null>(null)
  const inicioRef = useRef<number | null>(null)
  const posicionRef = useRef<GPSData | null>(null)

  const limpiarWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const solicitar = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no soporta GPS.')
      setEstado('error')
      return
    }

    // Sin esto cada llamada dejaba un watch huérfano: `solicitar` se invoca
    // desde los efectos de los DOS pasos y desde dos botones de reintentar, y
    // `detener()` solo mataba el último id guardado. Cada watch vivo mantiene la
    // radio del GPS encendida — batería en un teléfono que ya está sufriendo.
    limpiarWatch()

    setEstado('solicitando')
    setError(null)
    setTardando(false)
    setNecesitaAyuda(false)
    inicioRef.current = Date.now()

    // El chequeo de permiso va EN PARALELO, no antes: esperar su promesa
    // retrasaría el arranque del watch, que es justo lo caro sin señal.
    permisoDenegado().then(denegado => {
      if (!denegado) return
      limpiarWatch()
      setError('Permiso de GPS denegado. Habilitalo en la configuración del navegador.')
      setEstado('error')
    })

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p: GPSData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: Math.round(pos.coords.accuracy),
          medidaEn: pos.timestamp,
        }
        posicionRef.current = p
        setPosicion(p)
        setEstado('activo')
        setTardando(false)
        setNecesitaAyuda(false)
        setFresca(Date.now() - p.medidaEn <= EDAD_MAX_VALIDACION_MS)
      },
      (err) => {
        // Sin `timeout` el browser ya no inventa errores por tiempo, así que lo
        // que llega acá es real. POSITION_UNAVAILABLE igual no se trata como
        // terminal si el watch sigue vivo y ya teníamos una posición: en esos
        // casos el chip suele recuperarse solo.
        if (err.code === err.PERMISSION_DENIED) {
          limpiarWatch()
          setError('Permiso de GPS denegado. Habilitalo en la configuración del navegador.')
          setEstado('error')
          return
        }
        if (posicionRef.current) return
        setError('No pudimos obtener tu ubicación. Revisá que la ubicación del teléfono esté activada.')
        setEstado('error')
      },
      {
        enableHighAccuracy: true,
        maximumAge: MAX_AGE_WATCH_MS,
        // `timeout` omitido a propósito. Ver el encabezado.
      }
    )
  }, [limpiarWatch])

  const detener = useCallback(() => {
    limpiarWatch()
    inicioRef.current = null
    setEstado('idle')
    setTardando(false)
    setNecesitaAyuda(false)
  }, [limpiarWatch])

  // Reloj de los umbrales y de la frescura.
  //
  // Cada `setX` con el mismo valor es un no-op para React, así que esto NO
  // re-renderiza cada 2 segundos: solo cuando alguno de los tres booleanos
  // cambia de verdad.
  //
  // La frescura necesita su propio reloj porque con el watch activo las
  // actualizaciones llegan solas, pero si el chip se queda quieto la posición
  // envejece sin que llegue ningún evento que dispare un render.
  useEffect(() => {
    if (estado === 'idle' || estado === 'error') return
    const id = setInterval(() => {
      const ahora = Date.now()
      const p = posicionRef.current
      if (!p && inicioRef.current) {
        setTardando(ahora - inicioRef.current >= UMBRAL_TARDANDO_MS)
        setNecesitaAyuda(ahora - inicioRef.current >= UMBRAL_AYUDA_MS)
      }
      setFresca(!!p && ahora - p.medidaEn <= EDAD_MAX_VALIDACION_MS)
    }, 2000)
    return () => clearInterval(id)
  }, [estado])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return { estado, posicion, error, tardando, necesitaAyuda, fresca, solicitar, detener }
}
