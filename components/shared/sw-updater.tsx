'use client'

/**
 * SwUpdater — escucha mensajes del Service Worker y refresca los datos
 * de la página actual cuando el SW termina de revalidar el cache.
 *
 * El SW envía { type: 'SW_UPDATED', pathname } después de cachear una
 * respuesta fresca en background (estrategia stale-while-revalidate).
 * Si la pestaña está en esa misma ruta, router.refresh() re-renderiza
 * los Server Components sin desmontar los Client Components ni perder
 * ningún estado de React.
 *
 * Páginas en PAGINAS_CLIENTE: son Client Components puros que cargan
 * sus datos desde Supabase/IndexedDB en el cliente. Para ellas el
 * router.refresh() no agrega valor (no hay datos server-rendered que
 * actualizar), así que se omite.
 */

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Rutas que son Client Components puros — router.refresh() no aporta nada
// (y en captura específicamente el gondolero puede estar con foto y formulario
// a medio llenar, aunque refresh() sería inocuo porque el estado sobrevive).
const PAGINAS_CLIENTE = ['/gondolero/captura']

export function SwUpdater() {
  const router = useRouter()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'SW_UPDATED') return

      const { pathname } = event.data as { type: string; pathname: string }

      // Solo actuar si estamos en la página que se actualizó
      if (window.location.pathname !== pathname) return

      // Omitir páginas Client Component (no tienen datos server-rendered)
      if (PAGINAS_CLIENTE.some(p => pathname.startsWith(p))) return

      // Re-renderizar los Server Components de la ruta actual.
      // No desmonta Client Components ni pierde estado de React.
      router.refresh()
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [router])

  // No renderiza nada — solo maneja el efecto secundario
  return null
}
