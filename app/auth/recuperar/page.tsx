'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RecuperarPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [cargando, setCargando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setCargando(true)

    // No revelar si el email existe o no — siempre mostrar éxito
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/nueva-password`,
    })

    setCargando(false)
    setEnviado(true)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gondo-verde-400 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">G</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-gray-500 text-sm mt-1">Te enviamos un email con instrucciones</p>
        </div>

        {enviado ? (
          <div className="space-y-5">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-green-800 font-semibold text-sm mb-2">📬 Revisá tu casilla</p>
              <p className="text-green-700 text-sm leading-relaxed">
                Te enviamos un email a{' '}
                <span className="font-semibold">{email}</span>.{' '}
                Revisá tu bandeja de entrada y seguí las instrucciones.
              </p>
              <p className="text-green-600 text-xs mt-2">El link expira en 1 hora.</p>
            </div>
            <Link
              href="/auth"
              className="block w-full py-3 text-center text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              ← Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email de tu cuenta
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="email"
                inputMode="email"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={cargando || !email.trim()}
              className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              {cargando ? 'Enviando...' : 'Enviar instrucciones'}
            </button>

            <Link
              href="/auth"
              className="block w-full py-2 text-center text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              ← Volver al login
            </Link>
          </form>
        )}

      </div>
    </div>
  )
}
