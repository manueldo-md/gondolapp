'use client'

// ─────────────────────────────────────────────────────────────────────────────
// 100% CSS/Tailwind + React puro. Sin recharts, sin leaflet, sin ninguna
// librería externa de visualización o mapas.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, MapPin } from 'lucide-react'
import { formatearInstante } from '@/lib/fecha-ar'
import { textoBaseCobertura, type GrupoCobertura } from '@/lib/panel-marca'
import { etiquetaTipo } from '@/lib/tipos-comercio'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DashboardVisualizacionesProps = {
  /**
   * La cobertura por ciudad y por tipo de comercio, ya agrupada por
   * `agruparCobertura`. Los dos bloques leen la MISMA estructura porque son la
   * misma pregunta sobre dos ejes distintos.
   *
   * Antes cada uno traía su propia forma —`ZonaMapData`, `CiudadRow`,
   * `TipoComercioData`— con la presencia calculada en la página a partir de
   * `fotos.declaracion` y nada más. Por eso, después de arreglar el KPI en la
   * etapa 3, Suprante leía 64% arriba y 0% en cada ciudad y en cada tipo: la
   * misma pantalla contradiciéndose a sí misma.
   *
   * `ZonaMapData` además declaraba `lat` y `lng` que no leía nadie, y la
   * página calculaba un centroide por localidad para llenarlos. Se fueron con
   * el tipo.
   */
  ciudades: GrupoCobertura[]
  tipos: GrupoCobertura[]
  /**
   * La presencia global, ya calculada por `lib/panel-marca`. `null` = la marca
   * no está midiendo presencia, que NO es lo mismo que medir cero.
   *
   * Antes llegaban `totalFotos` y `conPresenciaGlobal` y el dónut hacía la
   * división acá: presentes sobre TODAS las fotos aprobadas, contando como
   * "sin presencia" las 25 fotos de Georgalos que no declararon nada. Ahora
   * llega el numerador y el denominador ya decididos, y no queda ninguna
   * división que alguien pueda hacer distinto.
   */
  presencia: {
    valor: number | null
    verdaderos: number
    conValor: number
    periodo: string
  } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function presenciaBadgeClass(pct: number) {
  if (pct > 12) return 'bg-green-100 text-green-800'
  if (pct >= 8)  return 'bg-emerald-50 text-emerald-700'
  if (pct >= 5)  return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function presenciaBarColor(pct: number) {
  if (pct > 12) return 'bg-green-500'
  if (pct >= 8)  return 'bg-emerald-400'
  if (pct >= 5)  return 'bg-amber-400'
  return 'bg-red-400'
}

// ── Cobertura por ciudad (reemplaza mapa Leaflet) ─────────────────────────────

/**
 * Una tarjeta por grupo. Sirve igual para ciudades y para tipos de comercio:
 * es la misma pregunta —¿dónde está el producto?— sobre dos ejes.
 */
function CoberturaGrid({ grupos, vacio }: { grupos: GrupoCobertura[]; vacio: string }) {
  if (grupos.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">{vacio}</div>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {grupos.map(g => (
        <div key={g.clave} className="border border-gray-100 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="text-sm font-semibold text-gray-900 truncate">{g.nombre}</span>
            </div>
            {/* null NO es 0%: es "acá no se midió presencia". Pintarlo de rojo
                como un 0% mandaría a la marca a resolver un problema que no
                existe, y le escondería el que sí tiene, que es que no se
                está preguntando. */}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
              g.presenciaPct === null ? 'bg-gray-100 text-gray-500' : presenciaBadgeClass(g.presenciaPct)
            }`}>
              {g.presenciaPct === null ? 'sin medir' : `${g.presenciaPct}%`}
            </span>
          </div>

          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
            {g.presenciaPct !== null && (
              <div
                className={`h-full rounded-full ${presenciaBarColor(g.presenciaPct)}`}
                style={{ width: `${Math.min(g.presenciaPct, 100)}%` }}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-400">PDV visitados</p>
              <p className="text-sm font-bold text-gray-900">{g.pdv}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Con presencia</p>
              <p className="text-sm font-bold text-green-700">
                {g.pdvMidieron > 0 ? g.conPresencia : '—'}
              </p>
            </div>
          </div>

          {/* La base de cálculo, igual que en la serie mensual. */}
          <p className="text-xs text-gray-400 mt-2.5 text-center">{textoBaseCobertura(g)}</p>
        </div>
      ))}
    </div>
  )
}

// ── Presencia global — CSS conic-gradient ─────────────────────────────────────

function PresenciaDonut({ pct, presente, total, periodo }: {
  pct: number; presente: number; total: number; periodo: string
}) {
  if (total === 0) return null
  const ausente = total - presente
  const deg = Math.round((pct / 100) * 360)

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div
        className="relative w-32 h-32 rounded-full"
        style={{ background: `conic-gradient(#22c55e 0deg ${deg}deg, #fca5a5 ${deg}deg 360deg)` }}
      >
        <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{pct}%</span>
        </div>
      </div>
      <div className="flex gap-5 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-600">{presente} con presencia</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-300" />
          <span className="text-gray-600">{ausente} sin presencia</span>
        </div>
      </div>
      {/* La base de cálculo, que es el punto del tramo: un porcentaje sin decir
          sobre cuántas observaciones se sacó no se puede comparar con nada. */}
      <p className="text-xs text-gray-400">
        {total} observaci{total === 1 ? 'ón' : 'ones'} · {periodo}
      </p>
    </div>
  )
}

// ── Tipo de comercio — barras paralelas CSS ───────────────────────────────────

// ── Tabla de ciudades ─────────────────────────────────────────────────────────

type SortKey = 'nombre' | 'pdv' | 'pdvMidieron' | 'conPresencia' | 'presenciaPct' | 'ultimaVisita'

function CiudadTable({ rows }: { rows: GrupoCobertura[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pdv')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Sin ciudades relevadas aún.
      </div>
    )
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? ''
    const bv = b[sortKey] ?? ''
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
  })

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ArrowUp   size={12} className="text-indigo-600" />
      : <ArrowDown size={12} className="text-indigo-600" />
  }

  const cols: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'nombre',         label: 'Ciudad',        align: 'left'  },
    { key: 'pdv',            label: 'PDV visitados', align: 'right' },
    { key: 'pdvMidieron',    label: 'Midieron',      align: 'right' },
    { key: 'conPresencia',   label: 'Con presencia', align: 'right' },
    { key: 'presenciaPct',   label: 'Presencia %',   align: 'right' },
    { key: 'ultimaVisita',   label: 'Última visita', align: 'right' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {cols.map((col, i) => (
              <th
                key={`${col.key}-${i}`}
                onClick={() => handleSort(col.key)}
                className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                <span className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                  {col.align === 'right' && <SortIcon col={col.key} />}
                  {col.label}
                  {col.align === 'left'  && <SortIcon col={col.key} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map(r => (
            <tr key={r.clave} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900">{r.nombre}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">{r.pdv}</td>
              {/* La columna que antes no existía y es la que explica el resto:
                  cuántos de los visitados midieron presencia. Sin ella, un
                  "0 con presencia" se lee como ausencia del producto cuando
                  puede ser simplemente que nadie preguntó. */}
              <td className={`px-4 py-3 text-right ${r.pdvMidieron < r.pdv ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>
                {r.pdvMidieron}
              </td>
              <td className="px-4 py-3 text-right text-green-700 font-medium">
                {r.pdvMidieron > 0 ? r.conPresencia : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                {r.presenciaPct === null ? (
                  <span className="text-[11px] text-gray-400">sin medir</span>
                ) : (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${presenciaBadgeClass(r.presenciaPct)}`}>
                    {r.presenciaPct}%
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-xs text-gray-400">
                {r.ultimaVisita
                  ? formatearInstante(r.ultimaVisita, { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DashboardVisualizaciones({
  ciudades,
  tipos,
  presencia,
}: DashboardVisualizacionesProps) {
  return (
    <div className="space-y-6">

      {/* Presencia global */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Presencia global</h3>
          <p className="text-xs text-gray-400 mt-0.5">Medida por observación</p>
        </div>
        <div className="p-5">
          {presencia === null || presencia.valor === null
            ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Ninguna de tus campañas está midiendo presencia.
              </p>
            )
            : (
              <PresenciaDonut
                pct={Math.round(presencia.valor)}
                presente={presencia.verdaderos}
                total={presencia.conValor}
                periodo={presencia.periodo}
              />
            )
          }
        </div>
      </div>

      {/* Cobertura por ciudad */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Cobertura por ciudad</h3>
          {/* Los dos bloques de abajo se miden en PDV y el dónut de arriba en
              observaciones. Decirlo es lo que evita que parezcan dos números
              del mismo tipo que no coinciden. */}
          <p className="text-xs text-gray-400 mt-0.5">
            En cuántos puntos de venta está el producto · ordenado por PDV visitados
          </p>
        </div>
        <div className="p-5">
          <CoberturaGrid
            grupos={ciudades}
            vacio="Las ciudades aparecen acá cuando tus campañas registran misiones."
          />
        </div>
      </div>

      {/* Tipo de comercio — el mismo bloque, otro eje */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Presencia por tipo de comercio</h3>
          <p className="text-xs text-gray-400 mt-0.5">En cuántos puntos de venta está el producto</p>
        </div>
        <div className="p-5">
          <CoberturaGrid
            grupos={tipos}
            vacio="Los tipos de comercio aparecen acá cuando tus campañas registran misiones."
          />
        </div>
      </div>

      {/* Tabla de ciudades */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Análisis por ciudad</h3>
          <p className="text-xs text-gray-400 mt-0.5">Hacé clic en los encabezados para ordenar</p>
        </div>
        <CiudadTable rows={ciudades} />
      </div>

    </div>
  )
}
