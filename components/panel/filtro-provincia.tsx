/**
 * components/panel/filtro-provincia.tsx — el selector de provincias y el aviso
 * de lo que queda afuera.
 *
 * Server component: son links, no estado. La selección vive en la URL, que es
 * como se comparte "Mesopotamia" — se copia y se manda.
 *
 * ── SIN "TODAS" COMO OPCIÓN CLICKEABLE APARTE ───────────────────────────────
 * Deseleccionar la última provincia ya deja la URL sin la clave, y eso ES
 * "todas". Un botón "Todas" además de eso daría dos caminos al mismo estado y
 * la pregunta de qué pasa si están las dos cosas prendidas. El chip "Ver
 * todas" aparece SOLO cuando hay filtro, y es un atajo para borrarlo.
 */
import Link from 'next/link'
import { MapPin, Info } from 'lucide-react'
import {
  alternarProvincia,
  type ProvinciaDisponible,
  type ResultadoFiltro,
  type FilaConProvincia,
} from '@/lib/filtro-provincia'

export function SelectorProvincia({
  provincias,
  seleccion,
  href,
}: {
  provincias: ProvinciaDisponible[]
  seleccion: number[]
  /** Arma el link para una selección dada. La pantalla sabe qué más va en la URL. */
  href: (seleccion: number[]) => string
}) {
  // Con una sola provincia no hay nada que elegir, y un selector de una opción
  // es ruido que además invita a apretarlo para no ver nada. **Es el caso
  // normal, no el borde**: cinco de ocho alcances tienen una sola provincia.
  if (provincias.length <= 1) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="flex items-center gap-1 text-xs font-medium text-gray-400 shrink-0">
        <MapPin size={12} /> Provincia
      </span>

      {provincias.map(p => {
        const activa = seleccion.includes(p.id)
        return (
          <Link
            key={p.id}
            href={href(alternarProvincia(seleccion, p.id))}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              activa
                ? 'bg-gondo-indigo-600 border-gondo-indigo-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.nombre}
            <span className={`ml-1.5 ${activa ? 'text-white/70' : 'text-gray-400'}`}>{p.pdv}</span>
          </Link>
        )
      })}

      {seleccion.length > 0 && (
        <Link
          href={href([])}
          className="text-xs font-medium text-gray-400 hover:text-gray-600 underline px-1"
        >
          Ver todas
        </Link>
      )}
    </div>
  )
}

/**
 * Lo que el filtro dejó afuera.
 *
 * ── NO ES CORTESÍA ──────────────────────────────────────────────────────────
 * Un alcance que se vacía entero **se lee como "no hay datos"**, y ésa es una
 * conclusión de negocio equivocada sacada de un filtro estricto. El aviso es
 * lo que distingue "no hay" de "no estás mirando".
 *
 * ── Y LOS PDV SIN PROVINCIA SON EL CASO FRECUENTE, NO EL RESIDUO ────────────
 * El alta escribe `localidad_sugerida_id`, **no** `localidad_id`: un comercio
 * recién cargado no tiene provincia hasta que la distri confirma la sugerencia
 * en su bandeja de pendientes. O sea que esto se va a disparar seguido y sobre
 * los comercios MÁS NUEVOS — que son justo los que la marca mira.
 *
 * Por eso el texto dice **esperando que la distribuidora confirme la
 * localidad** y no "sin localidad": lo primero es accionable —alguien tiene
 * algo que hacer, y se sabe quién— y lo segundo suena a dato roto.
 */
export function AvisoExcluidos({
  filtro,
  totalSinFiltrar,
}: {
  filtro: ResultadoFiltro<FilaConProvincia>
  /** PDV del alcance antes de filtrar, para decir cuántos se ven de cuántos. */
  totalSinFiltrar: number
}) {
  const partes: string[] = []

  if (filtro.hayFiltro) {
    partes.push(
      `Estás viendo ${filtro.filas.length} de ${totalSinFiltrar} PDV del alcance.`
    )
  }

  if (filtro.sinProvincia > 0) {
    partes.push(
      filtro.sinProvincia === 1
        ? 'Hay 1 PDV que no entra en ninguna provincia porque está esperando que la distribuidora confirme su localidad.'
        : `Hay ${filtro.sinProvincia} PDV que no entran en ninguna provincia porque están esperando que la distribuidora confirme su localidad.`
    )
  }

  if (filtro.desconocidas.length > 0) {
    // Pasa con un link viejo o con una provincia donde se dejó de relevar. No
    // se corrige solo ni se ignora: se dice, porque si no el filtro parece
    // aplicado y no lo está.
    partes.push(
      filtro.desconocidas.length === 1
        ? 'Una de las provincias del link no tiene PDV en este alcance, así que no se aplicó.'
        : `${filtro.desconocidas.length} de las provincias del link no tienen PDV en este alcance, así que no se aplicaron.`
    )
  }

  if (partes.length === 0) return null

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm border bg-amber-50 border-amber-200 text-amber-900">
      <Info size={16} className="mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed">{partes.join(' ')}</p>
    </div>
  )
}

/**
 * El KPI de provincias. **Dos números, y van juntos.**
 *
 * "Relevás en 4, tenés producto en 3" dice algo que ninguno de los dos dice
 * solo: el primero es esfuerzo desplegado y el segundo es resultado.
 *
 * ── CON CERO PROVINCIAS NO SE MUESTRA ───────────────────────────────────────
 * "0 de 0" no es un dato, es una tarjeta ocupando lugar. Mismo criterio que
 * las métricas sin datos del panel, que muestran "—" con "no se está midiendo"
 * en vez de un 0% que diría algo falso. Acá directamente no va: el componente
 * devuelve `null` y la grilla se acomoda.
 */
export function KpiProvincias({
  relevando,
  conProducto,
}: {
  relevando: number
  conProducto: number
}) {
  if (relevando === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
          <MapPin size={16} />
        </div>
        <p className="text-xs font-medium text-gray-500">Provincias</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-tight">
        {conProducto}
        <span className="text-base font-semibold text-gray-400"> de {relevando}</span>
      </p>
      {/* El texto dice qué mide cada número, porque "3 de 4" solo no lo dice.
          Y aclara que el denominador cuenta VISITAS, no mediciones: una
          provincia donde nadie contestó la pregunta de presencia suma en el
          de abajo y no en el de arriba, que es lo que hace útil la pareja. */}
      <p className="text-[11px] text-gray-400 mt-1 leading-tight">
        con producto confirmado, sobre {relevando === 1 ? '1 provincia' : `${relevando} provincias`} donde estás relevando
      </p>
    </div>
  )
}
