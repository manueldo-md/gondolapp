'use client'

/**
 * El mapa. Único Client Component de la pantalla.
 *
 * ── QUÉ HACE ACÁ Y NO EN EL SERVIDOR ────────────────────────────────────────
 * Solo dos cosas: el zoom —que es estado del usuario— y el agrupamiento, que
 * depende del zoom. Todo lo demás (qué campaña, cómo se pinta, los PDV) llega
 * resuelto del servidor por la URL, igual que el desglose del dashboard.
 *
 * El agrupamiento vive en `lib/mapa-pdv.ts` y no acá: es la regla que impide
 * que el mapa esconda un PDV, y adentro de un componente la única forma de
 * verificarla sería mirar la pantalla.
 *
 * ── EL CARTEL CUANDO LOS TILES NO CARGAN ────────────────────────────────────
 * Es requisito, no adorno. Sin él, una key vencida o un dominio fuera de la
 * allowlist dan un rectángulo gris con puntitos — que no se lee como "el mapa
 * falló" sino como "no tenés PDV por acá". Es una respuesta, y es falsa.
 *
 * Se miran LOS TILES DE VERDAD, no una sonda aparte. Los eventos `load` y
 * `error` de las imágenes no burbujean, pero sí se pueden escuchar en fase de
 * CAPTURA sobre el contenedor: por eso los `addEventListener(..., true)`.
 *
 * La primera versión usaba una sonda —un tile pedido aparte al montar— y dio un
 * falso positivo en el primer uso real. Ver `decidirFallo` en lib/mapa-pdv.ts:
 * una sonda prueba una request distinta de la que hace el mapa, y cualquier
 * diferencia se convierte en un aviso falso sobre un mapa que anda.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Map, Overlay } from 'pigeon-maps'
import {
  agruparEnMapa, encuadrar, anilloGrupo, colorPunto, textoGrupo, urlTile,
  mensajeFallo, decidirFallo, type PuntoMapa, type GrupoMapa,
} from '@/lib/mapa-pdv'
import { etiquetaTipo } from '@/lib/tipos-comercio'
import { AlertTriangle } from 'lucide-react'

const ALTO = 560

/** Un color por tipo de comercio. El sexto valor del CHECK cae en el default. */
const COLOR_TIPO: Record<string, string> = {
  almacen:      '#b45309',
  kiosco:       '#7c3aed',
  autoservicio: '#0891b2',
  dietetica:    '#16a34a',
  mayorista:    '#be123c',
  otro:         '#64748b',
}
const COLOR_TIPO_DEFAULT = '#94a3b8'

export type Pintado = 'presencia' | 'tipo'

export function MapaCliente({ puntos, pintar, apiKey }: {
  puntos: PuntoMapa[]
  pintar: Pintado
  apiKey: string
}) {
  const inicial = useMemo(() => encuadrar(puntos, 900, ALTO), [puntos])
  const [zoom, setZoom] = useState(inicial.zoom)
  const [abierto, setAbierto] = useState<GrupoMapa | null>(null)

  // ── Los tiles de verdad ───────────────────────────────────────────────────
  // Se cuentan los que cargan y los que fallan, escuchando en fase de captura
  // las imágenes que el mapa ya pide. Sin request extra y sin adivinar cuál
  // tile pedir: son exactamente los que el usuario está mirando.
  const contenedor = useRef<HTMLDivElement>(null)
  const [tiles, setTiles] = useState({ cargados: 0, fallidos: 0 })

  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const esTile = (e: Event) => (e.target as HTMLElement | null)?.tagName === 'IMG'
    const onLoad  = (e: Event) => { if (esTile(e)) setTiles(t => ({ ...t, cargados: t.cargados + 1 })) }
    const onError = (e: Event) => { if (esTile(e)) setTiles(t => ({ ...t, fallidos: t.fallidos + 1 })) }
    // `true` = fase de captura. Los eventos load/error de <img> NO burbujean.
    el.addEventListener('load', onLoad, true)
    el.addEventListener('error', onError, true)
    return () => {
      el.removeEventListener('load', onLoad, true)
      el.removeEventListener('error', onError, true)
    }
  }, [])

  const fallo = decidirFallo({ hayKey: !!apiKey, ...tiles })

  const grupos = useMemo(() => agruparEnMapa(puntos, Math.round(zoom)), [puntos, zoom])

  const colorDe = (g: GrupoMapa): string => {
    if (pintar === 'tipo') {
      const tipos = new Set(g.puntos.map(p => p.tipo ?? 'otro'))
      // Un grupo de tipos mezclados no se pinta del primero: se pinta neutro y
      // el número dice que hay varios. Mismo criterio que la minoría.
      return tipos.size === 1
        ? (COLOR_TIPO[[...tipos][0]] ?? COLOR_TIPO_DEFAULT)
        : COLOR_TIPO_DEFAULT
    }
    return g.puntos.length === 1 ? colorPunto(g.puntos[0]) : ''
  }

  return (
    <div className="space-y-3">
      {fallo && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm border bg-amber-50 border-amber-200 text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{mensajeFallo(fallo).titulo}</p>
            <p className="text-xs mt-0.5 text-amber-800">{mensajeFallo(fallo).detalle}</p>
          </div>
        </div>
      )}

      <div ref={contenedor} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-100" style={{ height: ALTO }}>
        <Map
          provider={(x, y, z, dpr) => urlTile(x, y, z, apiKey, dpr)}
          defaultCenter={inicial.centro}
          defaultZoom={inicial.zoom}
          onBoundsChanged={({ zoom: z }) => setZoom(z)}
          attribution={
            <span className="text-[10px] text-gray-500">
              © <a href="https://www.geoapify.com/" className="underline">Geoapify</a>
              {' · '}© OpenStreetMap contributors
            </span>
          }
        >
          {grupos.map(g => (
            g.puntos.length === 1 ? (
              // El `Marker` de pigeon no acepta `title`, así que el punto
              // suelto también va en un Overlay: así tiene tooltip, y el mismo
              // blanco de click que un grupo. Un pin de 24 px es chico para el
              // dedo, y este panel también se mira desde un celular.
              <Overlay key={g.clave} anchor={[g.lat, g.lng]} offset={[12, 12]}>
                <button
                  onClick={() => setAbierto(g)}
                  title={textoGrupo(g)}
                  aria-label={textoGrupo(g)}
                  className="w-6 h-6 rounded-full ring-2 ring-white shadow cursor-pointer
                    hover:scale-125 transition-transform"
                  style={{ background: colorDe(g) }}
                />
              </Overlay>
            ) : (
              <Overlay key={g.clave} anchor={[g.lat, g.lng]} offset={[17, 17]}>
                <button
                  onClick={() => setAbierto(g)}
                  title={textoGrupo(g)}
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center
                    text-[11px] font-bold text-gray-900 shadow ring-1 ring-black/10
                    hover:scale-110 transition-transform cursor-pointer"
                  style={{
                    // El anillo partido: nada esconde a la minoría. Con el
                    // pintado por tipo el grupo va de un color liso.
                    background: pintar === 'presencia' ? anilloGrupo(g) : colorDe(g),
                  }}
                >
                  <span className="w-[22px] h-[22px] rounded-full bg-white/95 flex items-center justify-center">
                    {g.puntos.length}
                  </span>
                </button>
              </Overlay>
            )
          ))}
        </Map>
      </div>

      {/* Lo que hay adentro del punto o del grupo que se tocó. */}
      {abierto && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-gray-900">{textoGrupo(abierto)}</p>
            <button
              onClick={() => setAbierto(null)}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 shrink-0"
            >
              Cerrar
            </button>
          </div>
          <ul className="divide-y divide-gray-50">
            {abierto.puntos.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-sm text-gray-800 truncate">{p.nombre}</span>
                <span className="text-xs shrink-0 flex items-center gap-2">
                  <span className="text-gray-400">{etiquetaTipo(p.tipo)}</span>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: colorPunto(p) }}
                  />
                  <span className="text-gray-500 w-20 text-right">
                    {p.presente === null ? 'sin medir' : p.presente ? 'con presencia' : 'sin presencia'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
