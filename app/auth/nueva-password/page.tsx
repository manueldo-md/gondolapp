'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function NuevaPasswordPage() {
  const supabase = createClient()
  const router = useRouter()

  const [tokenValido, setTokenValido] = useState(false)
  const [tokenExpirado, setTokenExpirado] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Escuchar el evento PASSWORD_RECOVERY que Supabase dispara
    // cuando detecta un token de recuperación válido en el hash de la URL
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTokenValido(true)
      }
    })

    // Si el token es inválido o expirado, PASSWORD_RECOVERY nunca se dispara.
    // Después de 4 segundos sin recibirlo, mostrar el estado de error.
    const timeout = setTimeout(() => {
      setTokenValido(prev => {
        if (!prev) setTokenExpirado(true)
        return prev
      })
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setCargando(true)

    const { error: err } = await supabase.auth.updateUser({ password })

    if (err) {
      setError('No se pudo actualizar la contraseña. Intentá de nuevo.')
      setCargando(false)
      return
    }

    // El middleware redirige al panel correcto según tipo_actor
    router.push('/')
    router.refresh()
  }

  // ── Token expirado / inválido ──────────────────────────────────────────────
  if (tokenExpirado) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center mb-2">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gondo-verde-400 rounded-2xl mb-4">
              <span className="text-white text-2xl font-bold">G</span>
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-800 font-semibold text-sm mb-1">Link expirado o inválido</p>
            <p className="text-red-600 text-sm">
              El link expiró o ya fue usado. Pedí uno nuevo.
            </p>
          </div>
          <a
            href="/auth/recuperar"
            className="block w-full py-3 text-center bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors min-h-touch"
          >
            Pedir nuevo link
          </a>
          <a
            href="/auth"
            className="block w-full py-2 text-center text-gray-500 text-sm hover:text-gray-700 transition-colors"
          >
            ← Volver al login
          </a>
        </div>
      </div>
    )
  }

  // ── Loading mientras se verifica el token ─────────────────────────────────
  if (!tokenValido) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gondo-verde-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Formulario de nueva contraseña ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gondo-verde-400 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">G</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva contraseña</h1>
          <p className="text-gray-500 text-sm mt-1">Elegí una contraseña segura</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={mostrarPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirmar contraseña
            </label>
            <div className="relative">
              <input
                type={mostrarConfirm ? 'text' : 'password'}
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                placeholder="Repetí tu contraseña"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setMostrarConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {mostrarConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
          >
            {cargando ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>

      </div>
    </div>
  )
}
