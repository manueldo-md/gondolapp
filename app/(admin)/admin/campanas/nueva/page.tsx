'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { crearCampanaAdmin } from './actions'
import type { TipoCampana, TipoContenidoBloque } from '@/types'
import { CamposBloqueBuilder, type CampoBloque } from '@/components/shared/campos-bloque-builder'
import { SelectorZona, type GrupoZona } from '@/components/shared/selector-zona'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Step1 {
  nombre: string
  tipo: TipoCampana
  instruccion: string
  instruccion_bloque: string
  tipo_contenido: TipoContenidoBloque
  puntos_por_foto: string
  solicitar_precio: boolean
  actor_campana: 'gondolero' | 'fixer'
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
  { value: 'relevamiento', label: 'Relevamiento' },
  { value: 'precio',       label: 'Precio'       },
  { value: 'cobertura',    label: 'Cobertura'    },
  { value: 'pop',          label: 'POP'          },
  { value: 'mapa',         label: 'Mapa'         },
  { value: 'comercios',    label: 'Comercios'    },
]

const TIPO_CONTENIDO: { value: TipoContenidoBloque; label: string }[] = [
  { value: 'propios',     label: 'Solo mis productos'                      },
  { value: 'competencia', label: 'Solo competencia'                        },
  { value: 'ambos',       label: 'Mis productos y competencia'             },
  { value: 'ninguno',     label: 'Sin productos (stands, comercios, etc.)' },
]

// ── Componente ────────────────────────────────────────────────────────────────

export default function NuevaCampanaAdminPage() {
  const router = useRouter()
  const [paso, setPaso] = useState<1 | 2>(1)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [grupos, setGrupos] = useState<GrupoZona[]>([])
  const [campos, setCampos] = useState<CampoBloque[]>([])

  const [s1, setS1] = useState<Step1>({
    nombre:             '',
    tipo:               'relevamiento',
    instruccion:        '',
    instruccion_bloque: '',
    tipo_contenido:     'propios',
    puntos_por_foto:    '5',
    solicitar_precio:   false,
    actor_campana:      'gondolero' as 'gondolero' | 'fixer',
  })

  const [s2, setS2] = useState<Step2>({
    fecha_inicio:               '',
    fecha_fin:                  '',
    objetivo_comercios:         '',
    max_comercios_por_gondolero: '20',
    min_comercios_para_cobrar:  '3',
  })

  const paso1Valido = s1.nombre.trim().length >= 3 && !!s1.tipo

  const handleSubmit = () => {
    setErrorMsg(null)
    const fd = new FormData()
    Object.entries(s1).forEach(([k, v]) => {
      if (k !== 'solicitar_precio' && k !== 'actor_campana') fd.set(k, v as string)
    })
    fd.set('solicitar_precio', s1.solicitar_precio ? 'true' : 'false')
    fd.set('actor_campana', s1.actor_campana)
    Object.entries(s2).forEach(([k, v]) => fd.set(k, v))
    grupos.flatMap(g => g.localidadIds).forEach(id => fd.append('localidad_ids', String(id)))
    fd.set('campos_json', JSON.stringify(campos))

    startTransition(async () => {
      const result = await crearCampanaAdmin(fd)
      if (result?.error) setErrorMsg(result.error)
    })
  }

  // Colores admin (indigo oscuro)
  const ring = 'focus:ring-2 focus:ring-[#1E1B4B]/20 focus:border-[#1E1B4B]'
  const btnPrimary = 'flex items-center gap-2 px-5 py-2.5 bg-[#1E1B4B] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2a6e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

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
          <p className="text-sm text-gray-400">Paso {paso} de 2 — Campaña de GondolApp</p>
        </div>
      </div>

      {/* Indicador de pasos */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2] as const).map(n => (
          <div key={n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              n < paso
                ? 'bg-[#1E1B4B] text-white'
                : n === paso
                  ? 'bg-[#1E1B4B] text-white'
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {n < paso ? <Check size={13} /> : n}
            </div>
            <span className={`text-sm font-medium ${n === paso ? 'text-gray-900' : 'text-gray-400'}`}>
              {n === 1 ? 'Detalles' : 'Objetivos y zonas'}
            </span>
            {n < 2 && <div className="w-8 h-px bg-gray-200 ml-1" />}
          </div>
        ))}
      </div>

      {/* Badge informativo */}
      <div className="mb-4 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
        <span className="text-xs font-semibold text-[#1E1B4B] uppercase tracking-wide">GondolApp</span>
        <span className="text-xs text-indigo-400">·</span>
        <span className="text-xs text-indigo-600">Sin costo de tokens — visible para todos los gondoleros de las zonas seleccionadas</span>
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
                placeholder="Ej: Relevamiento Nacional Agosto 2026"
                className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
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
                        ? 'bg-[#1E1B4B] text-white border-[#1E1B4B]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#1E1B4B] hover:text-[#1E1B4B]'
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
                className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none transition ${ring}`}
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
                className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
              />
            </div>

            {/* Campos dinámicos */}
            <CamposBloqueBuilder campos={campos} onChange={setCampos} />

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
                      className="accent-[#1E1B4B]"
                    />
                    <span className="text-sm text-gray-700">{tc.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Solicitar precio */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={s1.solicitar_precio}
                onChange={e => setS1(p => ({ ...p, solicitar_precio: e.target.checked }))}
                className="accent-[#1E1B4B] w-4 h-4"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Pedir precio al gondolero</span>
                <p className="text-xs text-gray-400 mt-0.5">El gondolero deberá ingresar el precio cuando encuentre el producto</p>
              </div>
            </label>

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
                  className={`w-28 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
                />
                <span className="text-sm text-gray-500">puntos por foto aprobada</span>
              </div>
            </div>

            {/* Actor de la campaña */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Para quién es esta campaña?
              </label>
              <div className="flex gap-4">
                {[
                  { value: 'gondolero' as const, label: 'Gondoleros' },
                  { value: 'fixer' as const, label: 'Fixers' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="actor_campana"
                      value={opt.value}
                      checked={s1.actor_campana === opt.value}
                      onChange={() => setS1(p => ({ ...p, actor_campana: opt.value }))}
                      className="accent-[#1E1B4B]"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
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
                  className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
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
                  className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
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
                placeholder="Ej: 500"
                className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
              />
              <p className="text-xs text-gray-400 mt-1">Cantidad total de comercios a relevar</p>
            </div>

            {/* Límites por gondolero */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Máx. por participante
                </label>
                <input
                  type="number"
                  min={1}
                  value={s2.max_comercios_por_gondolero}
                  onChange={e => setS2(p => ({ ...p, max_comercios_por_gondolero: e.target.value }))}
                  className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
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
                  className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none transition ${ring}`}
                />
              </div>
            </div>

            {/* Zonas */}
            <SelectorZona
              grupos={grupos}
              onGrupos={setGrupos}
              accentClass="focus:ring-2 focus:ring-[#1E1B4B]/20 focus:border-[#1E1B4B]"
              addBtnClass="bg-[#1E1B4B] hover:bg-[#2d2a6e] text-white"
            />

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
            className={btnPrimary}
          >
            Continuar
            <ArrowRight size={15} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className={btnPrimary}
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
