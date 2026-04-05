'use client'

import { useEffect } from 'react'
import { marcarNotificacionesMarcaLeidas } from './actions'

export function MarcarMarcaLeidas({ marcaId }: { marcaId: string }) {
  useEffect(() => {
    const t = setTimeout(() => marcarNotificacionesMarcaLeidas(marcaId), 2000)
    return () => clearTimeout(t)
  }, [marcaId])
  return null
}
