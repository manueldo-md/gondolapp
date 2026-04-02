'use client'

import { useEffect, useState } from 'react'
import { useOfflineQueue } from '@/lib/hooks'
import { subirFoto } from '@/app/(gondolero)/gondolero/captura/actions'
import { registrarFoto } from '@/app/(gondolero)/gondolero/captura/actions'

export function OfflineSyncBanner() {
  const { obtenerPendientes, eliminar } = useOfflineQueue()
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    const handleOnline = async () => {
      const pendientes = await obtenerPendientes()
      if (pendientes.length === 0) return

      setMensaje(`Subiendo ${pendientes.length} ${pendientes.length === 1 ? 'foto pendiente' : 'fotos pendientes'}...`)

      let sincronizadas = 0

      for (const item of pendientes) {
        try {
          // base64 → Blob → File → FormData
          const res = await fetch(item.fotoBase64)
          const blob = await res.blob()
          const formData = new FormData()
          formData.append('foto', new File([blob], 'foto.jpg', { type: 'image/jpeg' }))

          const { url } = await subirFoto(formData)

          await registrarFoto({
            campanaId: item.campanaId,
            bloqueId: item.bloqueId,
            comercioId: item.comercioId,
            storagePath: item.storagePath,
            url,
            lat: item.lat,
            lng: item.lng,
            declaracion: item.declaracion as 'producto_presente' | 'producto_no_encontrado' | 'solo_competencia',
            precioDetectado: item.precio,
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
