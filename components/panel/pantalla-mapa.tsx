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
import { MapaCliente, type Pintado } from '@/components/panel/mapa'
import { COLOR_PRESENCIA, hrefMapa, type PuntoMapa } from '@/lib/mapa-pdv'
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
  misiones: number
  con_valor: number
  verdaderos: number
  ultima_medicion: string | null
}

const COLOR_TIPO: Record<string, string> = {
  almacen: '#b45309', kiosco: '#7c3aed', autoservicio: '#0891b2',
  dietetica: '#16a34a', mayorista: '#be123c', otro: '#64748b',
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
  filas, campanas, campanaId, pintar, rutaBase, apiKey, alcanceClave, panel,
}: {
  filas: FilaPdvMapa[]
  /** Las campañas del alcance, para el control "qué se muestra". */
  campanas: { id: string; nombre: string }[]
  campanaId: string | null
  pintar: Pintado
  /**
   * La ruta de ESTA pantalla, que puede traer su propia query — el mapa de la
   * distribuidora lleva `?alcance=<marca>`. Los links de los controles se
   * arman con `hrefMapa`, que la conserva: armarlos a mano fue el bug que se
   * comió el alcance en la serie mensual.
   */
  rutaBase: string
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
    })
  }

  const conPresencia = puntos.filter(p => p.presente === true).length
  const sinPresencia = puntos.filter(p => p.presente === false).length
  const sinMedir     = puntos.filter(p => p.presente === null).length
  const tiposPresentes = [...new Set(puntos.map(p => p.tipo ?? 'otro'))].sort()

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapIcon size={18} className="text-gray-400" />
            Mapa de puntos de venta
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {puntos.length} PDV · el último estado conocido de cada uno
          </p>
        </div>
      </div>

      {/* ── Los dos controles ─────────────────────────────────────────────── */}
      <div className="flex gap-6 flex-wrap">
        <Control
          titulo="Qué se muestra"
          activo={campanaId ?? ''}
          href={v => hrefMapa(rutaBase, { campana: v || null })}
          opciones={[
            { valor: '', label: 'Todos los PDV' },
            ...campanas.map(c => ({ valor: c.id, label: c.nombre })),
          ]}
        />
        <Control
          titulo="Cómo se pinta"
          activo={pintar}
          href={v => hrefMapa(rutaBase, { pintar: v === 'tipo' ? 'tipo' : null })}
          opciones={[
            { valor: 'presencia', label: 'Presencia' },
            { valor: 'tipo',      label: 'Tipo de comercio' },
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
          pintar={pintar}
          apiKey={apiKey}
          alcanceClave={alcanceClave}
          campanaId={campanaId}
          panel={panel}
        />
      )}

      {/* ── Referencias ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        {pintar === 'presencia' ? (
          <div className="flex gap-5 flex-wrap text-sm">
            {([
              ['Con presencia', COLOR_PRESENCIA.presente, conPresencia],
              ['Sin presencia', COLOR_PRESENCIA.ausente,  sinPresencia],
              ['Sin medir',     COLOR_PRESENCIA.sinMedir, sinMedir],
            ] as const).map(([label, color, n]) => (
              <span key={label} className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                {label} <strong className="text-gray-900">{n}</strong>
              </span>
            ))}
          </div>
        ) : (
          <div className="flex gap-5 flex-wrap text-sm">
            {tiposPresentes.map(t => (
              <span key={t} className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded-full"
                  style={{ background: COLOR_TIPO[t] ?? '#94a3b8' }} />
                {etiquetaTipo(t)}{' '}
                <strong className="text-gray-900">
                  {puntos.filter(p => (p.tipo ?? 'otro') === t).length}
                </strong>
              </span>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Un círculo con un número son varios PDV que a este zoom se tapan entre sí.
          {pintar === 'presencia' && ' El anillo muestra de qué está hecho el grupo.'}
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
