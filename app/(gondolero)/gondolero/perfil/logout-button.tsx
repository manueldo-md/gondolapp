'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  return (
    <button
      onClick={cerrarSesion}
      className="flex items-center gap-3 w-full px-4 py-4 bg-white border border-gray-200 rounded-2xl text-red-500 font-semibold hover:bg-red-50 transition-colors min-h-touch"
    >
      <LogOut size={18} />
      Cerrar sesión
    </button>
  )
}
