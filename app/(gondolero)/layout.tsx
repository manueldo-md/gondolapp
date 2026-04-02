'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, CheckSquare, User } from 'lucide-react'

const TABS = [
  {
    href: '/gondolero/campanas',
    label: 'Campañas',
    icon: LayoutGrid,
  },
  {
    href: '/gondolero/misiones',
    label: 'Misiones',
    icon: CheckSquare,
  },
  {
    href: '/gondolero/perfil',
    label: 'Perfil',
    icon: User,
  },
]

export default function GondoleroLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* Contenido principal — padding inferior para que no quede tapado por la nav */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Navegación inferior */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-inset-bottom">
        <div className="flex items-stretch max-w-lg mx-auto">
          {TABS.map(({ href, label, icon: Icon }) => {
            const activo = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 min-h-touch transition-colors ${
                  activo
                    ? 'text-gondo-verde-400'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={activo ? 2.5 : 1.8}
                />
                <span className={`text-[11px] leading-none ${activo ? 'font-semibold' : 'font-normal'}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

    </div>
  )
}
