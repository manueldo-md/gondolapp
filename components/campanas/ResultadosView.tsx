/**
 * components/campanas/ResultadosView.tsx
 * Componente Server compartido por los cuatro paneles de resultados.
 * Los cuatro ven los mismos resultados; lo único que cambia es el tema y si
 * ven quién relevó. El layout exterior (nav de página) queda en cada page.tsx.
 *
 * Cabecera en cuatro niveles, para que no sea una fila de siete números iguales:
 *   1. PDV relevados, grande, con su barra de avance
 *   2. Tres tiles de ejecución: misiones, fotos, gondoleros
 *   3. Una línea de contexto en texto plano: geografía, ventana temporal, plazo
 *   4. La distribución por tipo de negocio, con barras
 * Los niveles 3 y 4 describen la MUESTRA, no el formulario: de qué está hecho
 * el conjunto sobre el que se leen las respuestas de abajo. Por eso el tipo de
 * negocio va acá arriba y no entre los módulos, aunque comparta su formato.
 *
 * Los tres se calculan sobre el mismo set que `pdvRelevados` —comercios con
 * misión aprobada—, así que la cabecera entera habla de un solo universo.
 *
 * Después, los módulos en orden (bloque.orden, campo.orden), cada uno dibujado
 * según su tipo en components/campanas/modulos/.
 *
 * No hay grilla global de fotos: cada campo tipo='foto' tiene su galería en su
 * módulo, y el filtro por estado de arriba filtra todas a la vez.
 */

import React from 'react'
import { TrendingUp, MapPin, Calendar, Clock, Hourglass, AlertTriangle, Store } from 'lucide-react'
import { TabFilter } from '@/components/campanas/tab-filter'
import { calcularPorcentaje, diasRestantes } from '@/lib/utils'
import { etiquetaTipo, etiquetaTipoPlural } from '@/lib/tipos-comercio'
import type { ResultadosData } from '@/lib/resultados'
import { BarraProporcion } from './modulos/piezas'
import { TEMAS, type Panel } from './modulos/tema'
import { ModuloDispatcher } from './modulos/ModuloDispatcher'
import { BadgeAvance } from './BadgeAvance'
import { derivarAvance } from '@/lib/campana-avance'

export interface ResultadosViewCampana {
  id: string
  nombre: string
  tipo: string
  fecha_fin: string | null
  /** El administrativo: activa, cerrada, pausada… Distinto del de avance. */
  estado: string | null
  /** Piso de representatividad. `null` en las campañas anteriores al cambio. */
  minimo_comercios: number | null
  /** Techo que cierra la campaña sola. Es el denominador de la barra. */
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

/**
 * Distribución por tipo de negocio de los PDV relevados.
 *
 * Va pegada a la cabecera y no abajo con los módulos porque **describe la
 * muestra**: no es una respuesta que el gondolero haya cargado en el formulario,
 * es de qué está hecho el conjunto sobre el que se leen todas las respuestas de
 * abajo. "El 70% son kioscos" cambia cómo se interpreta cada barra del resto de
 * la pantalla, así que tiene que leerse antes.
 *
 * Usa el mismo formato de barras que los módulos de selección para que se lea
 * igual, con la misma pieza (`BarraProporcion`).
 */
function DistribucionTipos({
  tipos,
  total,
  color,
}: {
  tipos: { tipo: string | null; n: number }[]
  total: number
  color: string
}) {
  if (total === 0 || tipos.length === 0) return null

  const frase = tipos
    .map(t => `${t.n} ${etiquetaTipoPlural(t.tipo, t.n)}`)
    .join(', ')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <Store size={13} className="shrink-0" />
          Tipo de negocio
        </div>
        <span className="text-[11px] text-gray-400 tabular-nums">
          base: {total} PDV relevado{total !== 1 ? 's' : ''}
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-3">{frase}</p>

      {/* Con un solo tipo, una barra al 100% ocupa lugar y no dice nada que la
          frase no haya dicho ya. */}
      {tipos.length > 1 && (
        <div className="space-y-2">
          {tipos.map(t => (
            <BarraProporcion
              key={t.tipo ?? '__sin_tipo__'}
              label={etiquetaTipo(t.tipo)}
              n={t.n}
              total={total}
              color={color}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ContextoRelevamiento({
  ciudades,
  provincias,
  ventana,
  dias,
  enRevision,
}: {
  ciudades: number
  provincias: { cantidad: number; unica: string | null }
  ventana: { desde: string | null; hasta: string | null }
  dias: number | null
  /** PDV que todavía no tienen ninguna misión aprobada. */
  enRevision: number
}) {
  const rango = formatearVentana(ventana.desde, ventana.hasta)
  const partes: React.ReactNode[] = []

  // Geografía en un solo chip: "Córdoba · 5 ciudades" se lee de un saque, y dos
  // chips con el mismo ícono de ubicación parecerían dos cosas distintas.
  //
  // Con una sola provincia se muestra el nombre y no el conteo: "1 provincia" no
  // informa nada. Con varias no entran los nombres y se cuentan.
  const geo: string[] = []
  if (provincias.unica) {
    geo.push(provincias.unica)
  } else if (provincias.cantidad > 1) {
    geo.push(`${provincias.cantidad} provincias`)
  }
  if (ciudades > 0) {
    geo.push(`${ciudades} ciudad${ciudades !== 1 ? 'es' : ''}`)
  }
  if (geo.length > 0) {
    partes.push(
      <span key="geo" className="flex items-center gap-1">
        <MapPin size={12} className="shrink-0" />
        {geo.join(' · ')}
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

  // Los PDV sin ninguna misión aprobada no entran al KPI —la representatividad
  // se mide sobre lo validado— pero tampoco pueden desaparecer: sin esta línea,
  // una campaña con todo en revisión mostraría 0 y parecería rota.
  if (enRevision > 0) {
    partes.push(
      <span key="revision" className="flex items-center gap-1">
        <Hourglass size={12} className="shrink-0" />
        {enRevision} en revisión
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
    misionesAprobadas, pdvRelevados, pdvEnRevision, ciudades, provincias, tiposComercio,
    gondolerosRelevaron, ventana,
    counts, totalFotos, fotosAprobadas,
  } = data

  const tema = TEMAS[panel]
  const dias = campana.fecha_fin ? diasRestantes(campana.fecha_fin) : null

  // Estado de avance derivado, no guardado. Ver lib/campana-avance.ts.
  const avance = derivarAvance({
    pdvAprobados:  pdvRelevados,
    minimo:        campana.minimo_comercios,
    tope:          campana.tope_total_comercios,
    estadoCampana: campana.estado,
  })

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
      {/* ── Banda de advertencia ───────────────────────────────────────────
          Solo cuando el relevamiento todavía no es representativo. Es el
          producto del concepto del mínimo: sin esta banda, el mínimo sería una
          etiqueta más; con ella, cambia cómo se lee el informe. */}
      {(avance.estado === 'en_desarrollo' || avance.estado === 'incompleta') && (
        <div className={`rounded-xl border p-4 mb-3 flex items-start gap-3 ${
          avance.estado === 'en_desarrollo'
            ? 'bg-amber-50 border-amber-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${
            avance.estado === 'en_desarrollo' ? 'text-amber-500' : 'text-gray-400'
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              avance.estado === 'en_desarrollo' ? 'text-amber-800' : 'text-gray-700'
            }`}>
              {avance.estado === 'en_desarrollo'
                ? `Relevamiento en desarrollo — ${avance.pdv} de ${avance.minimo} PDV mínimos`
                : `Campaña cerrada sin alcanzar el mínimo — ${avance.pdv} de ${avance.minimo} PDV`}
            </p>
            <p className={`text-xs mt-0.5 ${
              avance.estado === 'en_desarrollo' ? 'text-amber-700' : 'text-gray-500'
            }`}>
              Los resultados todavía no son representativos.
            </p>
          </div>
        </div>
      )}

      {/* ── Nivel 1: la métrica principal, con su avance ──────────────────
          PDV relevados es la respuesta a "cuánto se hizo", que es la pregunta
          con la que se abre el panel. Absorbe la barra de avance, que antes era
          un bloque aparte. */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp size={12} /> PDV relevados
          </p>
          <BadgeAvance estado={avance.estado} />
        </div>
        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
          <span className="text-4xl font-bold text-gray-900 tabular-nums">{avance.pdv}</span>
          {avance.denominador !== null && (
            <span className="text-sm text-gray-400">
              de {avance.denominador}{avance.tope === null ? ' mínimos' : ''}
            </span>
          )}
          {avance.minimoAlcanzado && avance.tope === null && (
            <span className="text-sm text-green-600">✓ mínimo {avance.minimo}</span>
          )}
        </div>

        {avance.porcentaje !== null ? (
          <div className="mt-3">
            {/* La barra va de 0 al TOPE, y el mínimo es una marca encima. Mismo
                patrón que ya usa el panel del gondolero para el mínimo para
                cobrar. Usar el mínimo de denominador daba "56 de 40": un 140%
                dibujado como 100%. */}
            <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
              {avance.marcaMinimoPct !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                  style={{ left: `${avance.marcaMinimoPct}%` }}
                />
              )}
              <div
                className={`h-full ${tema.barraAvance} rounded-full transition-all`}
                style={{ width: `${avance.porcentaje}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className={avance.minimoAlcanzado ? 'text-green-600' : 'text-amber-500'}>
                {avance.minimo !== null && (avance.minimoAlcanzado
                  ? `✓ mínimo ${avance.minimo} alcanzado`
                  : `mínimo ${avance.minimo}`)}
              </span>
              <span className="text-gray-400">{avance.porcentaje}%</span>
            </div>
          </div>
        ) : avance.minimo === null ? (
          // Las campañas anteriores al cambio no tienen mínimo. No se inventa:
          // se dice, y acá sí, porque es desde donde se puede ir a cargarlo.
          <p className="text-xs text-gray-300 mt-1">Sin mínimo definido</p>
        ) : null}
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
        provincias={provincias}
        ventana={ventana}
        dias={dias}
        enRevision={pdvEnRevision}
      />

      {/* ── De qué está hecha la muestra ───────────────────────────────────
          Arriba de los módulos y no entre ellos: no es una respuesta del
          formulario, es el conjunto sobre el que se leen todas las respuestas
          de abajo. */}
      <DistribucionTipos
        tipos={tiposComercio}
        total={pdvRelevados}
        color={tema.barraModulo}
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
