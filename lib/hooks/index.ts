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

// ── useOfflineQueue ───────────────────────────────────────────────────────────

export interface UploadPendiente {
  id: string
  campanaId: string
  bloqueId: string
  comercioId: string
  storagePath: string
  fotoBase64: string
  lat: number
  lng: number
  declaracion: string
  precio: number | null
  deviceId: string
  timestamp: string
}

const QUEUE_KEY = 'gondolapp_upload_queue'

export function useOfflineQueue() {
  const encolar = useCallback((item: Omit<UploadPendiente, 'id'>) => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY)
      const queue: UploadPendiente[] = stored ? JSON.parse(stored) : []
      queue.push({ ...item, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` })
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    } catch { /* localStorage puede fallar en modo privado */ }
  }, [])

  const obtenerPendientes = useCallback((): UploadPendiente[] => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  }, [])

  const eliminar = useCallback((id: string) => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY)
      const queue: UploadPendiente[] = stored ? JSON.parse(stored) : []
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.filter(i => i.id !== id)))
    } catch { /* ignore */ }
  }, [])

  return { encolar, obtenerPendientes, eliminar }
}
