'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, User } from 'lucide-react'

export default function PerfilPage() {
  const router = useRouter()
  const supabase = createClient()

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-2">
          <User size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Mi perfil</h1>
        </div>
      </div>

      <div className="px-4 py-6">
        <button
          onClick={cerrarSesion}
          className="flex items-center gap-3 w-full px-4 py-4 bg-white border border-gray-200 rounded-2xl text-red-600 font-semibold hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
