'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { get, set } from 'idb-keyval'

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
  puntosAcreditar: number
  comercioPendiente?: {
    nombre: string
    tipo: string
    direccion: string | null
    lat: number
    lng: number
  }
}

const QUEUE_KEY = 'gondolapp_upload_queue'

export function useOfflineQueue() {
  const encolar = useCallback(async (item: Omit<UploadPendiente, 'id'>) => {
    const queue: UploadPendiente[] = (await get(QUEUE_KEY)) ?? []
    queue.push({ ...item, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` })
    await set(QUEUE_KEY, queue)
  }, [])

  const obtenerPendientes = useCallback(async (): Promise<UploadPendiente[]> => {
    return (await get(QUEUE_KEY)) ?? []
  }, [])

  const eliminar = useCallback(async (id: string) => {
    const queue: UploadPendiente[] = (await get(QUEUE_KEY)) ?? []
    await set(QUEUE_KEY, queue.filter(i => i.id !== id))
  }, [])

  return { encolar, obtenerPendientes, eliminar }
}
