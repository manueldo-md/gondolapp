'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { crearRepositora } from './actions'

export default function NuevaRepositoraPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ razon_social: '', cuit: '' })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (form.razon_social.trim().length < 2) {
      setErrorMsg('La razón social debe tener al menos 2 caracteres.')
      return
    }
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v))
    startTransition(async () => {
      const result = await crearRepositora(fd)
      if (result?.error) setErrorMsg(result.error)
    })
  }

  const ring = 'focus:ring-2 focus:ring-[#1E1B4B]/20 focus:border-[#1E1B4B]'
  const inputClass = `w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Nueva repositora</h2>
          <p className="text-sm text-gray-400">Crear una repositora en el sistema</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Razón social <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.razon_social}
            onChange={set('razon_social')}
            placeholder="Ej: Repositora Norte S.A."
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            CUIT <span className="text-gray-400 font-normal text-xs">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.cuit}
            onChange={set('cuit')}
            placeholder="20-12345678-9"
            className={inputClass}
          />
        </div>

        {errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {errorMsg}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || !form.razon_social.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1E1B4B] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2a6e] transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Creando...
              </>
            ) : (
              'Crear repositora'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
