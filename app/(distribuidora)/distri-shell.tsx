'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Images, Users, Store, Megaphone, LogOut, UserCog, LayoutDashboard, Bell, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/distribuidora/dashboard',       label: 'Dashboard',            icon: LayoutDashboard },
  { href: '/distribuidora/gondolas',        label: 'Gondolas',             icon: Images          },
  { href: '/distribuidora/campanas',        label: 'Campanas',             icon: Megaphone       },
  { href: '/distribuidora/gondoleros',      label: 'Gondoleros',           icon: Users           },
  { href: '/distribuidora/comercios',       label: 'Comercios',            icon: Store           },
  { href: '/distribuidora/comercios/pendientes', label: 'Comercios pendientes', icon: Store      },
  { href: '/distribuidora/alertas',         label: 'Alertas',              icon: Bell            },
  { href: '/distribuidora/marcas',          label: 'Marcas',               icon: Tag             },
  { href: '/distribuidora/notificaciones',  label: 'Notificaciones',       icon: Bell            },
  { href: '/distribuidora/cuenta',          label: 'Mi cuenta',            icon: UserCog         },
]

export function DistriShell({
  children,
  empresa,
  hayAlertas,
  solicitudesPendientes,
  campanasPendientes = 0,
  comerciosPendientes = 0,
  unreadNotifs = 0,
}: {
  children: React.ReactNode
  empresa: string
  hayAlertas: boolean
  solicitudesPendientes: number
  campanasPendientes?: number
  comerciosPendientes?: number
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
          <span className="font-bold text-gondo-amber-400 text-lg tracking-tight">
            GondolApp
          </span>
        </div>

        {/* Empresa */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Distribuidora
          </p>
          <p className="text-sm font-semibold text-gray-900 truncate">{empresa}</p>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const activo = pathname.startsWith(href)
            const esAlertas = href === '/distribuidora/alertas'
            const esGondoleros = href === '/distribuidora/gondoleros'
            const esCampanas = href === '/distribuidora/campanas'
            const esComerciosPendientes = href === '/distribuidora/comercios/pendientes'
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activo
                    ? 'bg-gondo-amber-50 text-gondo-amber-400'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={17} strokeWidth={activo ? 2.5 : 1.8} />
                {label}
                {esAlertas && hayAlertas && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-red-500 shrink-0" />
                )}
                {esGondoleros && solicitudesPendientes > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    activo ? 'bg-gondo-amber-400/20 text-gondo-amber-400' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {solicitudesPendientes}
                  </span>
                )}
                {esCampanas && campanasPendientes > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    activo ? 'bg-gondo-amber-400/20 text-gondo-amber-400' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {campanasPendientes}
                  </span>
                )}
                {esComerciosPendientes && comerciosPendientes > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    activo ? 'bg-gondo-amber-400/20 text-gondo-amber-400' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {comerciosPendientes}
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
          <Link href="/distribuidora/notificaciones" className="relative p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <Bell size={18} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-0.5 leading-none">
                {unreadNotifs > 99 ? '99+' : unreadNotifs}
              </span>
            )}
          </Link>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>

    </div>
  )
}
