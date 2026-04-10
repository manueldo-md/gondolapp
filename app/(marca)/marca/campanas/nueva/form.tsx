'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Loader2, Building2, Sparkles } from 'lucide-react'
import { crearCampana } from './actions'
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
  puntos_por_mision: string
  solicitar_precio: boolean
}

interface Step2 {
  fecha_inicio: string
  fecha_fin: string
  objetivo_comercios: string
  max_comercios_por_gondolero: string
  min_comercios_para_cobrar: string
  nivel_minimo: string
}

interface Step3 {
  via_ejecucion: 'distribuidora' | 'gondolapp'
  distri_id: string
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

const STEP_LABELS = ['Detalles', 'Objetivos', 'Ejecución']

// ── Componente ────────────────────────────────────────────────────────────────

export function NuevaCampanaForm({
  distrisVinculadas,
}: {
  distrisVinculadas: { id: string; razon_social: string }[]
}) {
  const router = useRouter()
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
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
    puntos_por_mision:  '50',
    solicitar_precio:   false,
  })

  const [s2, setS2] = useState<Step2>({
    fecha_inicio:               '',
    fecha_fin:                  '',
    objetivo_comercios:         '',
    max_comercios_por_gondolero: '20',
    min_comercios_para_cobrar:  '3',
    nivel_minimo:               'casual',
  })

  const [s3, setS3] = useState<Step3>({
    via_ejecucion: 'distribuidora',
    distri_id:     distrisVinculadas[0]?.id ?? '',
  })

  const paso1Valido = s1.nombre.trim().length >= 3 && s1.tipo

  const paso3Valido =
    s3.via_ejecucion === 'gondolapp' ||
    (s3.via_ejecucion === 'distribuidora' && s3.distri_id.trim().length > 0)

  const handleSubmit = () => {
    setErrorMsg(null)
    const fd = new FormData()
    Object.entries(s1).forEach(([k, v]) => {
      if (k !== 'solicitar_precio') fd.set(k, v as string)
    })
    fd.set('solicitar_precio', s1.solicitar_precio ? 'true' : 'false')
    Object.entries(s2).forEach(([k, v]) => fd.set(k, v))
    grupos.flatMap(g => g.localidadIds).forEach(id => fd.append('localidad_ids', String(id)))
    fd.set('campos_json', JSON.stringify(campos))
    fd.set('via_ejecucion', s3.via_ejecucion)
    if (s3.via_ejecucion === 'distribuidora' && s3.distri_id) {
      fd.set('distri_id', s3.distri_id)
    }

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
          onClick={() => paso > 1 ? setPaso((paso - 1) as 1 | 2 | 3) : router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Nueva campaña</h2>
          <p className="text-sm text-gray-400">Paso {paso} de 3</p>
        </div>
      </div>

      {/* Indicador de pasos */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map(n => (
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
              {STEP_LABELS[n - 1]}
            </span>
            {n < 3 && <div className="w-8 h-px bg-gray-200 ml-1" />}
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

            {/* Campos del bloque */}
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
                      className="accent-gondo-indigo-600"
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
                className="accent-gondo-indigo-600 w-4 h-4"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Pedir precio al gondolero</span>
                <p className="text-xs text-gray-400 mt-0.5">El gondolero deberá ingresar el precio cuando encuentre el producto</p>
              </div>
            </label>

            {/* Puntos por foto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Puntos por misión completada
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={s1.puntos_por_mision}
                  onChange={e => setS1(p => ({ ...p, puntos_por_mision: e.target.value }))}
                  className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
                />
                <span className="text-sm text-gray-500">puntos por misión aprobada</span>
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
                  Máx. por participante
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

            {/* Nivel mínimo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nivel mínimo requerido
              </label>
              <select
                value={s2.nivel_minimo}
                onChange={e => setS2(p => ({ ...p, nivel_minimo: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition bg-white"
              >
                <option value="casual">Casual (todos)</option>
                <option value="activo">Activo (50+ fotos aprobadas)</option>
                <option value="pro">Pro (150+ fotos aprobadas)</option>
              </select>
            </div>

            {/* Zonas */}
            <SelectorZona
              grupos={grupos}
              onGrupos={setGrupos}
            />
          </>
        )}

        {/* ── Paso 3 ── */}
        {paso === 3 && (
          <>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">¿Cómo ejecutar esta campaña?</h3>
              <p className="text-sm text-gray-500 mb-4">
                Elegí si vas a trabajar con una distribuidora o si el equipo de GondolApp se encarga de todo.
              </p>
            </div>

            {/* Opción A: Con distribuidora */}
            <button
              type="button"
              onClick={() => setS3(p => ({ ...p, via_ejecucion: 'distribuidora' }))}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                s3.via_ejecucion === 'distribuidora'
                  ? 'border-gondo-indigo-600 bg-gondo-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  s3.via_ejecucion === 'distribuidora'
                    ? 'border-gondo-indigo-600 bg-gondo-indigo-600'
                    : 'border-gray-300'
                }`}>
                  {s3.via_ejecucion === 'distribuidora' && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 size={15} className={s3.via_ejecucion === 'distribuidora' ? 'text-gondo-indigo-600' : 'text-gray-400'} />
                    <span className="text-sm font-semibold text-gray-900">Con una Distribuidora</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    La distribuidora revisará y activará la campaña con sus gondoleros. Te generaremos un link único para invitarla.
                  </p>
                </div>
              </div>
            </button>

            {/* Selector de distribuidora */}
            {s3.via_ejecucion === 'distribuidora' && (
              <div className="ml-8 space-y-3">
                {distrisVinculadas.length > 0 ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                      Seleccionar distribuidora
                    </label>
                    <div className="space-y-2">
                      {distrisVinculadas.map(d => (
                        <label key={d.id} className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                          s3.distri_id === d.id
                            ? 'border-gondo-indigo-600 bg-gondo-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="distri_id"
                            value={d.id}
                            checked={s3.distri_id === d.id}
                            onChange={() => setS3(p => ({ ...p, distri_id: d.id }))}
                            className="accent-gondo-indigo-600"
                          />
                          <span className="text-sm font-medium text-gray-900">{d.razon_social}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5">
                    <p className="text-sm font-medium text-amber-800 mb-1">No tenés distribuidoras vinculadas</p>
                    <p className="text-xs text-amber-700">
                      Contactá al equipo de GondolApp para vincularte con una distribuidora, o elegí la opción "Con GondolApp" abajo.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Opción B: Con GondolApp */}
            <button
              type="button"
              onClick={() => setS3(p => ({ ...p, via_ejecucion: 'gondolapp' }))}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                s3.via_ejecucion === 'gondolapp'
                  ? 'border-gondo-indigo-600 bg-gondo-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  s3.via_ejecucion === 'gondolapp'
                    ? 'border-gondo-indigo-600 bg-gondo-indigo-600'
                    : 'border-gray-300'
                }`}>
                  {s3.via_ejecucion === 'gondolapp' && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={15} className={s3.via_ejecucion === 'gondolapp' ? 'text-gondo-indigo-600' : 'text-gray-400'} />
                    <span className="text-sm font-semibold text-gray-900">Con GondolApp</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    El equipo de GondolApp revisará tu campaña y la activará directamente con gondoleros disponibles en las zonas elegidas.
                  </p>
                </div>
              </div>
            </button>

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
          onClick={() => paso > 1 ? setPaso((paso - 1) as 1 | 2 | 3) : router.back()}
          className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          {paso === 1 ? 'Cancelar' : 'Volver'}
        </button>

        {paso < 3 ? (
          <button
            onClick={() => setPaso((paso + 1) as 2 | 3)}
            disabled={paso === 1 && !paso1Valido}
            className="flex items-center gap-2 px-5 py-2.5 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-gondo-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continuar
            <ArrowRight size={15} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isPending || !paso3Valido}
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
