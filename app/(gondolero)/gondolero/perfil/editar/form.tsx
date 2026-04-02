'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { actualizarPerfil } from '../actions'

interface Props {
  email: string
  nombre: string
  celular: string
}

export function EditarPerfilGondoleroForm({ email, nombre: nombreInicial, celular: celularInicial }: Props) {
  const supabase = createClient()

  // Datos personales
  const [nombre, setNombre] = useState(nombreInicial)
  const [celular, setCelular] = useState(celularInicial)
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)
  const [perfilOk, setPerfilOk] = useState(false)
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Cambio de contraseña
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [mostrarActual, setMostrarActual] = useState(false)
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [guardandoPassword, setGuardandoPassword] = useState(false)
  const [passwordOk, setPasswordOk] = useState(false)
  const [errorPassword, setErrorPassword] = useState<string | null>(null)

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardandoPerfil(true)
    setErrorPerfil(null)
    setPerfilOk(false)

    startTransition(async () => {
      await actualizarPerfil({ nombre, celular })
      setGuardandoPerfil(false)
      setPerfilOk(true)
    })
  }

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorPassword(null)
    setPasswordOk(false)

    if (passwordNueva.length < 6) {
      setErrorPassword('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (passwordNueva !== passwordConfirm) {
      setErrorPassword('Las contraseñas no coinciden.')
      return
    }

    setGuardandoPassword(true)

    // Verificar contraseña actual
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: passwordActual,
    })

    if (signInError) {
      setErrorPassword('La contraseña actual es incorrecta.')
      setGuardandoPassword(false)
      return
    }

    // Actualizar contraseña
    const { error: updateError } = await supabase.auth.updateUser({ password: passwordNueva })

    if (updateError) {
      setErrorPassword('No se pudo cambiar la contraseña. Intentá de nuevo.')
      setGuardandoPassword(false)
      return
    }

    setPasswordActual('')
    setPasswordNueva('')
    setPasswordConfirm('')
    setGuardandoPassword(false)
    setPasswordOk(true)
  }

  return (
    <div className="space-y-6">

      {/* ── Datos del perfil ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Datos personales</h2>
        <form onSubmit={handleGuardarPerfil} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 text-gray-400 text-base cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nombre completo
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => { setNombre(e.target.value); setPerfilOk(false) }}
              placeholder="Tu nombre"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Celular <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="tel"
              value={celular}
              onChange={e => { setCelular(e.target.value); setPerfilOk(false) }}
              placeholder="11 2345-6789"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          {errorPerfil && (
            <p className="text-red-600 text-sm">{errorPerfil}</p>
          )}
          {perfilOk && (
            <p className="text-green-600 text-sm font-medium">✓ Perfil actualizado</p>
          )}

          <button
            type="submit"
            disabled={guardandoPerfil || !nombre.trim()}
            className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
          >
            {guardandoPerfil ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>

      {/* ── Cambiar contraseña ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Cambiar contraseña</h2>
        <form onSubmit={handleCambiarPassword} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Contraseña actual
            </label>
            <div className="relative">
              <input
                type={mostrarActual ? 'text' : 'password'}
                value={passwordActual}
                onChange={e => { setPasswordActual(e.target.value); setPasswordOk(false) }}
                placeholder="Tu contraseña actual"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setMostrarActual(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {mostrarActual ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={mostrarNueva ? 'text' : 'password'}
                value={passwordNueva}
                onChange={e => { setPasswordNueva(e.target.value); setPasswordOk(false) }}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setMostrarNueva(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {mostrarNueva ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirmar nueva contraseña
            </label>
            <div className="relative">
              <input
                type={mostrarConfirm ? 'text' : 'password'}
                value={passwordConfirm}
                onChange={e => { setPasswordConfirm(e.target.value); setPasswordOk(false) }}
                placeholder="Repetí la nueva contraseña"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setMostrarConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {mostrarConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {errorPassword && (
            <p className="text-red-600 text-sm">{errorPassword}</p>
          )}
          {passwordOk && (
            <p className="text-green-600 text-sm font-medium">✓ Contraseña actualizada</p>
          )}

          <button
            type="submit"
            disabled={guardandoPassword || !passwordActual || !passwordNueva || !passwordConfirm}
            className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
          >
            {guardandoPassword ? 'Actualizando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>

    </div>
  )
}
