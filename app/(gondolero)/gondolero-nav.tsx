'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, CheckSquare, BarChart2, User } from 'lucide-react'

const TABS = [
  { href: '/gondolero/campanas',  label: 'Campañas',  icon: LayoutGrid  },
  { href: '/gondolero/misiones',  label: 'Misiones',  icon: CheckSquare },
  { href: '/gondolero/actividad', label: 'Actividad', icon: BarChart2   },
  { href: '/gondolero/perfil',    label: 'Perfil',    icon: User        },
]

export function GondoleroNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-inset-bottom">
      <div className="flex items-stretch max-w-lg mx-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const activo = pathname.startsWith(href)
          const esActividad = href === '/gondolero/actividad'
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 min-h-touch transition-colors ${
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
              </div>
              <span className={`text-[11px] leading-none ${activo ? 'font-semibold' : 'font-normal'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
