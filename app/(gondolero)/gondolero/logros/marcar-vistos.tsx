'use client'

import { useEffect } from 'react'
import { marcarLogrosVistos } from './actions'

/**
 * Componente invisible que marca los logros como vistos al cargar la página.
 * Solo actúa si hay logros sin ver (para no hacer requests innecesarios).
 */
export function MarcarLogrosVistos({
  gondoleroId,
  hayNoVistos,
}: {
  gondoleroId: string
  hayNoVistos: boolean
}) {
  useEffect(() => {
    if (!hayNoVistos) return
    const timer = setTimeout(() => {
      marcarLogrosVistos(gondoleroId)
    }, 1500)
    return () => clearTimeout(timer)
  }, [gondoleroId, hayNoVistos])

  return null
}
