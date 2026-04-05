'use client'

import { useEffect } from 'react'
import { marcarNotificacionesDistriLeidas } from './actions'

export function MarcarDistriLeidas({ distriId }: { distriId: string }) {
  useEffect(() => {
    const t = setTimeout(() => marcarNotificacionesDistriLeidas(distriId), 2000)
    return () => clearTimeout(t)
  }, [distriId])
  return null
}
