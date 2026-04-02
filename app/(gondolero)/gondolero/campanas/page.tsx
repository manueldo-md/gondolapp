import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutGrid, Star, Clock, Camera, CheckCircle2 } from 'lucide-react'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'

type CampanaRow = {
  id: string
  nombre: string
  tipo: TipoCampana
  marca_id: string | null
  financiada_por: string
  puntos_por_foto: number
  fecha_fin: string | null
  objetivo_comercios: number | null
  comercios_relevados: number
  instruccion: string | null
  min_comercios_para_cobrar: number
  created_at: string
  marca: { razon_social: string } | null
  bloques_foto: { id: string }[]
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

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

function CampanaCard({ campana, participando }: { campana: CampanaRow; participando: boolean }) {
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null
  const progreso = calcularPorcentaje(campana.comercios_relevados, campana.objetivo_comercios ?? 0)
  const cantBloques = campana.bloques_foto.length
  const marcaNombre = campana.marca?.razon_social ?? 'GondolApp'
  const nueva = !participando && (Date.now() - new Date(campana.created_at).getTime() < SIETE_DIAS_MS)

  return (
    <div className={`rounded-2xl shadow-sm border overflow-hidden ${
      participando ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'
    }`}>
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[campana.tipo]}`}>
            {labelTipoCampana(campana.tipo)}
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {marcaNombre}
          </span>
          {participando && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <CheckCircle2 size={10} />
              Participando
            </span>
          )}
          {nueva && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              Nueva
            </span>
          )}
        </div>
        <h2 className="font-semibold text-gray-900 text-base leading-snug">{campana.nombre}</h2>
        {campana.instruccion && (
          <p className="text-gray-500 text-sm mt-1 line-clamp-2">{campana.instruccion}</p>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Star size={14} className="text-gondo-verde-400 fill-gondo-verde-400" />
          <span className="text-sm font-semibold text-gondo-verde-400">
            {formatearPuntos(campana.puntos_por_foto)} pts/foto
          </span>
        </div>
        {dias !== null && (
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-400" />
            <span className={`text-sm font-medium ${dias <= 3 ? 'text-red-500' : 'text-gray-500'}`}>
              {dias === 0 ? 'Último día' : `${dias} días`}
            </span>
          </div>
        )}
        {cantBloques > 0 && (
          <div className="flex items-center gap-1.5">
            <Camera size={14} className="text-gray-400" />
            <span className="text-sm text-gray-500">
              {cantBloques} {cantBloques === 1 ? 'foto' : 'fotos'}
            </span>
          </div>
        )}
      </div>

      {/* Barra de progreso */}
      {campana.objetivo_comercios !== null && campana.objetivo_comercios > 0 && (
        <div className="px-4 pb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-400">Comercios relevados</span>
            <span className="text-xs font-medium text-gray-600">
              {campana.comercios_relevados} / {campana.objetivo_comercios}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gondo-verde-400 rounded-full transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="px-4 pb-4">
        <Link
          href={participando ? `/gondolero/misiones/${campana.id}` : `/gondolero/campanas/${campana.id}`}
          className={`block w-full py-3 text-white text-center font-semibold rounded-xl transition-colors min-h-touch ${
            participando
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-gondo-verde-400 hover:bg-gondo-verde-600'
          }`}
        >
          {participando ? 'Continuar →' : 'Ver campaña'}
        </Link>
      </div>
    </div>
  )
}

export default async function CampanasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Zonas declaradas por el gondolero
  const { data: gondoleroZonas } = await supabase
    .from('gondolero_zonas')
    .select('zona_id')
    .eq('gondolero_id', user.id)

  const zonaIds = (gondoleroZonas ?? []).map((gz: { zona_id: string }) => gz.zona_id)
  const tieneZonas = zonaIds.length > 0

  // Participaciones activas del gondolero
  const { data: participaciones } = await supabase
    .from('participaciones')
    .select('campana_id')
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')

  const campanaIdsActivas = new Set((participaciones ?? []).map((p: { campana_id: string }) => p.campana_id))

  let query = supabase
    .from('campanas')
    .select(`
      id, nombre, tipo, marca_id, financiada_por,
      puntos_por_foto, fecha_fin, objetivo_comercios,
      comercios_relevados, instruccion, min_comercios_para_cobrar,
      es_abierta, created_at,
      marca:marcas ( razon_social ),
      bloques_foto ( id )
    `)
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })

  let lista: CampanaRow[] = []

  if (tieneZonas) {
    const { data: campanaZonas } = await supabase
      .from('campana_zonas')
      .select('campana_id')
      .in('zona_id', zonaIds)

    const campanaIdsConZona = (campanaZonas ?? []).map((cz: { campana_id: string }) => cz.campana_id)

    const { data: campanas, error } = await query
    if (error) console.error('Error fetching campanas:', error.message)

    const todas = (campanas as CampanaRow[] | null) ?? []
    const { data: todasCampanaZonas } = await supabase
      .from('campana_zonas')
      .select('campana_id')
    const campanasConAlgunaZona = new Set((todasCampanaZonas ?? []).map((cz: { campana_id: string }) => cz.campana_id))

    lista = todas.filter(c =>
      (c as unknown as { es_abierta: boolean }).es_abierta ||
      campanaIdsConZona.includes(c.id) ||
      !campanasConAlgunaZona.has(c.id)
    )
  } else {
    const { data: campanas, error } = await query
    if (error) console.error('Error fetching campanas:', error.message)
    lista = (campanas as CampanaRow[] | null) ?? []
  }

  const activas = lista.filter(c => campanaIdsActivas.has(c.id))
  const disponibles = lista.filter(c => !campanaIdsActivas.has(c.id))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <LayoutGrid size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Campañas</h1>
        </div>
        {lista.length > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">
            {lista.length} {lista.length === 1 ? 'campaña activa' : 'campañas activas'}
          </p>
        )}
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* ── Grupo 1: Mis campañas activas ── */}
        {activas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Mis campañas activas
            </p>
            <div className="space-y-4">
              {activas.map(c => (
                <CampanaCard key={c.id} campana={c} participando />
              ))}
            </div>
          </div>
        )}

        {/* ── Grupo 2: Disponibles ── */}
        {disponibles.length > 0 ? (
          <div>
            {activas.length > 0 && (
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                Campañas disponibles
              </p>
            )}
            <div className="space-y-4">
              {disponibles.map(c => (
                <CampanaCard key={c.id} campana={c} participando={false} />
              ))}
            </div>
          </div>
        ) : activas.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-sm font-semibold text-gray-700">
              Ya estás en todas las campañas activas
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h2 className="text-base font-semibold text-gray-700 mb-1">
              No hay campañas activas
            </h2>
            <p className="text-sm text-gray-400 max-w-xs">
              Cuando haya campañas disponibles en tu zona van a aparecer acá.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
