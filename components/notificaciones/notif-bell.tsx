'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  /** Conteo inicial de no leídas desde el servidor (SSR) */
  initialCount: number
  /** Ruta al hacer click en la campana */
  href: string
  /** actor_id del usuario (marca_id o distri_id) */
  actorId?: string
  /** true para el panel admin (filtra por actor_tipo='admin', no por actorId) */
  isAdmin?: boolean
  /** Clases CSS adicionales para el link */
  className?: string
}

/**
 * Campana de notificaciones con badge y suscripción a Supabase Realtime.
 * El conteo arranca con el valor SSR y se incrementa en tiempo real
 * cuando llegan nuevos INSERTs a la tabla notificaciones.
 */
export function NotifBell({
  initialCount,
  href,
  actorId,
  isAdmin = false,
  className = 'text-gray-400 hover:text-gray-700',
}: Props) {
  const [count, setCount] = useState(initialCount)

  // Sincronizar con nuevas navegaciones (el layout re-renderiza con fresh SSR count)
  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  // Suscripción Realtime
  useEffect(() => {
    if (!actorId && !isAdmin) {
      console.warn('[NotifBell] sin actorId ni isAdmin — Realtime no suscrito')
      return
    }

    const supabase = createClient()
    const channelName = isAdmin ? 'notif-realtime-admin' : `notif-realtime-${actorId}`
    const filter = isAdmin ? 'actor_tipo=eq.admin' : `actor_id=eq.${actorId}`

    console.log('[NotifBell] suscribiendo — channel:', channelName, '| filter:', filter)

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter },
        (payload) => {
          console.log('[NotifBell] evento recibido:', payload)
          setCount(prev => prev + 1)
        }
      )
      .subscribe((status, err) => {
        console.log('[NotifBell] estado de suscripción:', status, err ?? '')
      })

    return () => { supabase.removeChannel(channel) }
  }, [actorId, isAdmin])

  return (
    <Link href={href} className={`relative p-1.5 transition-colors ${className}`}>
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-0.5 leading-none">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
