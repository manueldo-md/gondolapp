'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const STORAGE_KEY = 'gondolapp_install_banner_dismissed'

export function InstalarAppBanner() {
  const [mostrar, setMostrar] = useState(false)
  const [esIOS, setEsIOS] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [promptEvento, setPromptEvento] = useState<any>(null)

  useEffect(() => {
    // No mostrar si ya está instalada como PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // No mostrar si el usuario ya cerró el banner
    if (localStorage.getItem(STORAGE_KEY)) return

    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    setEsIOS(ios)

    if (ios) {
      // En iOS no hay beforeinstallprompt — mostrar instrucciones manuales
      setMostrar(true)
      return
    }

    // Android/Chrome: capturar beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvento(e)
      setMostrar(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstalar = async () => {
    if (!promptEvento) return
    promptEvento.prompt()
    const { outcome } = await promptEvento.userChoice
    if (outcome === 'accepted') {
      cerrar()
    }
  }

  const cerrar = () => {
    setMostrar(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  if (!mostrar) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Ícono */}
        <div className="w-10 h-10 rounded-xl bg-gondo-verde-400 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-lg">G</span>
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          {esIOS ? (
            <>
              <p className="text-xs font-semibold text-gray-900 leading-snug">
                Instalá la app para mejor experiencia
              </p>
              <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                Tocá <span className="font-medium">Compartir</span>{' '}
                <span className="text-gray-400">⎋</span>{' '}
                → <span className="font-medium">Agregar a inicio</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-gray-900 leading-snug">
                Instalá la app para mejor experiencia
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">Funciona sin internet</p>
            </>
          )}
        </div>

        {/* Botón instalar (solo Android) */}
        {!esIOS && promptEvento && (
          <button
            onClick={handleInstalar}
            className="shrink-0 px-3 py-1.5 bg-gondo-verde-400 text-white text-xs font-semibold rounded-lg"
          >
            Instalar
          </button>
        )}

        {/* Cerrar */}
        <button
          onClick={cerrar}
          className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
