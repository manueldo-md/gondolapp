'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Image, Megaphone,
  Gift, Store, Menu, X, ChevronRight, Truck, Tag,
} from 'lucide-react'

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: '/admin/tablero',  label: 'Tablero', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Actores',
    items: [
      { href: '/admin/usuarios',       label: 'Usuarios',       icon: Users },
      { href: '/admin/distribuidoras', label: 'Distribuidoras', icon: Truck },
      { href: '/admin/marcas',         label: 'Marcas',         icon: Tag },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { href: '/admin/fotos',     label: 'Fotos',     icon: Image },
      { href: '/admin/campanas',  label: 'Campañas',  icon: Megaphone },
      { href: '/admin/canjes',    label: 'Canjes',    icon: Gift },
      { href: '/admin/comercios', label: 'Comercios', icon: Store },
    ],
  },
]

export function AdminShell({
  nombre,
  excepciones,
  children,
}: {
  nombre: string
  excepciones: number
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const Sidebar = ({ mobile }: { mobile?: boolean }) => (
    <nav className={`flex flex-col gap-0.5 ${mobile ? 'p-4' : 'p-3'}`}>
      {NAV_SECTIONS.map((section, si) => (
        <div key={si} className={si > 0 ? 'mt-4' : ''}>
          {section.label && (
            <p className="px-3 mb-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
              {section.label}
            </p>
          )}
          {section.items.map(item => {
            const active = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {active && <ChevronRight size={14} className="ml-auto opacity-50" />}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* ── Topbar ── */}
      <header
        className="h-14 flex items-center justify-between px-4 shrink-0 sticky top-0 z-30"
        style={{ backgroundColor: '#1E1B4B' }}
      >
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden text-white/70 hover:text-white transition-colors mr-1"
            onClick={() => setSidebarOpen(v => !v)}
          >
            <Menu size={20} />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">G</span>
            </div>
            <span className="text-white font-bold text-base tracking-tight">GondolApp</span>
            <span className="text-white/40 text-xs font-medium ml-1 hidden sm:inline">Admin</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {excepciones > 0 && (
            <div className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <span>{excepciones} pendiente{excepciones !== 1 ? 's' : ''}</span>
            </div>
          )}
          <span className="text-white/60 text-sm hidden sm:inline">{nombre}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar desktop ── */}
        <aside
          className="hidden lg:flex flex-col w-52 shrink-0 min-h-screen"
          style={{ backgroundColor: '#1E1B4B' }}
        >
          <Sidebar />
        </aside>

        {/* ── Sidebar mobile overlay ── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="absolute left-0 top-0 bottom-0 w-60 flex flex-col"
              style={{ backgroundColor: '#1E1B4B' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <span className="text-white font-bold text-sm">Menú</span>
                <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <Sidebar mobile />
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>

      </div>
    </div>
  )
}
