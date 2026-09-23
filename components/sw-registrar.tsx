'use client'

import { useEffect } from 'react'

/**
 * ── POR QUÉ EL `?v=` ────────────────────────────────────────────────────────
 * El browser decide que hay un service worker nuevo comparando el script. Con
 * `/sw.js` a secas, un deploy que no modifica ese archivo byte a byte no
 * reinstala nada: el SW viejo sigue corriendo y su cache sigue vivo, porque
 * `activate` —que es el único que borra caches— nunca se dispara.
 *
 * Eso convertía la versión del cache en una constante que alguien tenía que
 * acordarse de subir, y el 23/9/2026 costó caro: el deploy que arreglaba el
 * KPI de Presencia del panel de marca no la tocó, y el HTML viejo se siguió
 * sirviendo desde el disco del dispositivo.
 *
 * Con el commit en el query string, el scriptURL cambia en cada deploy, el
 * browser reinstala, `activate` borra el cache anterior y `sw.js` usa ese mismo
 * valor como nombre del cache nuevo. La versión deja de depender de la memoria
 * de nadie.
 *
 * `register()` corre en cada carga completa —este componente está en el layout
 * raíz— así que el `?v=` nuevo llega solo. `SwUpdater` hace `reg.update()`, que
 * revalida el scriptURL ACTUAL: sirve para el mismo deploy, no para detectar
 * uno nuevo. Los dos hacen falta.
 */
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'

export function SwRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD)}`)
        .then(reg => console.log('SW registrado', reg.scope, BUILD))
        .catch(err => console.log('SW error:', err))
    }
  }, [])

  return null
}
