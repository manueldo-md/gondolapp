import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Star, Clock, Camera, MapPin, CheckCircle2 } from 'lucide-react'
import { UnirseButton } from './unirse-button'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
  formatearFecha,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'

type BloqueFotoRow = {
  id: string
  orden: number
  instruccion: string
  tipo_contenido: string
}

type CampanaDetalle = {
  id: string
  nombre: string
  tipo: TipoCampana
  financiada_por: string
  puntos_por_foto: number
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_limite_inscripcion: string | null
  objetivo_comercios: number | null
  max_comercios_por_gondolero: number
  min_comercios_para_cobrar: number
  comercios_relevados: number
  instruccion: string | null
  marca: { razon_social: string } | null
  bloques_foto: BloqueFotoRow[]
}

const COLORES_TIPO: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-600',
  pop:          'bg-purple-50 text-purple-600',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-600',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-600',
  interna:      'bg-gray-100 text-gray-500',
}

export default async function CampanaDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: campana } = await supabase
    .from('campanas')
    .select(`
      id, nombre, tipo, financiada_por,
      puntos_por_foto, fecha_inicio, fecha_fin, fecha_limite_inscripcion,
      objetivo_comercios, max_comercios_por_gondolero, min_comercios_para_cobrar,
      comercios_relevados, instruccion,
      marca:marcas ( razon_social ),
      bloques_foto ( id, orden, instruccion, tipo_contenido )
    `)
    .eq('id', params.id)
    .eq('estado', 'activa')
    .single()

  if (!campana) notFound()

  // Verificar si el gondolero ya está inscripto y activo
  const { data: participacion } = await supabase
    .from('participaciones')
    .select('id')
    .eq('campana_id', params.id)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')
    .maybeSingle()

  const yaUnido = !!participacion

  const c = campana as unknown as CampanaDetalle
  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const progreso = calcularPorcentaje(c.comercios_relevados, c.objetivo_comercios ?? 0)
  const marcaNombre = c.marca?.razon_social ?? 'GondolApp'
  const bloques = [...(c.bloques_foto ?? [])].sort((a, b) => a.orden - b.orden)

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* Header con back */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <Link
          href="/gondolero/campanas"
          className="inline-flex items-center gap-1.5 text-gray-500 text-sm mb-3 -ml-1 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Campañas
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[c.tipo]}`}>
            {labelTipoCampana(c.tipo)}
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {marcaNombre}
          </span>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mt-2 leading-snug">
          {c.nombre}
        </h1>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Stats principales */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Star size={18} className="text-gondo-verde-400 fill-gondo-verde-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gondo-verde-400">
              {formatearPuntos(c.puntos_por_foto)}
            </p>
            <p className="text-[11px] text-gray-400">pts/foto</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Clock size={18} className="text-gray-400 mx-auto mb-1" />
            <p className={`text-base font-bold ${dias !== null && dias <= 3 ? 'text-red-500' : 'text-gray-700'}`}>
              {dias === null ? '—' : dias === 0 ? 'Hoy' : dias}
            </p>
            <p className="text-[11px] text-gray-400">días</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Camera size={18} className="text-gray-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gray-700">{bloques.length}</p>
            <p className="text-[11px] text-gray-400">{bloques.length === 1 ? 'foto' : 'fotos'}</p>
          </div>
        </div>

        {/* Instrucción general */}
        {c.instruccion && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">¿Qué tenés que hacer?</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{c.instruccion}</p>
          </div>
        )}

        {/* Bloques de foto */}
        {bloques.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Fotos requeridas
            </h2>
            <div className="space-y-3">
              {bloques.map((bloque, i) => (
                <div key={bloque.id} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-gondo-verde-50 text-gondo-verde-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{bloque.instruccion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reglas */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Condiciones</h2>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-gondo-verde-400 mt-0.5 shrink-0" />
              <p className="text-sm text-gray-600">
                Mínimo <span className="font-medium">{c.min_comercios_para_cobrar} comercios</span> para cobrar puntos
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin size={16} className="text-gondo-verde-400 mt-0.5 shrink-0" />
              <p className="text-sm text-gray-600">
                Máximo <span className="font-medium">{c.max_comercios_por_gondolero} comercios</span> por gondolero
              </p>
            </div>
            {c.fecha_limite_inscripcion && (
              <div className="flex items-start gap-2.5">
                <Clock size={16} className="text-gondo-verde-400 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-600">
                  Inscripción hasta el <span className="font-medium">{formatearFecha(c.fecha_limite_inscripcion)}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Progreso */}
        {c.objetivo_comercios !== null && c.objetivo_comercios > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Progreso general</h2>
              <span className="text-sm font-medium text-gray-600">
                {c.comercios_relevados} / {c.objetivo_comercios}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gondo-verde-400 rounded-full"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">comercios relevados</p>
          </div>
        )}

      </div>

      {/* CTA fijo al fondo */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 via-gray-50 pt-4">
        <UnirseButton campanaId={c.id} yaUnido={yaUnido} />
      </div>

    </div>
  )
}
