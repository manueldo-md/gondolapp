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
  mensajeFallo, decidirFallo, type PuntoMapa, type GrupoMapa, type ModoPintado,
} from '@/lib/mapa-pdv'
import { etiquetaTipo } from '@/lib/tipos-comercio'
import { rutaEvidencia } from '@/lib/linea-comercio'
import { formatearInstante } from '@/lib/fecha-ar'
import { AlertTriangle, X } from 'lucide-react'
import { fotosDeLaLista, type FotoDeLista } from './acciones-mapa'

const ALTO = 560


export function MapaCliente({
  puntos, pintar, apiKey, alcanceClave, campanaId, panel, visitasPorSemana,
}: {
  puntos: PuntoMapa[]
  pintar: ModoPintado
  apiKey: string
  /**
   * Los dos parámetros que la server action necesita para reconstruir el
   * alcance. Viajan como datos, no como permiso: la acción los vuelve a
   * validar contra la sesión. Ver components/panel/acciones-mapa.ts.
   */
  alcanceClave?: string | null
  campanaId?: string | null
  /**
   * Qué panel lo monta, para armar el link a la evidencia de cada comercio.
   * Es el `Panel` de `modulos/tema.ts`: `'marca'` o `'distri'`.
   */
  panel?: string
  /**
   * La frecuencia de la campaña elegida. Llega solo con el modo cobertura
   * activo, y es lo que convierte un "2" en un "2 de 7".
   */
  visitasPorSemana?: number | null
}) {
  const hrefEvidencia = (comercioId: string) =>
    rutaEvidencia({ panel: panel ?? '', comercioId, alcance: alcanceClave, campanaId })

  const inicial = useMemo(() => encuadrar(puntos, 900, ALTO), [puntos])
  const [zoom, setZoom] = useState(inicial.zoom)
  const [abierto, setAbierto] = useState<GrupoMapa | null>(null)

  // ── Las fotos de la lista ─────────────────────────────────────────────────
  // Se piden AL ABRIR un grupo, no antes: firmar en el render de la página
  // serían 58 tokens de una hora emitidos para que alguien mire tres.
  const [fotos, setFotos] = useState<Record<string, FotoDeLista>>({})
  const [cargandoFotos, setCargandoFotos] = useState(false)
  const [ampliada, setAmpliada] = useState<{ url: string; nombre: string; instante: string } | null>(null)

  /**
   * Los comercios que YA se preguntaron, con foto o sin ella.
   *
   * Va en un ref y no en el estado por dos razones. Una: los grupos se solapan
   * al hacer zoom, así que sin memoria cada movimiento del mapa volvería a
   * pedir lo mismo. Y dos: si esto viviera en `fotos`, el efecto tendría que
   * depender de `fotos` y además escribirlo, o sea correr de nuevo cada vez que
   * él mismo lo cambia. Un ref no dispara render y no entra en las deps.
   *
   * Es importante marcar también los que NO tienen foto: sin eso, un comercio
   * sin foto se vuelve a consultar en cada apertura, para siempre.
   */
  const preguntados = useRef<Set<string>>(new Set())

  // El alcance cambió: lo cacheado es de otro conjunto de campañas y hay que
  // olvidarlo. Sin esto, cambiar de marca dejaría los thumbs de la anterior.
  useEffect(() => {
    preguntados.current = new Set()
    setFotos({})
  }, [alcanceClave, campanaId])

  useEffect(() => {
    if (!abierto) return
    const faltan = abierto.puntos.map(p => p.id).filter(id => !preguntados.current.has(id))
    if (faltan.length === 0) return

    // Se marcan ANTES de pedir: si el usuario abre y cierra rápido, no se
    // dispara la misma consulta dos veces.
    for (const id of faltan) preguntados.current.add(id)

    let vivo = true
    setCargandoFotos(true)
    fotosDeLaLista({ comercioIds: faltan, alcanceClave, campanaId })
      .then(lista => {
        if (!vivo) return
        setFotos(prev => {
          const sig = { ...prev }
          for (const f of lista) sig[f.comercioId] = f
          return sig
        })
      })
      .catch(e => {
        // Si falló, se desmarcan: la próxima apertura vuelve a intentar. Si no,
        // un corte de red momentáneo dejaría esos comercios sin foto para
        // siempre, sin nada que lo explique.
        for (const id of faltan) preguntados.current.delete(id)
        console.error('[mapa] no se pudieron traer las fotos:', e)
      })
      .finally(() => { if (vivo) setCargandoFotos(false) })

    return () => { vivo = false }
  }, [abierto, alcanceClave, campanaId])

  // ── Los tiles de verdad ───────────────────────────────────────────────────
  // Se cuentan los que cargan y los que fallan, escuchando en fase de captura
  // las imágenes que el mapa ya pide. Sin request extra y sin adivinar cuál
  // tile pedir: son exactamente los que el usuario está mirando.
  const contenedor = useRef<HTMLDivElement>(null)
  const [tiles, setTiles] = useState({ cargados: 0, fallidos: 0 })

  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const tileDe = (e: Event) => {
      const el = e.target as HTMLElement | null
      return el?.tagName === 'IMG' ? (el as HTMLImageElement) : null
    }

    const onLoad = (e: Event) => {
      const img = tileDe(e)
      if (!img) return
      // Si el mismo <img> se reusa con un src nuevo que sí carga, vuelve a
      // mostrarse. Sin esto quedaría oculto para siempre después de un fallo.
      img.style.visibility = ''
      setTiles(t => ({ ...t, cargados: t.cargados + 1 }))
    }

    const onError = (e: Event) => {
      const img = tileDe(e)
      if (!img) return
      // ── UN TILE QUE FALLA NO DEJA UN ÍCONO DE IMAGEN ROTA ─────────────────
      // `pigeon-maps` no tiene `onError`: su `ImgTile` solo pasa `onLoad`
      // (verificado en el bundle, cero ocurrencias). Y aunque pone `alt=''`,
      // Chrome igual dibuja el ícono roto cuando el <img> tiene ancho y alto
      // explícitos, que es el caso.
      //
      // Ocultarlo deja ver el fondo del mapa, que se lee como "esta parte no
      // cargó". El ícono roto se lee como "la app está rota", que es otra cosa
      // y no es cierta: el resto del mapa y todos los puntos están bien.
      //
      // Se hace acá y no con un `tileComponent` propio —pigeon lo permite—
      // porque el listener ya existe para contar, y una copia de `ImgTile`
      // habría que mantenerla sincronizada con la de la librería.
      img.style.visibility = 'hidden'
      setTiles(t => ({ ...t, fallidos: t.fallidos + 1 }))
    }
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
                  title={textoGrupo(g, pintar)}
                  aria-label={textoGrupo(g, pintar)}
                  className="w-6 h-6 rounded-full ring-2 ring-white shadow cursor-pointer
                    hover:scale-125 transition-transform"
                  style={{ background: colorPunto(g.puntos[0], pintar) }}
                />
              </Overlay>
            ) : (
              <Overlay key={g.clave} anchor={[g.lat, g.lng]} offset={[17, 17]}>
                <button
                  onClick={() => setAbierto(g)}
                  title={textoGrupo(g, pintar)}
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center
                    text-[11px] font-bold text-gray-900 shadow ring-1 ring-black/10
                    hover:scale-110 transition-transform cursor-pointer"
                  style={{
                    // El anillo partido: nada esconde a la minoría. `anilloGrupo`
                    // decide solo si el modo lleva proporciones —presencia y
                    // cobertura sí, tipo de comercio no— así que acá no hay
                    // ninguna rama por modo.
                    background: anilloGrupo(g, pintar),
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

      {/* La foto ampliada. Es un overlay y no una pantalla nueva: el que la
          abre está comparando puntos, y sacarlo del mapa le hace perder el
          contexto que vino a mirar. */}
      {ampliada && (
        <div
          onClick={() => setAmpliada(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-baseline justify-between gap-3 mb-2 text-white">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{ampliada.nombre}</p>
                {/* La fecha no es decorativa: sin ella, una foto de marzo al
                    lado de un número de hoy se lee como si fuera de hoy. */}
                <p className="text-xs text-white/60">
                  {formatearInstante(ampliada.instante, { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setAmpliada(null)}
                aria-label="Cerrar"
                className="text-white/70 hover:text-white shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ampliada.url} alt={`Góndola de ${ampliada.nombre}`}
              className="w-full max-h-[80vh] object-contain rounded-xl bg-black/40" />
          </div>
        </div>
      )}

      {/* Lo que hay adentro del punto o del grupo que se tocó. */}
      {abierto && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-gray-900">{textoGrupo(abierto, pintar)}</p>
            <button
              onClick={() => setAbierto(null)}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 shrink-0"
            >
              Cerrar
            </button>
          </div>
          <ul className="divide-y divide-gray-50">
            {abierto.puntos.map(p => {
              const foto = fotos[p.id]
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  {/* El thumb es un BOTÓN y se abre con tap o click, no con
                      hover: en un celular el hover no existe, y este panel
                      también se mira desde un celular. */}
                  {foto ? (
                    <button
                      onClick={() => setAmpliada({ url: foto.url, nombre: p.nombre, instante: foto.instante })}
                      title={`Ver la foto de ${p.nombre}`}
                      aria-label={`Ampliar la foto de ${p.nombre}`}
                      className="w-11 h-11 rounded-lg overflow-hidden bg-gray-100 shrink-0
                        ring-1 ring-gray-200 hover:ring-gray-400 transition-shadow cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.url} alt="" className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                    </button>
                  ) : (
                    <div className="w-11 h-11 rounded-lg shrink-0 bg-gray-50 ring-1 ring-gray-100
                      flex items-center justify-center">
                      <span className="text-[9px] text-gray-300 text-center leading-tight px-1">
                        {cargandoFotos && !preguntados.current.has(p.id) ? '···' : 'sin foto'}
                      </span>
                    </div>
                  )}

                  {/* El nombre lleva a la evidencia de ese comercio: cómo viene su
                      góndola en el tiempo. El mapa dice DÓNDE y pinta el último
                      estado; la línea dice CÓMO VENÍA, que es la pregunta
                      siguiente y hasta ahora no tenía por dónde entrarse.
                      `rutaEvidencia` devuelve null donde esa pantalla no existe. */}
                  {hrefEvidencia(p.id)
                    ? (
                      <a
                        href={hrefEvidencia(p.id) as string}
                        className="text-sm text-gray-800 truncate flex-1 min-w-0 hover:text-gondo-amber-600 hover:underline"
                        title={`Ver la evolución de ${p.nombre}`}
                      >
                        {p.nombre}
                      </a>
                    )
                    : <span className="text-sm text-gray-800 truncate flex-1 min-w-0">{p.nombre}</span>}

                  <span className="text-xs shrink-0 flex items-center gap-2">
                    <span className="text-gray-400">{etiquetaTipo(p.tipo)}</span>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: colorPunto(p, pintar) }}
                    />
                    {/* Con cobertura la lista dice las VISITAS DE LA SEMANA, no
                        el estado de presencia: es el número por el que se entró
                        a este modo, y el color de al lado ya dice el veredicto.
                        Sale de la misma consulta que pintó el punto — no hay
                        una segunda. */}
                    <span className="text-gray-500 w-24 text-right">
                      {pintar === 'cobertura'
                        ? (p.visitasSemana == null
                            ? 'sin dato'
                            : `${p.visitasSemana} de ${visitasPorSemana ?? '?'}`)
                        : p.presente === null ? 'sin medir'
                        : p.presente ? 'con presencia' : 'sin presencia'}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
