'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Clock, Target, Users, Camera, DollarSign, Filter } from 'lucide-react'
import { labelEstadoCampana, colorEstadoCampana, diasRestantes, calcularPorcentaje } from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'
import { SeccionColapsable } from '@/components/campanas/seccion-colapsable'
import { AprobacionBtns } from './aprobacion-btns'

export interface CampanaFiltroRow {
  id: string
  nombre: string
  tipo: TipoCampana
  estado: EstadoCampana
  fecha_inicio: string | null
  fecha_fin: string | null
  objetivo_comercios: number | null
  comercios_relevados: number
  puntos_por_foto: number
  financiada_por: string
  instruccion: string | null
  actor_campana: string | null
  marca: { razon_social: string } | null
  created_at: string
  gondoleroCount: number
}

const TIPO_COLOR: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-400',
  pop:          'bg-purple-100 text-purple-700',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-400',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-400',
  interna:      'bg-gray-100 text-gray-500',
}

const TIPOS_CAMPANA: { value: string; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'relevamiento', label: 'Relevamiento' },
  { value: 'precio', label: 'Precio' },
  { value: 'cobertura', label: 'Cobertura' },
  { value: 'pop', label: 'POP' },
  { value: 'mapa', label: 'Mapa' },
  { value: 'comercios', label: 'Comercios' },
  { value: 'interna', label: 'Interna' },
]

function PendienteCard({ campana }: { campana: CampanaFiltroRow }) {
  const marcaNombre = campana.marca?.razon_social ?? 'Marca'
  return (
    <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              ⏳ Esperando tu aprobación
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-200">
              {marcaNombre}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              <Camera size={10} />
              Foto
            </span>
            {campana.tipo === 'precio' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gondo-amber-50 text-gondo-amber-400">
                <DollarSign size={10} />
                Precio
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base mb-1">{campana.nombre}</h3>
          {campana.instruccion && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{campana.instruccion}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap mb-3">
            <span className="font-medium text-gondo-verde-600">{campana.puntos_por_foto} pts/foto</span>
            {campana.fecha_fin && (
              <div className="flex items-center gap-1">
                <Clock size={11} />
                <span>Hasta {new Date(campana.fecha_fin).toLocaleDateString('es-AR')}</span>
              </div>
            )}
            {campana.objetivo_comercios && (
              <div className="flex items-center gap-1">
                <Target size={11} />
                <span>{campana.objetivo_comercios} comercios</span>
              </div>
            )}
          </div>
          <AprobacionBtns campanaId={campana.id} />
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Link href={`/distribuidora/campanas/${campana.id}/detalle`} className="text-xs font-semibold text-gray-600 hover:underline px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-center">Detalle</Link>
          <Link href={`/distribuidora/campanas/${campana.id}/resultados`} className="text-xs font-semibold text-gondo-amber-400 hover:underline px-2 py-1 bg-gondo-amber-50 rounded-lg border border-gondo-amber-200 text-center">Resultados</Link>
        </div>
      </div>
    </div>
  )
}

function CampanaCard({ campana, distriNombre }: { campana: CampanaFiltroRow; distriNombre?: string }) {
  const dias     = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null
  const progreso = calcularPorcentaje(campana.comercios_relevados, campana.objetivo_comercios ?? 0)
  const esPropia = campana.financiada_por === 'distri'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gondo-amber-400/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[campana.tipo]}`}>
              {esPropia ? (distriNombre ?? 'Interna') : campana.marca?.razon_social ? `Marca · ${campana.marca.razon_social}` : 'Marca'}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(campana.estado)}`}>
              {labelEstadoCampana(campana.estado)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              <Camera size={10} />
              Foto
            </span>
            {campana.actor_campana === 'fixer' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Fixers</span>
            )}
            {campana.tipo === 'precio' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gondo-amber-50 text-gondo-amber-400">
                <DollarSign size={10} />
                Precio
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base mb-3">{campana.nombre}</h3>
          <div className="flex items-center gap-5 text-xs text-gray-500 flex-wrap">
            {dias !== null && (
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span className={dias <= 3 ? 'text-red-500 font-medium' : ''}>
                  {dias === 0 ? 'Último día' : `${dias} días restantes`}
                </span>
              </div>
            )}
            {campana.objetivo_comercios && (
              <div className="flex items-center gap-1">
                <Target size={12} />
                <span>{campana.comercios_relevados} / {campana.objetivo_comercios} comercios</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users size={12} />
              <span>{campana.gondoleroCount} participante{campana.gondoleroCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {campana.objetivo_comercios && campana.objetivo_comercios > 0 && (
            <div className="mt-3">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-xs">
                <div
                  className={`h-full rounded-full transition-all ${esPropia ? 'bg-gondo-amber-400' : 'bg-gondo-indigo-600'}`}
                  style={{ width: `${progreso}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Link href={`/distribuidora/campanas/${campana.id}/detalle`} className="text-xs font-semibold text-gray-600 hover:underline px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-center">Detalle</Link>
          <Link href={`/distribuidora/campanas/${campana.id}/resultados`} className="text-xs font-semibold text-gondo-amber-400 hover:underline px-2 py-1 bg-gondo-amber-50 rounded-lg border border-gondo-amber-200 text-center">Resultados</Link>
        </div>
      </div>
    </div>
  )
}

export function CampanasFiltro({ campanas, distriNombre }: { campanas: CampanaFiltroRow[]; distriNombre?: string }) {
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroActor, setFiltroActor] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  const filtradas = useMemo(() => {
    return campanas.filter(c => {
      if (filtroTipo && c.tipo !== filtroTipo) return false
      if (filtroActor === 'gondolero' && c.actor_campana === 'fixer') return false
      if (filtroActor === 'fixer' && c.actor_campana !== 'fixer') return false
      if (filtroDesde && c.fecha_inicio && c.fecha_inicio < filtroDesde) return false
      if (filtroHasta && c.fecha_fin && c.fecha_fin > filtroHasta + 'T23:59:59') return false
      return true
    })
  }, [campanas, filtroTipo, filtroActor, filtroDesde, filtroHasta])

  const hayFiltros = filtroTipo || filtroActor || filtroDesde || filtroHasta

  const pendientes = filtradas.filter(c => c.estado === 'pendiente_aprobacion').sort((a, b) => a.created_at.localeCompare(b.created_at))
  const activas    = filtradas.filter(c => c.estado === 'activa').sort((a, b) => { if (!a.fecha_fin) return 1; if (!b.fecha_fin) return -1; return a.fecha_fin.localeCompare(b.fecha_fin) })
  const borradores = filtradas.filter(c => c.estado === 'borrador').sort((a, b) => b.created_at.localeCompare(a.created_at))
  const cerradas   = filtradas.filter(c => ['cerrada', 'cancelada', 'pausada'].includes(c.estado)).sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="space-y-4">
      {/* ── Filtros ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Filtros</span>
          {hayFiltros && (
            <button
              onClick={() => { setFiltroTipo(''); setFiltroActor(''); setFiltroDesde(''); setFiltroHasta('') }}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/30 bg-white">
              {TIPOS_CAMPANA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Participante</label>
            <select value={filtroActor} onChange={e => setFiltroActor(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/30 bg-white">
              <option value="">Todos</option>
              <option value="gondolero">Gondoleros</option>
              <option value="fixer">Fixers</option>
            </select>
          </div>
        </div>
        {hayFiltros && (
          <p className="text-xs text-gray-400 mt-2">{filtradas.length} de {campanas.length} campaña{campanas.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* ── Secciones ── */}
      {pendientes.length > 0 && (
        <SeccionColapsable titulo="Pendientes de aprobación" badge={pendientes.length} badgeClassName="bg-amber-100 text-amber-700" headerClassName="bg-amber-50 text-amber-800" defaultOpen={true}>
          <div className="space-y-3 pt-1">{pendientes.map(c => <PendienteCard key={c.id} campana={c} />)}</div>
        </SeccionColapsable>
      )}
      {activas.length > 0 && (
        <SeccionColapsable titulo="Activas" badge={activas.length} badgeClassName="bg-green-100 text-green-700" headerClassName="bg-green-50 text-green-800" defaultOpen={true}>
          <div className="space-y-3 pt-1">{activas.map(c => <CampanaCard key={c.id} campana={c} distriNombre={distriNombre} />)}</div>
        </SeccionColapsable>
      )}
      {borradores.length > 0 && (
        <SeccionColapsable titulo="Borradores" badge={borradores.length} badgeClassName="bg-gray-200 text-gray-600" headerClassName="bg-gray-100 text-gray-700" defaultOpen={false}>
          <div className="space-y-3 pt-1">{borradores.map(c => <CampanaCard key={c.id} campana={c} distriNombre={distriNombre} />)}</div>
        </SeccionColapsable>
      )}
      {cerradas.length > 0 && (
        <SeccionColapsable titulo="Cerradas y pausadas" badge={cerradas.length} badgeClassName="bg-gray-200 text-gray-500" headerClassName="bg-gray-50 text-gray-600" defaultOpen={false}>
          <div className="space-y-3 pt-1">{cerradas.map(c => <CampanaCard key={c.id} campana={c} distriNombre={distriNombre} />)}</div>
        </SeccionColapsable>
      )}
      {filtradas.length === 0 && (
        <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-gray-200 text-sm text-gray-400">
          {hayFiltros ? 'Sin campañas que coincidan con los filtros.' : 'Sin campañas.'}
        </div>
      )}
    </div>
  )
}
