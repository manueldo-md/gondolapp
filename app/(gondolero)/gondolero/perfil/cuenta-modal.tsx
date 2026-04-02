'use client'

import { useState } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { actualizarPerfil } from './actions'

interface Props {
  email: string
  nombre: string
  celular: string
}

export function CuentaModal({ email, nombre: nombreInicial, celular: celularInicial }: Props) {
  const supabase = createClient()
  const [abierto, setAbierto] = useState(false)

  // Perfil
  const [nombre, setNombre] = useState(nombreInicial)
  const [celular, setCelular] = useState(celularInicial)
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)

  // Contraseña
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [mostrarActual, setMostrarActual] = useState(false)
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [guardandoPassword, setGuardandoPassword] = useState(false)
  const [errorPassword, setErrorPassword] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<string | null>(null)

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function cerrar() {
    setAbierto(false)
    setErrorPassword(null)
    setPasswordActual('')
    setPasswordNueva('')
    setPasswordConfirm('')
  }

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardandoPerfil(true)
    await actualizarPerfil({ nombre, celular })
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

  const inputClass = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-gondo-verde-400'

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2">
          ✓ {toast}
        </div>
      )}

      {/* Botón disparador */}
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center justify-between px-4 py-3.5 w-full hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-sm text-gray-800">Editar perfil</span>
        <span className="text-gray-400 text-sm">→</span>
      </button>

      {/* Modal overlay */}
      {abierto && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">

          {/* Header del modal */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-lg font-bold text-gray-900">Editar perfil</h2>
            <button onClick={cerrar} className="p-2 text-gray-400 hover:text-gray-700">
              <X size={22} />
            </button>
          </div>

          {/* Contenido scrolleable */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">

            {/* Datos personales */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Datos personales</h3>
              <form onSubmit={handleGuardarPerfil} className="space-y-4">

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" value={email} disabled
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 text-gray-400 text-base cursor-not-allowed" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
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
                  className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {guardandoPerfil ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </form>
            </div>

            {/* Separador */}
            <div className="border-t border-gray-100" />

            {/* Cambiar contraseña */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Cambiar contraseña</h3>
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
                        className={`${inputClass} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrar(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      >
                        {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                ))}

                {errorPassword && <p className="text-red-600 text-sm">{errorPassword}</p>}

                <button
                  type="submit"
                  disabled={guardandoPassword || !passwordActual || !passwordNueva || !passwordConfirm}
                  className="w-full py-3 bg-gray-800 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {guardandoPassword ? 'Actualizando...' : 'Cambiar contraseña'}
                </button>
              </form>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
