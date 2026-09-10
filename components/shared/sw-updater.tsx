'use client'

/**
 * SwUpdater — dos responsabilidades:
 *
 * 1. Auto-reload cuando el SW se actualiza (controllerchange)
 *    Al montar, llama registration.update() para forzar el chequeo de nueva
 *    versión de sw.js sin depender del throttle de 24h del browser. Si hay un
 *    SW nuevo, skipWaiting()+clients.claim() lo activan; el evento
 *    controllerchange dispara window.location.reload() exactamente una vez.
 *    El gondolero ve el reload como la app cargando — no necesita hacer nada.
 *
 * 2. router.refresh() cuando el SW revalida el cache en background (SW_UPDATED)
 *    El SW envía { type: 'SW_UPDATED', pathname } después de cachear una
 *    respuesta fresca (estrategia stale-while-revalidate). Si la pestaña está
 *    en esa misma ruta, router.refresh() re-renderiza los Server Components
 *    sin desmontar los Client Components ni perder estado de React.
 */

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Rutas que son Client Components puros — router.refresh() no aporta nada
// (y en captura específicamente el gondolero puede estar con foto y formulario
// a medio llenar, aunque refresh() sería inocuo porque el estado sobrevive).
const PAGINAS_CLIENTE = ['/gondolero/captura']

export function SwUpdater() {
  const router = useRouter()

  // ── Auto-reload al recibir un SW nuevo ──────────────────────────────────────
  // registration.update() fuerza el chequeo de sw.js al montar, ignorando el
  // throttle de 24h. Si hay una versión nueva, el SW la instala y activa sola
  // (skipWaiting+clients.claim están en el SW). El evento controllerchange se
  // dispara exactamente cuando el nuevo SW toma control — en ese momento el
  // cache viejo ya está borrado y un reload sirve la versión nueva.
  //
  // Sin esto: el gondolero abre la app, la app sigue con el SW viejo hasta la
  // próxima navegación que el browser decida hacer el chequeo. Con esto: el
  // chequeo ocurre siempre en cada apertura de la app, y si hay SW nuevo el
  // reload es automático e imperceptible.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Forzar chequeo de nueva versión al montar
    navigator.serviceWorker.getRegistration().then(reg => {
      reg?.update()
    })

    // Recargar una sola vez cuando el nuevo SW toma control.
    // El guard 'reloading' previene loops: aunque reload() pudiera disparar
    // otro controllerchange (no debería — el nuevo SW ya es el controller),
    // el flag lo detiene.
    let reloading = false
    const handleControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
  }, [])

  // ── router.refresh() al revalidar el cache en background ────────────────────
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

  // No renderiza nada — solo maneja efectos secundarios
  return null
}
