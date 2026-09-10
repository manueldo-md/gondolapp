'use client'

/**
 * SwUpdater — dos responsabilidades:
 *
 * 1. Auto-reload cuando el SW se actualiza (controllerchange)
 *    Al montar, llama registration.update() para forzar el chequeo de nueva
 *    versión de sw.js. Si hay un SW nuevo, skipWaiting()+clients.claim() lo
 *    activan; controllerchange dispara window.location.reload() exactamente
 *    una vez — salvo que el gondolero esté en captura, donde el reload se
 *    difiere hasta que salga de esa ruta para no perderle la foto.
 *
 * 2. router.refresh() cuando el SW revalida el cache en background (SW_UPDATED)
 *    El SW envía { type: 'SW_UPDATED', pathname } después de cachear una
 *    respuesta fresca (stale-while-revalidate). Si la pestaña está en esa
 *    ruta, router.refresh() re-renderiza los Server Components sin perder
 *    estado de React.
 */

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

// Rutas donde NO se hace router.refresh() (Client Components puros sin datos server-rendered)
// y donde NO se hace auto-reload inmediato (estado frágil — foto en progreso).
const RUTAS_CAPTURA = '/gondolero/captura'

// Rutas que son Client Components puros — router.refresh() no aporta nada
const PAGINAS_CLIENTE = [RUTAS_CAPTURA]

export function SwUpdater() {
  const router   = useRouter()
  const pathname = usePathname()

  // pathname de usePathname() nunca incluye query string:
  // /gondolero/captura?campana=X&retake=Y → '/gondolero/captura'
  // Así que startsWith cubre tanto la ruta base como el retake con params.
  const enCaptura = pathname.startsWith(RUTAS_CAPTURA)

  // Refs para acceso sin closure stale dentro del handler del evento.
  // enCapturaRef: valor actual de enCaptura que el handler puede leer en cualquier momento.
  // reloadPendienteRef: true si controllerchange se disparó mientras estábamos en captura.
  const enCapturaRef       = useRef(enCaptura)
  const reloadPendienteRef = useRef(false)

  // Mantener enCapturaRef sincronizado después de cada render (sin array de deps
  // para que se actualice siempre, no solo cuando enCaptura cambia).
  useEffect(() => {
    enCapturaRef.current = enCaptura
  })

  // Cuando el usuario sale de captura: ejecutar el reload pendiente si lo había.
  // El gondolero termina la captura → navega a /gondolero/campanas → enCaptura
  // pasa a false → este effect se dispara → reload.
  useEffect(() => {
    if (!enCaptura && reloadPendienteRef.current) {
      reloadPendienteRef.current = false
      window.location.reload()
    }
  }, [enCaptura])

  // ── Auto-reload al recibir un SW nuevo ──────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Forzar chequeo de nueva versión al montar (ignora throttle de 24h).
    navigator.serviceWorker.getRegistration().then(reg => { reg?.update() })

    let reloading = false
    const handleControllerChange = () => {
      if (reloading) return

      if (enCapturaRef.current) {
        // Estamos en captura — diferir el reload para no interrumpir la foto.
        // El useEffect([enCaptura]) lo ejecutará cuando el usuario salga.
        reloadPendienteRef.current = true
        return
      }

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

      const { pathname: updatedPath } = event.data as { type: string; pathname: string }

      // Solo actuar si estamos en la página que se actualizó
      if (window.location.pathname !== updatedPath) return

      // Omitir páginas Client Component (no tienen datos server-rendered)
      if (PAGINAS_CLIENTE.some(p => updatedPath.startsWith(p))) return

      router.refresh()
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [router])

  // No renderiza nada — solo maneja efectos secundarios
  return null
}
