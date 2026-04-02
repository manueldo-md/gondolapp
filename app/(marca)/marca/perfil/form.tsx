'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { actualizarPerfilMarca } from './actions'

interface Props {
  email: string
  nombre: string
  celular: string
}

export function EditarPerfilMarcaForm({ email, nombre: nombreInicial, celular: celularInicial }: Props) {
  const supabase = createClient()

  const [nombre, setNombre] = useState(nombreInicial)
  const [celular, setCelular] = useState(celularInicial)
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)
  const [perfilOk, setPerfilOk] = useState(false)
  const [, startTransition] = useTransition()

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
    setPerfilOk(false)
    startTransition(async () => {
      await actualizarPerfilMarca({ nombre, celular })
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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: passwordActual,
    })

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
    setPasswordOk(true)
  }

  const inputClass = 'w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600 text-sm'
  const btnClass = 'px-5 py-2.5 bg-gondo-indigo-600 hover:bg-gondo-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors'

  return (
    <div className="space-y-6">

      {/* Datos de contacto */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Datos de contacto</h2>
        <form onSubmit={handleGuardarPerfil} className="space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" value={email} disabled
              className="w-full px-4 py-2.5 border border-gray-100 rounded-lg bg-gray-50 text-gray-400 text-sm cursor-not-allowed" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre de contacto</label>
            <input type="text" value={nombre}
              onChange={e => { setNombre(e.target.value); setPerfilOk(false) }}
              placeholder="Tu nombre" required className={inputClass} autoComplete="name" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Celular <span className="text-gray-300">(opcional)</span>
            </label>
            <input type="tel" value={celular}
              onChange={e => { setCelular(e.target.value); setPerfilOk(false) }}
              placeholder="11 2345-6789" className={inputClass} autoComplete="tel" inputMode="tel" />
          </div>

          {perfilOk && <p className="text-green-600 text-sm font-medium">✓ Datos actualizados</p>}

          <button type="submit" disabled={guardandoPerfil || !nombre.trim()} className={btnClass}>
            {guardandoPerfil ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>

      {/* Contraseña */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Cambiar contraseña</h2>
        <form onSubmit={handleCambiarPassword} className="space-y-4">

          {[
            { label: 'Contraseña actual', value: passwordActual, setter: setPasswordActual, mostrar: mostrarActual, setMostrar: setMostrarActual, ac: 'current-password', placeholder: 'Tu contraseña actual' },
            { label: 'Nueva contraseña', value: passwordNueva, setter: setPasswordNueva, mostrar: mostrarNueva, setMostrar: setMostrarNueva, ac: 'new-password', placeholder: 'Mínimo 6 caracteres' },
            { label: 'Confirmar nueva contraseña', value: passwordConfirm, setter: setPasswordConfirm, mostrar: mostrarConfirm, setMostrar: setMostrarConfirm, ac: 'new-password', placeholder: 'Repetí la nueva contraseña' },
          ].map(({ label, value, setter, mostrar, setMostrar, ac, placeholder }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <div className="relative">
                <input type={mostrar ? 'text' : 'password'} value={value}
                  onChange={e => { setter(e.target.value); setPasswordOk(false) }}
                  placeholder={placeholder} autoComplete={ac}
                  className={`${inputClass} pr-10`} />
                <button type="button" onClick={() => setMostrar(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          {errorPassword && <p className="text-red-600 text-sm">{errorPassword}</p>}
          {passwordOk && <p className="text-green-600 text-sm font-medium">✓ Contraseña actualizada</p>}

          <button type="submit"
            disabled={guardandoPassword || !passwordActual || !passwordNueva || !passwordConfirm}
            className={btnClass}>
            {guardandoPassword ? 'Actualizando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>

    </div>
  )
}
