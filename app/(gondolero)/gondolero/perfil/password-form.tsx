'use client'

import { useState } from 'react'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function PasswordForm({ email }: { email: string }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrarActual, setMostrarActual] = useState(false)
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const mostrarToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const handleGuardar = async () => {
    if (!actual || !nueva || !confirmar) return
    if (nueva !== confirmar) { mostrarToast('Las contraseñas no coinciden.', false); return }
    if (nueva.length < 6) { mostrarToast('La nueva contraseña debe tener al menos 6 caracteres.', false); return }

    setCargando(true)
    const supabase = createClient()

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: actual })
    if (loginError) {
      setCargando(false)
      mostrarToast('La contraseña actual es incorrecta.', false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: nueva })
    setCargando(false)

    if (updateError) {
      mostrarToast('No se pudo actualizar la contraseña. Intentá de nuevo.', false)
    } else {
      setActual(''); setNueva(''); setConfirmar('')
      mostrarToast('Contraseña actualizada.', true)
    }
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg ${
          toast.ok ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Contraseña actual */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Contraseña actual
        </label>
        <div className="relative">
          <input
            type={mostrarActual ? 'text' : 'password'}
            value={actual}
            onChange={e => setActual(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-sm pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarActual(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {mostrarActual ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Nueva contraseña */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Nueva contraseña
        </label>
        <div className="relative">
          <input
            type={mostrarNueva ? 'text' : 'password'}
            value={nueva}
            onChange={e => setNueva(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-sm pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarNueva(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {mostrarNueva ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Confirmar */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Confirmar nueva contraseña
        </label>
        <input
          type="password"
          value={confirmar}
          onChange={e => setConfirmar(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-sm"
        />
      </div>

      <button
        onClick={handleGuardar}
        disabled={cargando || !actual || !nueva || !confirmar}
        className="w-full py-3 bg-gray-800 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
      >
        {cargando && <Loader2 size={14} className="animate-spin" />}
        {cargando ? 'Actualizando...' : 'Cambiar contraseña'}
      </button>
    </div>
  )
}
