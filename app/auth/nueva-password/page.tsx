'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NuevaPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [tokenValido, setTokenValido] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  useEffect(() => {
    // Supabase procesa el hash automáticamente
    // y dispara el evento PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setTokenValido(true)
          setCargando(false)
        } else if (event === 'SIGNED_IN' && session) {
          // También puede venir como SIGNED_IN
          setTokenValido(true)
          setCargando(false)
        }
      }
    )

    // Timeout por si el evento no llega
    const timeout = setTimeout(() => {
      setCargando(false)
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [supabase])

  const handleGuardar = async () => {
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }

    const { error: err } = await supabase.auth.updateUser({
      password
    })

    if (err) {
      setError('No se pudo actualizar la contraseña. Pedí un nuevo link.')
      return
    }

    setExito(true)
    setTimeout(() => router.push('/'), 2000)
  }

  if (cargando) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Verificando...</p>
    </div>
  )

  if (exito) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-semibold mb-2">¡Contraseña actualizada!</h2>
        <p className="text-gray-500">Redirigiendo...</p>
      </div>
    </div>
  )

  if (!tokenValido) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">⏱️</div>
        <h2 className="text-xl font-semibold mb-2">Link expirado o inválido</h2>
        <p className="text-gray-500 mb-6">
          El link expiró o ya fue usado. Pedí uno nuevo.
        </p>
        <a
          href="/auth/recuperar"
          className="block w-full py-3 bg-green-600 text-white font-medium rounded-xl text-center"
        >
          Pedir nuevo link
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2">Nueva contraseña</h1>
        <p className="text-gray-500 mb-6">
          Elegí una contraseña segura de al menos 6 caracteres.
        </p>

        <div className="space-y-4">
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-400"
          />

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            onClick={handleGuardar}
            className="w-full py-3 bg-green-600 text-white font-medium rounded-xl"
          >
            Guardar nueva contraseña
          </button>
        </div>
      </div>
    </div>
  )
}
