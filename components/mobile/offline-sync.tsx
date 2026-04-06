'use client'

import { useEffect, useState } from 'react'
import { get, set } from 'idb-keyval'
import { useOfflineQueue } from '@/lib/hooks'
import { subirFoto, registrarFoto, obtenerConfigCompresion } from '@/app/(gondolero)/gondolero/captura/actions'
import { comprimirImagen } from '@/lib/utils'
import { crearComercioOffline } from '@/app/(gondolero)/gondolero/comercios/nuevo/actions'

const COMERCIOS_PENDIENTES_KEY = 'comercios_pendientes'

interface ComercioTempItem {
  tempId: string
  nombre: string
  tipo: string
  direccion: string | null
  lat: number
  lng: number
  timestamp: number
}

export function OfflineSyncBanner() {
  const { obtenerPendientes, eliminar } = useOfflineQueue()
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    const handleOnline = async () => {
      const cfg = await obtenerConfigCompresion()
      const pendientes = await obtenerPendientes()
      const comerciosPendientes: ComercioTempItem[] = (await get(COMERCIOS_PENDIENTES_KEY)) ?? []
      const totalPendientes = pendientes.length + comerciosPendientes.length

      if (totalPendientes === 0) return

      if (pendientes.length > 0) {
        setMensaje(`Subiendo ${pendientes.length} ${pendientes.length === 1 ? 'foto pendiente' : 'fotos pendientes'}...`)
      }

      let sincronizadas = 0
      const tempIdsUsados = new Set<string>()

      for (const item of pendientes) {
        try {
          // Si el comercio es temporal, crearlo primero en Supabase
          let comercioId = item.comercioId
          if (item.comercioId.startsWith('temp_') && item.comercioPendiente) {
            const { id, error } = await crearComercioOffline(item.comercioPendiente)
            if (error || !id) throw new Error(error ?? 'Error creando comercio')
            comercioId = id
            tempIdsUsados.add(item.comercioId)
          }

          // base64 → Blob → comprimir → File → FormData
          const res = await fetch(item.fotoBase64)
          const blobOriginal = await res.blob()
          console.log('[offline-sync] Antes:', (blobOriginal.size / 1024).toFixed(1), 'KB')
          const blob = await comprimirImagen(blobOriginal, cfg.maxSizeMB, cfg.maxWidth, cfg.calidad)
          console.log('[offline-sync] Después:', (blob.size / 1024).toFixed(1), 'KB')
          const formData = new FormData()
          formData.append('foto', new File([blob], 'foto.jpg', { type: 'image/jpeg' }))

          const { url } = await subirFoto(formData)

          await registrarFoto({
            campanaId: item.campanaId,
            bloqueId: item.bloqueId,
            comercioId,
            storagePath: item.storagePath,
            url,
            lat: item.lat,
            lng: item.lng,
            declaracion: item.declaracion as 'producto_presente' | 'producto_no_encontrado' | 'solo_competencia',
            precioConfirmado: item.precio,
            timestampDispositivo: item.timestamp,
            deviceId: item.deviceId,
            puntosAcreditar: item.puntosAcreditar,
          })

          await eliminar(item.id)
          sincronizadas++
        } catch {
          // Mantener en cola para el próximo intento
        }
      }

      // Sincronizar comercios pendientes que no estuvieron asociados a una foto
      const comerciosRestantes = comerciosPendientes.filter(
        cp => !tempIdsUsados.has(cp.tempId)
      )
      const comerciosSincronizados: string[] = []
      for (const cp of comerciosRestantes) {
        try {
          await crearComercioOffline({
            nombre:    cp.nombre,
            tipo:      cp.tipo,
            direccion: cp.direccion,
            lat:       cp.lat,
            lng:       cp.lng,
          })
          comerciosSincronizados.push(cp.tempId)
        } catch {
          // Mantener para el próximo intento
        }
      }

      // Limpiar comercios_pendientes ya sincronizados
      const todosUsados = new Set([...tempIdsUsados, ...comerciosSincronizados])
      if (todosUsados.size > 0) {
        const actualizados = comerciosPendientes.filter(cp => !todosUsados.has(cp.tempId))
        await set(COMERCIOS_PENDIENTES_KEY, actualizados)
      }

      if (sincronizadas > 0) {
        setMensaje(`¡${sincronizadas} ${sincronizadas === 1 ? 'foto sincronizada' : 'fotos sincronizadas'}!`)
        setTimeout(() => setMensaje(null), 4000)
      } else {
        setMensaje(null)
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [obtenerPendientes, eliminar])

  if (!mensaje) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg whitespace-nowrap">
      {mensaje}
    </div>
  )
}
