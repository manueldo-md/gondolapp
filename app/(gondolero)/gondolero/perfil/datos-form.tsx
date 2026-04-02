'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { actualizarPerfil } from './actions'

export function DatosForm({
  nombre: nombreInicial,
  celular: celularInicial,
  email,
}: {
  nombre: string
  celular: string
  email: string
}) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [celular, setCelular] = useState(celularInicial)
  const [toast, setToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleGuardar = () => {
    if (!nombre.trim()) return
    startTransition(async () => {
      await actualizarPerfil({ nombre: nombre.trim(), celular: celular.trim() || undefined })
      setToast('Cambios guardados')
      setTimeout(() => setToast(null), 3000)
    })
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Email
        </label>
        <input
          type="email"
          value={email}
          disabled
          className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-400 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Nombre completo
        </label>
        <input
          type="text"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Celular
        </label>
        <input
          type="tel"
          value={celular}
          onChange={e => setCelular(e.target.value)}
          placeholder="Ej: 3442 123456"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-sm"
        />
      </div>

      <button
        onClick={handleGuardar}
        disabled={isPending || !nombre.trim()}
        className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
      >
        {isPending && <Loader2 size={14} className="animate-spin" />}
        {isPending ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  )
}
