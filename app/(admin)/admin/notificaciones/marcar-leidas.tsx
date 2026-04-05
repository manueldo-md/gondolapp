'use client'

import { useEffect } from 'react'
import { marcarNotificacionesAdminLeidas } from './actions'

export function MarcarAdminLeidas() {
  useEffect(() => {
    const t = setTimeout(() => marcarNotificacionesAdminLeidas(), 2000)
    return () => clearTimeout(t)
  }, [])
  return null
}
