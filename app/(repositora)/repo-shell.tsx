'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Images, Users, Megaphone, LogOut, UserCog, LayoutDashboard, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NotifBell } from '@/components/notificaciones/notif-bell'

const NAV = [
  { href: '/repositora/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/repositora/gondolas',       label: 'Gondolas',       icon: Images          },
  { href: '/repositora/campanas',       label: 'Campañas',       icon: Megaphone       },
  { href: '/repositora/fixers',         label: 'Fixers',         icon: Users           },
  { href: '/repositora/notificaciones', label: 'Notificaciones', icon: Bell            },
  { href: '/repositora/cuenta',         label: 'Mi cuenta',      icon: UserCog         },
]

export function RepoShell({
  children,
  repositora,
  repoId,
  solicitudesPendientes,
  unreadNotifs = 0,
}: {
  children: React.ReactNode
  repositora: string
  repoId: string
  solicitudesPendientes: number
  unreadNotifs?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  const seccionActual = NAV.find(n => pathname.startsWith(n.href))?.label ?? 'Dashboard'

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-60 bg-white border-r border-gray-200 flex flex-col z-20">

        {/* Logo */}
        <div className="h-16 px-5 flex items-center border-b border-gray-100 shrink-0">
          <span className="font-bold text-blue-600 text-lg tracking-tight">
            GondolApp
          </span>
        </div>

        {/* Empresa */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Repositora
          </p>
          <p className="text-sm font-semibold text-gray-900 truncate">{repositora}</p>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const activo = pathname.startsWith(href)
            const esFixers = href === '/repositora/fixers'
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activo
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={17} strokeWidth={activo ? 2.5 : 1.8} />
                {label}
                {esFixers && solicitudesPendientes > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    activo ? 'bg-blue-600/20 text-blue-600' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {solicitudesPendientes}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 pt-3 border-t border-gray-100 shrink-0">
          <button
            onClick={cerrarSesion}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 w-full transition-colors"
          >
            <LogOut size={17} />
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="ml-60 flex-1 flex flex-col min-h-screen">

        {/* Topbar */}
        <header className="sticky top-0 z-10 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h1 className="font-semibold text-gray-900 text-base">{seccionActual}</h1>
          <NotifBell
            initialCount={unreadNotifs}
            href="/repositora/notificaciones"
            actorId={repoId}
            className="text-gray-400 hover:text-gray-700"
          />
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>

    </div>
  )
}
