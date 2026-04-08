'use client'

import { useState, useTransition } from 'react'
import { X, Loader2, Eye, EyeOff, UserPlus } from 'lucide-react'
import { crearUsuario } from './actions'
import type { TipoActor } from '@/types'

const TIPOS: Array<{ value: TipoActor; label: string }> = [
  { value: 'gondolero',    label: 'Gondolero' },
  { value: 'fixer',        label: 'Fixer' },
  { value: 'distribuidora',label: 'Distribuidora' },
  { value: 'marca',        label: 'Marca' },
  { value: 'repositora',   label: 'Repositora' },
  { value: 'admin',        label: 'Admin' },
]

export function NuevoUsuarioModal({
  distribuidoras,
  marcas,
  repositoras,
}: {
  distribuidoras: { id: string; razon_social: string }[]
  marcas: { id: string; razon_social: string }[]
  repositoras: { id: string; razon_social: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mostrarPass, setMostrarPass] = useState(false)

  const [form, setForm] = useState({
    email: '',
    password: '',
    nombre: '',
    tipo_actor: 'gondolero' as TipoActor,
    distri_id: '',
    marca_id: '',
    repositora_id: '',
  })

  const set = (k: keyof typeof form, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = () => {
    setError(null)
    if (!form.email || !form.password || !form.nombre) {
      setError('Email, contraseña y nombre son obligatorios.')
      return
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    startTransition(async () => {
      const result = await crearUsuario({
        email: form.email.trim(),
        password: form.password,
        nombre: form.nombre.trim(),
        tipo_actor: form.tipo_actor,
        distri_id: form.distri_id || null,
        marca_id: form.marca_id || null,
        repositora_id: form.repositora_id || null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      setForm({ email: '', password: '', nombre: '', tipo_actor: 'gondolero', distri_id: '', marca_id: '', repositora_id: '' })
    })
  }

  const mostrarDistri    = form.tipo_actor === 'gondolero' || form.tipo_actor === 'distribuidora'
  const mostrarMarca     = form.tipo_actor === 'marca'
  const mostrarRepo      = form.tipo_actor === 'fixer' || form.tipo_actor === 'repositora'
  const mostrarDistriFixer = form.tipo_actor === 'fixer'

  return (
    <>
      <button
        onClick={() => { setError(null); setOpen(true) }}
        className="flex items-center gap-2 px-4 py-2 bg-[#1E1B4B] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
      >
        <UserPlus size={15} />
        Nuevo usuario
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 text-base">Nuevo usuario</h3>
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Tipo de actor */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Tipo de actor
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set('tipo_actor', t.value)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                        form.tipo_actor === t.value
                          ? 'border-[#1E1B4B] bg-[#1E1B4B]/5 text-[#1E1B4B]'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Nombre
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => set('nombre', e.target.value)}
                  placeholder="Nombre completo o razón social"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="usuario@email.com"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                  autoComplete="off"
                />
              </div>

              {/* Contraseña */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={mostrarPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {mostrarPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Distribuidora (gondolero / distribuidora) */}
              {mostrarDistri && distribuidoras.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Distribuidora <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                  </label>
                  <select
                    value={form.distri_id}
                    onChange={e => set('distri_id', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                  >
                    <option value="">Sin distribuidora</option>
                    {distribuidoras.map(d => (
                      <option key={d.id} value={d.id}>{d.razon_social}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Distribuidora (fixer puede estar vinculado a una distri también) */}
              {mostrarDistriFixer && distribuidoras.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Distribuidora <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                  </label>
                  <select
                    value={form.distri_id}
                    onChange={e => set('distri_id', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                  >
                    <option value="">Sin distribuidora</option>
                    {distribuidoras.map(d => (
                      <option key={d.id} value={d.id}>{d.razon_social}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Repositora (fixer / repositora) */}
              {mostrarRepo && repositoras.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Repositora <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                  </label>
                  <select
                    value={form.repositora_id}
                    onChange={e => set('repositora_id', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                  >
                    <option value="">Sin repositora</option>
                    {repositoras.map(r => (
                      <option key={r.id} value={r.id}>{r.razon_social}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Marca */}
              {mostrarMarca && marcas.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Marca <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                  </label>
                  <select
                    value={form.marca_id}
                    onChange={e => set('marca_id', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]"
                  >
                    <option value="">Sin marca</option>
                    {marcas.map(m => (
                      <option key={m.id} value={m.id}>{m.razon_social}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 py-2.5 bg-[#1E1B4B] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isPending ? <Loader2 size={15} className="animate-spin" /> : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
