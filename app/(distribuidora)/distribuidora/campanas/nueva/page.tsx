'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { crearCampanaInterna } from './actions'

export default function NuevaCampanaPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [zonas, setZonas] = useState<{ id: string; nombre: string; tipo: string }[]>([])
  const [zonasSeleccionadas, setZonasSeleccionadas] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('zonas').select('id, nombre, tipo').order('tipo').order('nombre').then(({ data }) => setZonas(data ?? []))
  }, [])

  const [form, setForm] = useState({
    nombre:                      '',
    instruccion:                 '',
    tipo_contenido:              'propios',
    puntos_por_foto:             '5',
    fecha_inicio:                '',
    fecha_fin:                   '',
    objetivo_comercios:          '',
    max_comercios_por_gondolero: '20',
    min_comercios_para_cobrar:   '3',
    nivel_minimo:                'casual',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (form.nombre.trim().length < 3) { setErrorMsg('El nombre debe tener al menos 3 caracteres.'); return }

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v))
    zonasSeleccionadas.forEach(id => fd.append('zona_ids', id))

    startTransition(async () => {
      const result = await crearCampanaInterna(fd)
      if (result?.error) setErrorMsg(result.error)
    })
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Nueva campaña interna</h2>
          <p className="text-sm text-gray-400">Sin costo de tokens — uso interno</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nombre <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={set('nombre')}
              placeholder="Ej: Relevamiento Concordia - Agosto"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
            />
          </div>

          {/* Instrucción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Instrucción para el gondolero
            </label>
            <textarea
              value={form.instruccion}
              onChange={set('instruccion')}
              rows={3}
              placeholder="Qué deben fotografiar y cómo hacerlo..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
            />
          </div>

          {/* Tipo de contenido */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tipo de contenido del bloque
            </label>
            <select
              value={form.tipo_contenido}
              onChange={set('tipo_contenido')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition bg-white"
            >
              <option value="propios">Solo mis productos</option>
              <option value="competencia">Solo competencia</option>
              <option value="ambos">Mis productos y competencia</option>
              <option value="ninguno">Sin productos (stands, comercios, etc.)</option>
            </select>
          </div>

          {/* Puntos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Puntos por foto aprobada
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={500}
                value={form.puntos_por_foto}
                onChange={set('puntos_por_foto')}
                className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
              <span className="text-sm text-gray-500">puntos por foto</span>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha de inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={set('fecha_inicio')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha de cierre</label>
              <input
                type="date"
                value={form.fecha_fin}
                onChange={set('fecha_fin')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
            </div>
          </div>

          {/* Objetivo y límites */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Objetivo de comercios
            </label>
            <input
              type="number"
              min={1}
              value={form.objetivo_comercios}
              onChange={set('objetivo_comercios')}
              placeholder="Ej: 50"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Máx. por gondolero</label>
              <input
                type="number"
                min={1}
                value={form.max_comercios_por_gondolero}
                onChange={set('max_comercios_por_gondolero')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mín. para cobrar</label>
              <input
                type="number"
                min={1}
                value={form.min_comercios_para_cobrar}
                onChange={set('min_comercios_para_cobrar')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
            </div>
          </div>

          {/* Nivel mínimo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nivel mínimo requerido
            </label>
            <select
              value={form.nivel_minimo}
              onChange={set('nivel_minimo')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition bg-white"
            >
              <option value="casual">Casual (todos)</option>
              <option value="activo">Activo (50+ fotos aprobadas)</option>
              <option value="pro">Pro (150+ fotos aprobadas)</option>
            </select>
          </div>

          {/* Zonas */}
          {zonas.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Zonas de la campaña <span className="text-gray-400 font-normal">(opcional — vacío = todas)</span>
              </label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                {zonas.map(z => (
                  <label key={z.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={zonasSeleccionadas.includes(z.id)}
                      onChange={() => setZonasSeleccionadas(prev =>
                        prev.includes(z.id) ? prev.filter(x => x !== z.id) : [...prev, z.id]
                      )}
                      className="w-4 h-4 accent-gondo-amber-400 shrink-0"
                    />
                    <span className="text-sm text-gray-700">{z.nombre}</span>
                    <span className="ml-auto text-[10px] text-gray-400 capitalize">{z.tipo}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-gondo-amber-400 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? <><Loader2 size={15} className="animate-spin" /> Creando...</> : <><Check size={15} /> Crear campaña</>}
          </button>
        </div>
      </form>
    </div>
  )
}
