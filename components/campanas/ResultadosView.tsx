/**
 * components/campanas/ResultadosView.tsx
 * Componente Server compartido por los cuatro paneles de resultados.
 * Los cuatro ven los mismos resultados; lo único que cambia es el tema y si
 * ven quién relevó. El layout exterior (nav de página) queda en cada page.tsx.
 *
 * Cabecera en tres niveles, para que no sea una fila de siete números iguales:
 *   1. PDV relevados, grande, con su barra de avance
 *   2. Tres tiles de ejecución: misiones, fotos, gondoleros
 *   3. Una línea de contexto en texto plano: ciudades, ventana temporal, plazo
 * Después, los módulos en orden (bloque.orden, campo.orden), cada uno dibujado
 * según su tipo en components/campanas/modulos/.
 *
 * No hay grilla global de fotos: cada campo tipo='foto' tiene su galería en su
 * módulo, y el filtro por estado de arriba filtra todas a la vez.
 */

import React from 'react'
import { TrendingUp, MapPin, Calendar, Clock } from 'lucide-react'
import { TabFilter } from '@/components/campanas/tab-filter'
import { calcularPorcentaje, diasRestantes } from '@/lib/utils'
import type { ResultadosData } from '@/lib/resultados'
import { TEMAS, type Panel } from './modulos/tema'
import { ModuloDispatcher } from './modulos/ModuloDispatcher'

export interface ResultadosViewCampana {
  id: string
  nombre: string
  tipo: string
  fecha_fin: string | null
  /**
   * Denominador del avance. Se usa `tope_total_comercios`: `objetivo_comercios`
   * está vacío en todas las campañas y hacía que la barra no se dibujara nunca
   * en estos paneles mientras sí aparecía en el detalle de admin.
   * Sin tope, se muestra el absoluto sin porcentaje.
   */
  tope_total_comercios: number | null
}

/**
 * Formatea la ventana del relevamiento como fechas, no como duración.
 *
 * "Del 11 al 14 de marzo" y no "4 días de relevamiento": la duración se deriva
 * de las fechas y no al revés, y para la marca *cuándo* se relevó es lo que
 * define si el dato sigue vigente. Un relevamiento de precios de hace seis
 * meses no vale lo mismo que uno de la semana pasada, y "4 días" no dice nada
 * de eso. Además suena a métrica de eficiencia y engaña: cuatro días con dos
 * gondoleros no es comparable a cuatro días con veinte.
 */
function formatearVentana(desde: string | null, hasta: string | null): string | null {
  if (!desde || !hasta) return null
  const d = new Date(desde), h = new Date(hasta)
  if (isNaN(d.getTime()) || isNaN(h.getTime())) return null

  const MES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre']
  const anioActual = new Date().getFullYear()
  const sufijoAnio = d.getFullYear() !== anioActual ? ` de ${d.getFullYear()}` : ''

  const mismoDia = d.toDateString() === h.toDateString()
  if (mismoDia) return `El ${d.getDate()} de ${MES[d.getMonth()]}${sufijoAnio}`

  const mismoMes = d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear()
  if (mismoMes) return `Del ${d.getDate()} al ${h.getDate()} de ${MES[d.getMonth()]}${sufijoAnio}`

  return `Del ${d.getDate()} de ${MES[d.getMonth()]} al ${h.getDate()} de ${MES[h.getMonth()]}${sufijoAnio}`
}

function ContextoRelevamiento({
  ciudades,
  ventana,
  dias,
}: {
  ciudades: number
  ventana: { desde: string | null; hasta: string | null }
  dias: number | null
}) {
  const rango = formatearVentana(ventana.desde, ventana.hasta)
  const partes: React.ReactNode[] = []

  if (ciudades > 0) {
    partes.push(
      <span key="ciudades" className="flex items-center gap-1">
        <MapPin size={12} className="shrink-0" />
        {ciudades} ciudad{ciudades !== 1 ? 'es' : ''}
      </span>
    )
  }
  if (rango) {
    partes.push(
      <span key="rango" className="flex items-center gap-1">
        <Calendar size={12} className="shrink-0" />
        {rango}
      </span>
    )
  }
  if (dias !== null) {
    partes.push(
      <span key="dias" className={`flex items-center gap-1 ${dias <= 3 ? 'text-red-500 font-medium' : ''}`}>
        <Clock size={12} className="shrink-0" />
        {dias < 0 ? 'Finalizada' : `${dias} día${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}`}
      </span>
    )
  }

  if (partes.length === 0) return null

  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-400 mb-5 px-1">
      {partes}
    </div>
  )
}

export interface ResultadosViewProps {
  data: ResultadosData
  campana: ResultadosViewCampana
  tab: string
  /** Quién mira. Resuelve colores, etiquetas y si se ve el agente. */
  panel: Panel
  /** Slot de acciones por foto. Recibe id y estado; devuelve null si no aplica. */
  renderFotoAcciones?: (fotoId: string, estado: string) => React.ReactNode
}

export function ResultadosView({
  data,
  campana,
  tab,
  panel,
  renderFotoAcciones,
}: ResultadosViewProps) {
  const {
    modulos, tieneCamposFoto, fotoRespuestasMap, camposMap,
    misionesAprobadas, pdvRelevados, ciudades, gondolerosRelevaron, ventana,
    counts, totalFotos, fotosAprobadas,
  } = data

  const tema = TEMAS[panel]
  const tope = campana.tope_total_comercios
  const progreso = tope ? calcularPorcentaje(pdvRelevados, tope) : null
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null

  // Tres tiles de apoyo, no siete. "Fotos aprobadas" desaparece en campañas
  // sin foto y quedan dos.
  const apoyo = [
    { label: 'Misiones completadas', value: String(misionesAprobadas), color: 'text-green-600' },
    ...(tieneCamposFoto
      ? [{ label: 'Fotos aprobadas', value: `${fotosAprobadas}/${totalFotos}`, color: 'text-green-600' }]
      : []),
    { label: tema.agenteLabel, value: String(gondolerosRelevaron), color: tema.acento },
  ]

  return (
    <>
      {/* ── Nivel 1: la métrica principal, con su avance ──────────────────
          PDV relevados es la respuesta a "cuánto se hizo", que es la pregunta
          con la que se abre el panel. Absorbe la barra de avance, que antes era
          un bloque aparte. */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <TrendingUp size={12} /> PDV relevados
        </p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-4xl font-bold text-gray-900 tabular-nums">{pdvRelevados}</span>
          {tope && <span className="text-sm text-gray-400">de {tope}</span>}
        </div>
        {progreso !== null ? (
          <div className="mt-3">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${tema.barraAvance} rounded-full transition-all`} style={{ width: `${progreso}%` }} />
            </div>
            <p className="text-xs text-gray-400 text-right mt-1">{progreso}%</p>
          </div>
        ) : (
          // Sin tope configurado no se inventa un denominador: el absoluto solo.
          <p className="text-xs text-gray-300 mt-1">Sin objetivo definido</p>
        )}
      </div>

      {/* ── Nivel 2: ejecución ────────────────────────────────────────────── */}
      <div className={`grid gap-3 mb-3 ${apoyo.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {apoyo.map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* ── Nivel 3: contexto, en texto plano ──────────────────────────────
          Ciudades y ventana temporal no son métricas que se comparen entre sí:
          son el pie de foto del relevamiento. En tile competirían con los
          números que sí importan. */}
      <ContextoRelevamiento
        ciudades={ciudades}
        ventana={ventana}
        dias={dias}
      />

      {/* ── Filtro de estado: aplica a todas las galerías ────────────────── */}
      {tieneCamposFoto && (
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <TabFilter tabActivo={tab} counts={counts} />
        </div>
      )}

      {/* ── Módulos ──────────────────────────────────────────────────────── */}
      {modulos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-500">Esta campaña no tiene módulos configurados</p>
          <p className="text-xs text-gray-400 mt-1">Agregá campos a sus bloques para ver resultados acá.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {modulos.map(m => (
            <div key={m.campo.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <ModuloDispatcher
                modulo={m}
                tema={tema}
                fotoRespuestasMap={fotoRespuestasMap}
                camposMap={camposMap}
                renderFotoAcciones={renderFotoAcciones}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
