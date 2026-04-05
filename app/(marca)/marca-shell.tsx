'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Megaphone, Images, LogOut, Coins, UserCog, Building2, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NotifBell } from '@/components/notificaciones/notif-bell'

const NAV = [
  { href: '/marca/dashboard',        label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/marca/campanas',         label: 'Campañas',         icon: Megaphone       },
  { href: '/marca/gondolas',         label: 'Góndolas',         icon: Images          },
  { href: '/marca/distribuidoras',   label: 'Distribuidoras',   icon: Building2       },
  { href: '/marca/notificaciones',   label: 'Notificaciones',   icon: Bell            },
  { href: '/marca/cuenta',           label: 'Mi cuenta',        icon: UserCog         },
]

export function MarcaShell({
  children,
  empresa,
  marcaId,
  tokensDisponibles,
  unreadNotifs = 0,
}: {
  children: React.ReactNode
  empresa: string
  marcaId: string
  tokensDisponibles: number
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

  const seccionActual = NAV.find(n => pathname.startsWith(n.href))?.label ?? 'Panel'

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 w-60 bg-white border-r border-gray-200 flex flex-col z-20">

        {/* Logo */}
        <div className="h-16 px-5 flex items-center border-b border-gray-100 shrink-0">
          <span className="font-bold text-gondo-indigo-600 text-lg tracking-tight">
            GondolApp
          </span>
        </div>

        {/* Empresa */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Marca
          </p>
          <p className="text-sm font-semibold text-gray-900 truncate">{empresa}</p>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const activo = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activo
                    ? 'bg-gondo-indigo-50 text-gondo-indigo-600'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={17} strokeWidth={activo ? 2.5 : 1.8} />
                {label}
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
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Contenido principal ───────────────────────────────────────────────── */}
      <div className="ml-60 flex-1 flex flex-col min-h-screen">

        {/* Topbar */}
        <header className="sticky top-0 z-10 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h1 className="font-semibold text-gray-900 text-base">{seccionActual}</h1>
          <div className="flex items-center gap-3">
            <NotifBell
              initialCount={unreadNotifs}
              href="/marca/notificaciones"
              actorId={marcaId}
              className="text-gray-400 hover:text-gray-700"
            />
            <div className="flex items-center gap-1.5 bg-gondo-indigo-50 text-gondo-indigo-600 px-3 py-1.5 rounded-full">
              <Coins size={14} />
              <span className="text-sm font-semibold">{tokensDisponibles} tokens</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>

    </div>
  )
}
