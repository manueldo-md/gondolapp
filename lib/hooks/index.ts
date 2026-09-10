'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── useGPS ────────────────────────────────────────────────────────────────────

export type GPSEstado = 'idle' | 'solicitando' | 'activo' | 'error'

export interface GPSData {
  lat: number
  lng: number
  precision: number
}

export function useGPS() {
  const [estado, setEstado] = useState<GPSEstado>('idle')
  const [posicion, setPosicion] = useState<GPSData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)

  const solicitar = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no soporta GPS.')
      setEstado('error')
      return
    }
    setEstado('solicitando')
    setError(null)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosicion({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: Math.round(pos.coords.accuracy),
        })
        setEstado('activo')
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de GPS denegado. Habilitalo en la configuración del navegador.'
            : 'No pudimos obtener tu ubicación. Intentá de nuevo.'
        )
        setEstado('error')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    )
  }, [])

  const detener = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setEstado('idle')
  }, [])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return { estado, posicion, error, solicitar, detener }
}

