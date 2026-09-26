/**
 * components/panel/pantalla-mapa.tsx — el mapa de PDV, para marca y para distri.
 *
 * Era el cuerpo de `/marca/mapa`. Se extrajo cuando la distribuidora necesitó
 * el mismo mapa: 200 líneas de controles, referencias y avisos que no tienen
 * nada de específico de un actor. Lo único que cambia entre los dos es de dónde
 * salen las campañas, y eso ya lo resuelve `lib/campanas-de.ts`.
 *
 * La pantalla que lo monta hace auth, resuelve el alcance y trae las filas de
 * `panel_pdv`. Esto dibuja.
 *
 * ── DOS CONTROLES, NO CAPAS APILABLES ───────────────────────────────────────
 * QUÉ SE MUESTRA: todos los PDV del alcance, o los de una campaña.
 * CÓMO SE PINTA:  presencia, o tipo de comercio.
 *
 * Los dos viven en la URL y se renderizan como links, sin un byte de JS. El
 * único estado del cliente es el zoom, que es del usuario. Mismo criterio que
 * el desglose de la serie, y por la misma razón: un mapa con un filtro puesto
 * se puede mandar por chat.
 *
 * ── EL ESTADO ES EL ÚLTIMO CONOCIDO, NO EL DE UN MES ────────────────────────
 * `panel_pdv` agrega todas las visitas de cada comercio: un PDV está "con
 * presencia" si alguna vez se midió afirmativo. Un mapa responde "cómo está
 * hoy"; la evolución ya la cubre la serie mensual del panel.
 *
 * ── LO QUE NO SE PUEDE DIBUJAR SE DECLARA ───────────────────────────────────
 * Un mapa que omite puntos en silencio miente. Al 24/9/2026 son cero sin
 * coordenadas —los 9 de Georgalos que parecían serlo son sin LOCALIDAD, que es
 * otra cosa y también se dice— pero el cartel está escrito para el día que
 * dejen de ser cero, no para hoy. Ese camino no lo ejercita ningún dato real.
 */
import { MapIcon, AlertTriangle } from 'lucide-react'
import { MapaCliente } from '@/components/panel/mapa'
import {
  hrefDelMapa, repartoDe, tieneAnillo,
  type PuntoMapa, type ModoPintado, type EstadoDelMapa,
} from '@/lib/mapa-pdv'
import type { CoberturaDePdv } from '@/lib/cobertura-mapa'
import { etiquetaTipo } from '@/lib/tipos-comercio'

/** Una fila de `panel_pdv`. */
export type FilaPdvMapa = {
  comercio_id: string
  comercio_nombre: string | null
  comercio_tipo: string | null
  lat: number | null
  lng: number | null
  localidad_id: number | null
  localidad_nombre: string | null
  /**
   * Desde `20261008100000`. El mapa no las pinta, pero las necesita para que
   * el filtro de provincia que viene del panel se pueda aplicar sobre las
   * mismas filas — es la misma función `panel_pdv` de los dos lados.
   */
  departamento_id: number | null
  departamento_nombre: string | null
  provincia_id: number | null
  provincia_nombre: string | null
  misiones: number
  con_valor: number
  verdaderos: number
  ultima_medicion: string | null
}

/** Un control: links, no botones. Cero JS y la selección viaja en la URL. */
function Control({ titulo, opciones, activo, href }: {
  titulo: string
  opciones: { valor: string; label: string }[]
  activo: string
  href: (valor: string) => string
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1.5">{titulo}</p>
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {opciones.map(o => (
          <a
            key={o.valor}
            href={href(o.valor)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              o.valor === activo
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {o.label}
          </a>
        ))}
      </div>
    </div>
  )
}

export function PantallaMapa({
  filas, campanas, campanaId, pintar, ruta, apiKey, alcanceClave, panel,
  cobertura, visitasPorSemana, prov,
}: {
  filas: FilaPdvMapa[]
  /** Las campañas del alcance, para el control "qué se muestra". */
  campanas: { id: string; nombre: string }[]
  /**
   * El estado de cobertura por comercio, solo cuando la campaña elegida es de
   * seguimiento. Vacío en cualquier otro caso, y eso es lo que apaga la opción.
   */
  cobertura?: Map<string, CoberturaDePdv>
  /** La frecuencia de la campaña elegida, para el "2 de 7" de la lista. */
  visitasPorSemana?: number | null
  campanaId: string | null
  pintar: ModoPintado
  /** Las provincias elegidas, para que los controles del mapa no las pierdan. */
  prov?: number[]
  /**
   * La ruta de ESTA pantalla, SIN query. Los links los arma `hrefDelMapa` con
   * el estado completo, así ningún control puede perder un parámetro que otro
   * puso — que es exactamente el bug que tuvo el control de pintado.
   */
  ruta: string
  apiKey: string
  /**
   * Lo que la server action de las fotos necesita para reconstruir el alcance.
   * Viajan como datos: la accion los vuelve a validar contra la sesion.
   */
  alcanceClave?: string | null
  /**
   * Qué panel lo monta. Solo sirve para armar el link a la evidencia de cada
   * comercio desde la lista del grupo: la ruta es distinta en marca y en
   * distribuidora, y `rutaEvidencia` la resuelve.
   */
  panel?: string
}) {
  const puntos: PuntoMapa[] = []
  let sinCoordenadas = 0
  let sinCiudad = 0
  for (const f of filas) {
    if (f.localidad_id === null) sinCiudad++
    if (f.lat === null || f.lng === null) { sinCoordenadas++; continue }
    puntos.push({
      id: f.comercio_id,
      nombre: f.comercio_nombre ?? 'Comercio',
      lat: Number(f.lat),
      lng: Number(f.lng),
      // El último estado conocido: afirmativo alguna vez = con presencia.
      presente: Number(f.con_valor) === 0 ? null : Number(f.verdaderos) > 0,
      tipo: f.comercio_tipo,
      cobertura: cobertura?.get(f.comercio_id)?.estado ?? null,
      visitasSemana: cobertura?.get(f.comercio_id)?.visitas ?? null,
    })
  }

  // ── El modo EFECTIVO ──────────────────────────────────────────────────────
  // `?pintar=cobertura` puede llegar de un link viejo, de una campaña que
  // cambió de modalidad o escrito a mano. Sin datos de cobertura el mapa
  // pintaría los 58 PDV de gris "sin dato", que se lee como que el sistema
  // perdió la medición. Cae a presencia, que es lo que el mapa siempre sabe.
  // El estado completo de la pantalla, en un solo lugar. Cada control lo
  // recibe entero y solo dice qué cambia.
  //
  // ── ÉSTA ES LA TERCERA LISTA, Y EL TIPO NO LA PROTEGE ────────────────────
  // `hrefDelMapa` ya no puede olvidarse una clave —`Serializadores` la exige—
  // pero eso protege cómo se ESCRIBE el estado, no cómo se CONSTRUYE. Todos
  // los campos de `EstadoDelMapa` son opcionales, así que armarlo sin `prov`
  // compila igual y el filtro se perdería en cada clic de los controles.
  // El control de `scripts/probar-href-mapa.ts` recorre las claves del tipo y
  // falla si alguna no sobrevive un ida y vuelta.
  const estado: EstadoDelMapa = { alcance: alcanceClave, campana: campanaId, pintar, prov }

  const ofreceCobertura = (cobertura?.size ?? 0) > 0
  const descarta = pintar === 'cobertura' && !ofreceCobertura
  const modo: ModoPintado = descarta ? 'presencia' : pintar

  if (descarta) {
    // ── UN PARÁMETRO QUE SE DESCARTA SE DICE ──────────────────────────────
    // Sin esto la pantalla vuelve a Presencia sin explicación y se lee como si
    // hubiera cambiado de opinión sola. Fue justo lo que hizo que el bug del
    // `?campana=` perdido pareciera otra cosa: el síntoma visible era el
    // fallback, y la causa estaba dos pasos antes.
    console.warn(
      `[mapa] se pidió pintar=cobertura y se descartó: ` +
      `campaña=${campanaId ?? '(ninguna)'}, alcance=${alcanceClave ?? '(ninguno)'}. ` +
      `Sin una campaña de seguimiento elegida no hay cobertura que pintar.`)
  }

  // La referencia sale del MISMO reparto que pinta los círculos, así que no
  // puede decir una cosa distinta de lo que se ve. Antes eran tres contadores
  // de presencia escritos a mano más una lista de tipos aparte.
  const reparto = repartoDe(puntos, modo)

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapIcon size={18} className="text-gray-400" />
            Mapa de puntos de venta
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {puntos.length} PDV · {modo === 'cobertura'
              ? 'cómo viene la frecuencia de esta semana'
              : 'el último estado conocido de cada uno'}
          </p>
        </div>
      </div>

      {/* ── Los dos controles ─────────────────────────────────────────────── */}
      <div className="flex gap-6 flex-wrap">
        <Control
          titulo="Qué se muestra"
          activo={campanaId ?? ''}
          href={v => hrefDelMapa(ruta, estado, { campana: v || null })}
          opciones={[
            { valor: '', label: 'Todos los PDV' },
            ...campanas.map(c => ({ valor: c.id, label: c.nombre })),
          ]}
        />
        <Control
          titulo="Cómo se pinta"
          activo={modo}
          href={v => hrefDelMapa(ruta, estado, { pintar: v as ModoPintado })}
          opciones={[
            { valor: 'presencia', label: 'Presencia' },
            { valor: 'tipo',      label: 'Tipo de comercio' },
            // La tercera aparece SOLO con una campaña de seguimiento elegida.
            // La frecuencia es de la campaña: sin una elegida —o con una
            // puntual— no hay contra qué medir, y ofrecer un modo que no puede
            // pintar nada es peor que no ofrecerlo.
            ...(ofreceCobertura ? [{ valor: 'cobertura', label: 'Cobertura semanal' }] : []),
          ]}
        />
      </div>

      {/* ── Lo que no se puede dibujar, declarado ─────────────────────────── */}
      {sinCoordenadas > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm border bg-red-50 border-red-200 text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>{sinCoordenadas}</strong> de estos {filas.length} PDV no tienen coordenadas
            y no están en el mapa. El resto de los números de esta pantalla tampoco los cuenta.
          </span>
        </div>
      )}

      {puntos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
          <p className="text-sm text-gray-500">
            {campanaId ? 'Esa campaña todavía no tiene PDV relevados.' : 'Todavía no hay PDV relevados.'}
          </p>
        </div>
      ) : (
        <MapaCliente
          puntos={puntos}
          pintar={modo}
          apiKey={apiKey}
          alcanceClave={alcanceClave}
          campanaId={campanaId}
          panel={panel}
          visitasPorSemana={modo === 'cobertura' ? visitasPorSemana : null}
        />
      )}

      {/* ── Referencias ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex gap-5 flex-wrap text-sm">
          {reparto.map(({ cat, n }) => (
            <span key={cat.clave} className="flex items-center gap-2 text-gray-600">
              <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
              {cat.etiqueta} <strong className="text-gray-900">{n}</strong>
            </span>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Un círculo con un número son varios PDV que a este zoom se tapan entre sí.
          {tieneAnillo(modo) && ' El anillo muestra de qué está hecho el grupo.'}
          {' '}Acercá el mapa o tocalo para abrirlo.
        </p>

        {/* La otra cosa que no se puede esconder: los que no tienen ciudad
            salen igual en el mapa, pero desaparecen de cualquier corte por
            localidad — incluido el de Cobertura por ciudad del panel. */}
        {sinCiudad > 0 && (
          <p className="text-xs text-amber-700 mt-2">
            {sinCiudad} de estos PDV no tienen ciudad asignada. En el mapa se ven igual,
            pero quedan afuera de los cortes por localidad.
          </p>
        )}
      </div>
    </div>
  )
}
