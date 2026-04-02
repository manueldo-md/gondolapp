'use client'

import { useEffect, useState } from 'react'

export function OfflineDetector({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  if (!online) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 bg-white py-16">
        <div className="text-6xl mb-4">✈️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sin conexión</h2>
        <p className="text-gray-500 text-center mb-6 text-sm max-w-xs">
          No hay internet. Podés seguir capturando fotos — se van a subir automáticamente cuando vuelva la conexión.
        </p>
        <a
          href="/gondolero/captura"
          className="w-full max-w-xs py-3 bg-green-600 text-white font-semibold rounded-xl text-center block"
        >
          📷 Ir a capturar
        </a>
        {children}
      </div>
    )
  }

  return <>{children}</>
}
