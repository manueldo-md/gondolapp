'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { actualizarCuentaRepo } from './actions'

interface Props {
  email: string
  nombre: string
  celular: string
  razonSocial: string
  cuit: string
}

export function CuentaRepoForm({ email, nombre: nombreInicial, celular: celularInicial, razonSocial, cuit }: Props) {
  const supabase = createClient()

  const [nombre, setNombre] = useState(nombreInicial)
  const [celular, setCelular] = useState(celularInicial)
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)

  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [mostrarActual, setMostrarActual] = useState(false)
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [guardandoPassword, setGuardandoPassword] = useState(false)
  const [errorPassword, setErrorPassword] = useState<string | null>(null)

  const [toast, setToast] = useState<string | null>(null)

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardandoPerfil(true)
    await actualizarCuentaRepo({ nombre, celular })
    setGuardandoPerfil(false)
    mostrarToast('¡Perfil actualizado!')
  }

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorPassword(null)

    if (passwordNueva.length < 6) {
      setErrorPassword('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (passwordNueva !== passwordConfirm) {
      setErrorPassword('Las contraseñas no coinciden.')
      return
    }

    setGuardandoPassword(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: passwordActual })
    if (signInError) {
      setErrorPassword('La contraseña actual es incorrecta.')
      setGuardandoPassword(false)
      return
    }

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
    mostrarToast('¡Contraseña actualizada!')
  }

  const inputClass = 'w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm'
  const readonlyClass = 'w-full px-4 py-2.5 border border-gray-100 rounded-lg bg-gray-50 text-gray-400 text-sm cursor-not-allowed'

  return (
    <div className="space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg">
          ✓ {toast}
        </div>
      )}

      {/* Empresa (solo lectura) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Datos de la repositora</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Razón social</label>
            <input type="text" value={razonSocial || '—'} disabled className={readonlyClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">CUIT</label>
            <input type="text" value={cuit || '—'} disabled className={readonlyClass} />
          </div>
        </div>
      </div>

      {/* Datos de contacto */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Datos de contacto</h2>
        <form onSubmit={handleGuardarPerfil} className="space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" value={email} disabled className={readonlyClass} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre de contacto</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Tu nombre"
              required
              className={inputClass}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Celular <span className="text-gray-300">(opcional)</span>
            </label>
            <input
              type="tel"
              value={celular}
              onChange={e => setCelular(e.target.value)}
              placeholder="11 2345-6789"
              className={inputClass}
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          <button
            type="submit"
            disabled={guardandoPerfil || !nombre.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {guardandoPerfil ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>

      {/* Contraseña */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Cambiar contraseña</h2>
        <form onSubmit={handleCambiarPassword} className="space-y-4">

          {[
            { label: 'Contraseña actual', value: passwordActual, setter: setPasswordActual, mostrar: mostrarActual, setMostrar: setMostrarActual, ac: 'current-password', ph: 'Tu contraseña actual' },
            { label: 'Nueva contraseña', value: passwordNueva, setter: setPasswordNueva, mostrar: mostrarNueva, setMostrar: setMostrarNueva, ac: 'new-password', ph: 'Mínimo 6 caracteres' },
            { label: 'Confirmar nueva contraseña', value: passwordConfirm, setter: setPasswordConfirm, mostrar: mostrarConfirm, setMostrar: setMostrarConfirm, ac: 'new-password', ph: 'Repetí la nueva contraseña' },
          ].map(({ label, value, setter, mostrar, setMostrar, ac, ph }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <div className="relative">
                <input
                  type={mostrar ? 'text' : 'password'}
                  value={value}
                  onChange={e => setter(e.target.value)}
                  placeholder={ph}
                  autoComplete={ac}
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setMostrar(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          {errorPassword && <p className="text-red-600 text-sm">{errorPassword}</p>}

          <button
            type="submit"
            disabled={guardandoPassword || !passwordActual || !passwordNueva || !passwordConfirm}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {guardandoPassword ? 'Actualizando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>

    </div>
  )
}
