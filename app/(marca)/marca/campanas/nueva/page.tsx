'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { crearCampana } from './actions'
import type { TipoCampana, TipoContenidoBloque } from '@/types'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Step1 {
  nombre: string
  tipo: TipoCampana
  instruccion: string
  instruccion_bloque: string
  tipo_contenido: TipoContenidoBloque
  puntos_por_foto: string
}

interface Step2 {
  fecha_inicio: string
  fecha_fin: string
  objetivo_comercios: string
  max_comercios_por_gondolero: string
  min_comercios_para_cobrar: string
}

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPOS: { value: TipoCampana; label: string }[] = [
  { value: 'relevamiento', label: 'Relevamiento'  },
  { value: 'precio',       label: 'Precio'        },
  { value: 'cobertura',    label: 'Cobertura'     },
  { value: 'pop',          label: 'POP'           },
  { value: 'mapa',         label: 'Mapa'          },
  { value: 'comercios',    label: 'Comercios'     },
]

const TIPO_CONTENIDO: { value: TipoContenidoBloque; label: string }[] = [
  { value: 'propios',      label: 'Solo mis productos'                      },
  { value: 'competencia',  label: 'Solo competencia'                        },
  { value: 'ambos',        label: 'Mis productos y competencia'             },
  { value: 'ninguno',      label: 'Sin productos (stands, comercios, etc.)' },
]

// ── Componente ────────────────────────────────────────────────────────────────

export default function NuevaCampanaPage() {
  const router = useRouter()
  const [paso, setPaso] = useState<1 | 2>(1)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [zonas, setZonas] = useState<{ id: string; nombre: string; tipo: string }[]>([])
  const [zonasSeleccionadas, setZonasSeleccionadas] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('zonas').select('id, nombre, tipo').order('tipo').order('nombre').then(({ data }) => setZonas(data ?? []))
  }, [])

  const [s1, setS1] = useState<Step1>({
    nombre:             '',
    tipo:               'relevamiento',
    instruccion:        '',
    instruccion_bloque: '',
    tipo_contenido:     'propios',
    puntos_por_foto:    '5',
  })

  const [s2, setS2] = useState<Step2>({
    fecha_inicio:               '',
    fecha_fin:                  '',
    objetivo_comercios:         '',
    max_comercios_por_gondolero: '20',
    min_comercios_para_cobrar:  '3',
  })

  const paso1Valido = s1.nombre.trim().length >= 3 && s1.tipo

  const handleSubmit = () => {
    setErrorMsg(null)
    const fd = new FormData()
    Object.entries(s1).forEach(([k, v]) => fd.set(k, v))
    Object.entries(s2).forEach(([k, v]) => fd.set(k, v))
    zonasSeleccionadas.forEach(id => fd.append('zona_ids', id))

    startTransition(async () => {
      const result = await crearCampana(fd)
      if (result?.error) setErrorMsg(result.error)
    })
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => paso === 2 ? setPaso(1) : router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Nueva campaña</h2>
          <p className="text-sm text-gray-400">Paso {paso} de 2</p>
        </div>
      </div>

      {/* Indicador de pasos */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2].map(n => (
          <div key={n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              n < paso
                ? 'bg-gondo-indigo-600 text-white'
                : n === paso
                  ? 'bg-gondo-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {n < paso ? <Check size={13} /> : n}
            </div>
            <span className={`text-sm font-medium ${n === paso ? 'text-gray-900' : 'text-gray-400'}`}>
              {n === 1 ? 'Detalles' : 'Objetivos'}
            </span>
            {n < 2 && <div className="w-8 h-px bg-gray-200 ml-1" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* ── Paso 1 ── */}
        {paso === 1 && (
          <>
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nombre de la campaña <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={s1.nombre}
                onChange={e => setS1(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej: Relevamiento Agosto 2025"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tipo de campaña <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setS1(p => ({ ...p, tipo: t.value }))}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      s1.tipo === t.value
                        ? 'bg-gondo-indigo-600 text-white border-gondo-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gondo-indigo-600 hover:text-gondo-indigo-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Instrucción general */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Instrucción general
              </label>
              <textarea
                value={s1.instruccion}
                onChange={e => setS1(p => ({ ...p, instruccion: e.target.value }))}
                placeholder="Qué deben hacer los gondoleros en esta campaña..."
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
              />
            </div>

            {/* Instrucción del bloque */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Instrucción de la foto
              </label>
              <input
                type="text"
                value={s1.instruccion_bloque}
                onChange={e => setS1(p => ({ ...p, instruccion_bloque: e.target.value }))}
                placeholder="Ej: Fotografiar toda la góndola de lácteos"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
              />
            </div>

            {/* Tipo de contenido */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contenido a fotografiar
              </label>
              <div className="space-y-2">
                {TIPO_CONTENIDO.map(tc => (
                  <label key={tc.value} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="tipo_contenido"
                      value={tc.value}
                      checked={s1.tipo_contenido === tc.value}
                      onChange={() => setS1(p => ({ ...p, tipo_contenido: tc.value }))}
                      className="accent-gondo-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{tc.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Puntos por foto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Puntos por foto
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={s1.puntos_por_foto}
                  onChange={e => setS1(p => ({ ...p, puntos_por_foto: e.target.value }))}
                  className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
                />
                <span className="text-sm text-gray-500">puntos por foto aprobada</span>
              </div>
            </div>
          </>
        )}

        {/* ── Paso 2 ── */}
        {paso === 2 && (
          <>
            {/* Fechas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={s2.fecha_inicio}
                  onChange={e => setS2(p => ({ ...p, fecha_inicio: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Fecha de cierre
                </label>
                <input
                  type="date"
                  value={s2.fecha_fin}
                  onChange={e => setS2(p => ({ ...p, fecha_fin: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
                />
              </div>
            </div>

            {/* Objetivo de comercios */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Objetivo de comercios
              </label>
              <input
                type="number"
                min={1}
                value={s2.objetivo_comercios}
                onChange={e => setS2(p => ({ ...p, objetivo_comercios: e.target.value }))}
                placeholder="Ej: 100"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
              />
              <p className="text-xs text-gray-400 mt-1">Cantidad total de comercios que querés relevar</p>
            </div>

            {/* Límites por gondolero */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Máx. comercios por gondolero
                </label>
                <input
                  type="number"
                  min={1}
                  value={s2.max_comercios_por_gondolero}
                  onChange={e => setS2(p => ({ ...p, max_comercios_por_gondolero: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Mín. para cobrar
                </label>
                <input
                  type="number"
                  min={1}
                  value={s2.min_comercios_para_cobrar}
                  onChange={e => setS2(p => ({ ...p, min_comercios_para_cobrar: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
                />
              </div>
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
                        className="w-4 h-4 accent-gondo-indigo-600 shrink-0"
                      />
                      <span className="text-sm text-gray-700">{z.nombre}</span>
                      <span className="ml-auto text-[10px] text-gray-400 capitalize">{z.tipo}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Aviso de costo */}
            <div className="bg-gondo-indigo-50 rounded-lg p-3.5">
              <p className="text-sm font-semibold text-gondo-indigo-600 mb-0.5">
                Costo de creación: 15 tokens
              </p>
              <p className="text-xs text-gondo-indigo-400">
                Se descontarán automáticamente de tu saldo al confirmar.
              </p>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">{errorMsg}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Botones de navegación */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => paso === 2 ? setPaso(1) : router.back()}
          className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          {paso === 1 ? 'Cancelar' : 'Volver'}
        </button>

        {paso === 1 ? (
          <button
            onClick={() => setPaso(2)}
            disabled={!paso1Valido}
            className="flex items-center gap-2 px-5 py-2.5 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-gondo-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continuar
            <ArrowRight size={15} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-gondo-indigo-400 transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Check size={15} />
                Crear campaña
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
