'use client'

import { useEffect } from 'react'
import { marcarNotificacionesLeidas } from './actions'

export function MarcarNotificacionesLeidas({ gondoleroId }: { gondoleroId: string }) {
  useEffect(() => {
    const timer = setTimeout(async () => {
      await marcarNotificacionesLeidas(gondoleroId)
    }, 2000)
    return () => clearTimeout(timer)
  }, [gondoleroId])

  return null
}
