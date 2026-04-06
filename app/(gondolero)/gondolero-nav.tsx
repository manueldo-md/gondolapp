'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, BarChart2, Trophy, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const TABS = [
  { href: '/gondolero/campanas',  label: 'Campañas',  icon: LayoutGrid  },
  { href: '/gondolero/actividad', label: 'Actividad', icon: BarChart2   },
  { href: '/gondolero/logros',    label: 'Logros',    icon: Trophy      },
  { href: '/gondolero/perfil',    label: 'Perfil',    icon: User        },
]

function NavItem({
  href, label, icon: Icon, activo,
  esActividad, unreadCount,
  esLogros, unreadLogrosCount,
  esPerfil, invitacionesPendientesCount,
  enCaptura,
}: {
  href: string
  label: string
  icon: React.ElementType
  activo: boolean
  esActividad: boolean
  unreadCount: number
  esLogros: boolean
  unreadLogrosCount: number
  esPerfil: boolean
  invitacionesPendientesCount: number
  enCaptura: boolean
}) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)

  const handleClick = () => {
    if (enCaptura) {
      setShowDialog(true)
      return
    }
    router.push(href)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 min-h-touch transition-all duration-150 active:opacity-60 active:scale-95 ${
          activo ? 'text-gondo-verde-400' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <div className="relative">
          <Icon size={22} strokeWidth={activo ? 2.5 : 1.8} />
          {esActividad && unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {esLogros && unreadLogrosCount > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
              {unreadLogrosCount > 9 ? '9+' : unreadLogrosCount}
            </span>
          )}
          {esPerfil && invitacionesPendientesCount > 0 && (
            <span className="absolute -top-1.5 -right-2 w-3 h-3 bg-red-500 rounded-full border border-white" />
          )}
        </div>
        <span className={`text-[11px] leading-none ${activo ? 'font-semibold' : 'font-normal'}`}>
          {label}
        </span>
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center pb-24 px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <p className="font-bold text-gray-900 text-base">¿Salir de la captura?</p>
              <p className="text-sm text-gray-500 mt-1">
                Perdés el progreso de esta foto. Los datos del comercio y la campaña se mantienen — podés volver a empezar.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setShowDialog(false)}
                className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl"
              >
                Seguir capturando
              </button>
              <button
                onClick={() => { setShowDialog(false); router.push(href) }}
                className="w-full py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl"
              >
                Salir igual
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function GondoleroNav({
  unreadCount: initialUnreadCount,
  unreadLogrosCount,
  invitacionesPendientesCount,
  userId,
}: {
  unreadCount: number
  unreadLogrosCount: number
  invitacionesPendientesCount: number
  userId?: string
}) {
  const pathname = usePathname()
  const enCaptura = pathname.includes('/captura')
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)

  // Sincronizar cuando el layout re-renderiza (ej: después de marcar leídas)
  useEffect(() => {
    setUnreadCount(initialUnreadCount)
  }, [initialUnreadCount])

  // Realtime: incrementar badge cuando llega una notificación nueva
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notif-gondolero-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `gondolero_id=eq.${userId}`,
        },
        () => { setUnreadCount(prev => prev + 1) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-inset-bottom">
      <div className="flex items-stretch max-w-lg mx-auto">
        {TABS.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            activo={pathname.startsWith(href)}
            esActividad={href === '/gondolero/actividad'}
            unreadCount={unreadCount}
            esLogros={href === '/gondolero/logros'}
            unreadLogrosCount={unreadLogrosCount}
            esPerfil={href === '/gondolero/perfil'}
            invitacionesPendientesCount={invitacionesPendientesCount}
            enCaptura={enCaptura}
          />
        ))}
      </div>
    </nav>
  )
}
