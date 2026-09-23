/**
 * SerieMensual — la evolución mes a mes de cada métrica.
 *
 * Es lo que justificaba el tramo de métricas: cómo evolucionan la presencia,
 * los frentes y los precios en el tiempo, sumando todas las campañas de la
 * marca. Hasta ahora cada campaña tenía su dashboard y no había forma de
 * compararlas.
 *
 * ── SERVER COMPONENT, Y SVG A MANO ──────────────────────────────────────────
 * El proyecto no tiene ninguna librería de gráficos —`components/panel/cobertura`
 * lo dice en su primera línea y `package.json` lo confirma— así que la línea se
 * dibuja con `<polyline>`. Para 3 a 12 puntos es poco código y, sobre todo,
 * renderiza en el servidor: no hay `dynamic`, no hay `ssr: false`, no hay
 * esqueleto de carga y no viaja un solo kilobyte de JS al cliente.
 *
 * ── UN GRÁFICO POR MÉTRICA, NO UNO CON CINCO LÍNEAS ─────────────────────────
 * Presencia es un porcentaje, Precio son pesos y Frentes es un conteo. Meterlos
 * en un mismo eje obliga a normalizar, y una vez normalizado el eje no dice
 * nada: la línea de precios y la de presencia se cruzarían en un punto que no
 * significa nada. Cada métrica tiene su escala y su unidad.
 *
 * ── LA BASE VA DEBAJO DE CADA PUNTO, SIEMPRE VISIBLE ────────────────────────
 * Es el pedido central del tramo: "60% a 78%" sin decir sobre cuántos PDV se
 * calculó cada uno es mentira. Podría haber ido en un tooltip, pero un tooltip
 * no existe en un celular y no aparece en una captura de pantalla — que es como
 * este gráfico va a viajar dentro de la marca. Así que el eje X tiene dos
 * renglones: el mes y la base.
 *
 * Los `<title>` de cada punto son un extra para el que pasa el mouse, no el
 * lugar donde vive el dato.
 *
 * ── EL DESGLOSE VIVE EN LA URL, NO EN UN useState ───────────────────────────
 * Tocar un punto navega a `?metrica=precio&mes=2026-04` y el servidor rinde el
 * detalle. Se evaluaron tres formas y esta ganó por dos razones concretas:
 *
 *   · El panel sigue sin mandar JS. Un `useState` obligaba a convertir todo el
 *     bloque en Client Component, y con él los cinco gráficos.
 *   · **El link se puede mandar.** El caso real es alguien de la marca
 *     diciendo "mirá el salto de precio de abril": con la selección en la URL
 *     manda el link y el otro ve exactamente eso. Con estado en memoria tiene
 *     que explicar dónde tocar.
 *
 * Es además el patrón que el proyecto ya usa (`searchParams.tab` en los
 * resultados por campaña).
 *
 * El costo, dicho de frente: cada click re-rinde la página, o sea las dos RPC
 * más la cascada geográfica. Se aceptó porque el desglose se abre de a uno y
 * porque la alternativa instantánea —`:target` de CSS— es un truco que el
 * próximo que lea esto no va a reconocer.
 */

import type { PanelMarca, SerieMetrica, PuntoSerie, UnidadMetrica } from '@/lib/panel-metricas'
import {
  formatearValor, textoBase, resumenDe, textoPeriodo, huecosDe,
  tramosContinuos, comerciosCompartidos,
} from '@/lib/panel-metricas'

// ── Geometría ────────────────────────────────────────────────────────────────

const PAD_IZQ = 46   // espacio para las etiquetas del eje Y
const PAD_DER = 14
const PAD_SUP = 14
const ALTO_AREA = 118
const PAD_INF = 42   // dos renglones: mes y base
const PASO_MIN = 52

const COLOR: Record<string, string> = {
  presencia:      '#16a34a',
  quiebre_stock:  '#dc2626',
  frentes:        '#4f46e5',
  precio:         '#b45309',
  exhibicion_pop: '#0891b2',
}
const COLOR_DEFAULT = '#64748b'

/**
 * La escala vertical.
 *
 * Un porcentaje va de 0 a 100 SIEMPRE, aunque los valores estén entre 78 y 80.
 * Con eje automático, una variación de dos puntos se dibuja como una montaña y
 * el gráfico exagera: es la forma más común de mentir con una línea, y acá el
 * número decide plata.
 *
 * Las métricas numéricas no tienen un techo natural —un precio no va de 0 a
 * 100— así que ahí el eje sí se ajusta, pero **siempre desde 0**. Un eje de
 * precios que arranca en 3.500 convierte un 3% de variación en un derrumbe.
 */
function escala(serie: SerieMetrica): { min: number; max: number } {
  if (serie.unidad === 'porcentaje') return { min: 0, max: 100 }
  const valores = serie.puntos.map(p => p.valor).filter((v): v is number => v !== null)
  if (valores.length === 0) return { min: 0, max: 1 }
  const max = Math.max(...valores)
  // Un poco de aire arriba para que el punto más alto no toque el borde.
  return { min: 0, max: max > 0 ? max * 1.15 : 1 }
}

export interface Seleccion { metrica: string; mes: string }

/**
 * El ancla del punto: abre el desglose, o lo cierra si ya era el abierto.
 *
 * `rutaBase` viene de quien monta el componente y no de una constante: la
 * misma serie la usan el panel de marca y el de distribuidora, y el desglose
 * navega a SU propia pantalla. Era `const RUTA = '/marca/dashboard'`.
 *
 * ── Y PUEDE TRAER SU PROPIA QUERY ───────────────────────────────────────────
 * El panel de la distribuidora monta esto con
 * `/distribuidora/panel?alcance=<marca>`, porque el alcance es un control
 * obligatorio. La primera versión pegaba un `?` fijo, así que tocar un punto
 * **se comía el alcance** y la pantalla volvía al estado sin elegir, en blanco:
 * el desglose que se pedía no llegaba a dibujarse nunca.
 *
 * El separador se decide mirando la ruta, y el "cerrar" devuelve `rutaBase`
 * tal cual, que ya conserva lo que traía.
 */
function hrefPunto(rutaBase: string, clave: string, mes: string, abierto: boolean): string {
  if (abierto) return rutaBase
  const sep = rutaBase.includes('?') ? '&' : '?'
  return `${rutaBase}${sep}metrica=${encodeURIComponent(clave)}&mes=${mes}`
}

// ── Gráfico ──────────────────────────────────────────────────────────────────

function Grafico({ serie, meses, seleccion, rutaBase }: {
  serie: SerieMetrica; meses: string[]; seleccion?: Seleccion; rutaBase: string
}) {
  const color = COLOR[serie.slug] ?? COLOR_DEFAULT
  const { min, max } = escala(serie)

  const paso  = Math.max(PASO_MIN, 1)
  const ancho = PAD_IZQ + PAD_DER + Math.max(1, meses.length - 1) * paso
  const alto  = PAD_SUP + ALTO_AREA + PAD_INF

  const x = (i: number) => PAD_IZQ + i * paso
  const y = (v: number) => PAD_SUP + ALTO_AREA - ((v - min) / (max - min)) * ALTO_AREA

  // Un punto por mes del eje, o null si ese mes no se midió.
  const porMes = new Map(serie.puntos.map(p => [p.mes, p]))
  const puntos = meses.map((mes, i) => {
    const p = porMes.get(mes)
    return p && p.valor !== null ? { i, mes, punto: p, cx: x(i), cy: y(p.valor) } : null
  })

  // Dónde se corta la línea lo decide `lib/panel-metricas`, no este archivo: es la
  // regla del tramo —un mes sin datos no se interpola— y acá no se podría
  // verificar más que mirando el gráfico.
  const tramos = tramosContinuos(serie, meses)

  const etiquetaY = (v: number) =>
    serie.unidad === 'porcentaje' ? `${v}%` : formatearValor(v, serie.unidad)

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Evolución mensual de ${serie.nombre}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Grilla y eje Y — tres líneas alcanzan para leer una tendencia. */}
      {[0, 0.5, 1].map(f => {
        const v  = min + (max - min) * f
        const yy = y(v)
        return (
          <g key={f}>
            <line
              x1={PAD_IZQ} y1={yy} x2={ancho - PAD_DER} y2={yy}
              stroke="#e5e7eb" strokeWidth="1"
            />
            <text
              x={PAD_IZQ - 8} y={yy + 3.5}
              textAnchor="end" fontSize="10" fill="#9ca3af"
            >
              {etiquetaY(Math.round(v * 10) / 10)}
            </text>
          </g>
        )
      })}

      {/* La línea, en tramos. Un tramo de un solo punto no dibuja polyline
          —no hay línea entre un punto y sí mismo— y queda solo el círculo. */}
      {tramos.filter(t => t.length > 1).map((t, i) => (
        <polyline
          key={i}
          points={t.map(idx => `${puntos[idx]!.cx},${puntos[idx]!.cy}`).join(' ')}
          fill="none" stroke={color} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        />
      ))}

      {/* Los puntos, cada uno un link al desglose.
          El área clickeable es la COLUMNA entera y no el círculo: un círculo de
          4px es un blanco imposible con el dedo, y este panel se mira también
          desde un celular. El rect es transparente y va primero para que quede
          debajo del punto. */}
      {puntos.filter(p => p !== null).map(p => {
        const abierto = seleccion?.metrica === serie.slug && seleccion?.mes === p!.mes
        return (
          <a key={p!.mes} href={hrefPunto(rutaBase, serie.clave, p!.mes, abierto)}>
            {/* UN solo nodo de texto. Con dos hijos, React avisa que el
                browser va a renderizar el markup como texto adentro del
                tooltip — y el typecheck no lo agarra. */}
            <title>
              {`${p!.punto.etiqueta}: ${formatearValor(p!.punto.valor, serie.unidad)}`
               + ` — ${textoBase(p!.punto)}`
               + (abierto ? ' (tocá para cerrar)' : ' — tocá para ver por campaña')}
            </title>
            <rect
              x={p!.cx - paso / 2} y={PAD_SUP}
              width={paso} height={ALTO_AREA + PAD_INF}
              fill="transparent"
            />
            {abierto && (
              <circle cx={p!.cx} cy={p!.cy} r="9" fill={color} opacity="0.18" />
            )}
            <circle
              cx={p!.cx} cy={p!.cy} r={abierto ? 5.5 : 4}
              fill={color} stroke="#fff" strokeWidth="1.5"
            />
          </a>
        )
      })}

      {/* Eje X: dos renglones. El de abajo es la BASE DE CÁLCULO, que es el
          punto del tramo entero. Un mes sin medición lleva una raya, no un
          cero: "no medimos" y "medimos y dio cero" no son lo mismo. */}
      {meses.map((mes, i) => {
        const p = porMes.get(mes)
        return (
          <g key={mes}>
            <text
              x={x(i)} y={PAD_SUP + ALTO_AREA + 16}
              textAnchor="middle" fontSize="10" fill="#6b7280"
            >
              {(p?.etiqueta ?? mesCorto(mes)).replace(/\s\d{4}$/, '')}
            </text>
            <text
              x={x(i)} y={PAD_SUP + ALTO_AREA + 30}
              textAnchor="middle" fontSize="10"
              fill={p ? '#9ca3af' : '#d1d5db'}
              fontWeight={p ? 500 : 400}
            >
              {p ? p.basePdv : '—'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** `'2026-03'` → `'mar'`. Solo para los meses sin punto, que no traen etiqueta. */
function mesCorto(mes: string): string {
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
  const m = Number(mes.slice(5, 7))
  return MESES[m - 1] ?? '—'
}

// ── El desglose de un punto ──────────────────────────────────────────────────

const NOMBRE_FUENTE: Record<string, string> = {
  respuestas:       'preguntas de la campaña',
  declaracion_foto: 'declaración del gondolero',
}

/**
 * Qué campañas componen un punto.
 *
 * ── POR QUÉ ESTO NO ES UN LUJO ──────────────────────────────────────────────
 * El precio de Georgalos pasa de $3.779 en abril a $2.690 en septiembre. Eso
 * NO es una baja de precios: son dos campañas distintas, una sobre 23 PDV y
 * otra sobre 2. Sin poder abrir el punto, la marca ve un derrumbe del 29% y no
 * tiene forma de averiguar que no ocurrió — y con razón no se lo va a creer.
 *
 * La suma de los desgloses no tiene por qué dar el total, y eso está dicho en
 * pantalla cuando pasa: `basePdv` es un COUNT(DISTINCT comercio), así que un
 * comercio relevado por dos campañas el mismo mes cuenta una vez arriba y una
 * vez en cada fila. Callarlo dejaría al lector haciendo una resta que no cierra.
 */
function Desglose({ serie, punto, rutaBase }: { serie: SerieMetrica; punto: PuntoSerie; rutaBase: string }) {
  const filas = punto.desglose
  const compartidos = comerciosCompartidos(punto)
  const fuentes = new Set(filas.map(d => d.fuente))

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {punto.etiqueta} · {formatearValor(punto.valor, serie.unidad)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{textoBase(punto)}</p>
        </div>
        <a
          href={rutaBase}
          className="text-xs text-gray-400 hover:text-gray-600 shrink-0 underline underline-offset-2"
        >
          Cerrar
        </a>
      </div>

      {filas.length === 0 ? (
        <p className="text-xs text-gray-400">
          Sin desglose disponible para este punto.
        </p>
      ) : (
        <ul className="space-y-2">
          {filas.map(d => (
            <li key={`${d.campanaId}|${d.fuente}`} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{d.campanaNombre}</p>
                <p className="text-xs text-gray-400">
                  {d.observaciones} observaci{d.observaciones === 1 ? 'ón' : 'ones'}
                  {' · '}{d.basePdv} PDV
                  {/* La fuente solo cuando hay más de una: si todas vienen de
                      lo mismo, repetirlo en cada fila es ruido. */}
                  {fuentes.size > 1 && <> · {NOMBRE_FUENTE[d.fuente] ?? d.fuente}</>}
                </p>
              </div>
              <p className="text-sm font-medium text-gray-900 shrink-0">
                {formatearValor(d.valor, serie.unidad)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {compartidos > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          Los PDV de las campañas suman más que los del mes:
          hay {compartidos} comercio{compartidos === 1 ? '' : 's'} que relevó más de una
          campaña, y en el total del mes cuenta una sola vez.
        </p>
      )}
    </div>
  )
}

// ── Una métrica ──────────────────────────────────────────────────────────────

function TarjetaSerie({ serie, meses, seleccion, rutaBase }: {
  serie: SerieMetrica; meses: string[]; seleccion?: Seleccion; rutaBase: string
}) {
  // Por `clave` y no por `slug`: dos tarjetas de Precio de campañas distintas
  // comparten el slug, y con él las dos abrirían el desglose a la vez.
  const puntoAbierto = seleccion?.metrica === serie.clave
    ? serie.puntos.find(p => p.mes === seleccion.mes)
    : undefined
  const resumen = resumenDe(serie)
  const huecos  = huecosDe(serie, meses)

  // ── UN SOLO PUNTO NO NECESITA GRÁFICO ──────────────────────────────────────
  // Con una sola medición el eje se estira para acomodar un punto —0 a 15.008
  // para un valor de 13.050— y la tipografía del SVG crece con él. Peor que
  // feo: un gráfico dibuja una tendencia, y con un punto no hay ninguna que
  // mostrar. El número y su base dicen todo lo que hay.
  //
  // Se cuentan los puntos CON VALOR y no los puntos a secas: un mes con
  // observaciones y sin valor usable no se dibuja, así que tampoco cuenta para
  // decidir si hay algo que graficar.
  const conValor = serie.puntos.filter(p => p.valor !== null)
  const hayEvolucion = conValor.length > 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">{serie.nombre}</h4>
          {/* Una métrica numérica se dibuja una serie POR CAMPAÑA, porque cada
              campaña mide un producto distinto. Sin el nombre al lado, dos
              tarjetas de "Precio" con números muy distintos se leen como un
              error. Ver esAgregableEntreCampanas en lib/panel-metricas.ts. */}
          {serie.campanaNombre && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{serie.campanaNombre}</p>
          )}
          {resumen && (
            <p className="text-xs text-gray-400 mt-0.5">
              {resumen.observaciones} observaci{resumen.observaciones === 1 ? 'ón' : 'ones'}
              {' · '}{textoPeriodo(resumen)}
            </p>
          )}
        </div>
        {resumen && (
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-gray-900 leading-none">
              {formatearValor(resumen.valor, serie.unidad)}
            </p>
            <p className="text-xs text-gray-400 mt-1">en total</p>
          </div>
        )}
      </div>

      {hayEvolucion ? (
        <div className="px-4 pt-4 pb-2 overflow-x-auto">
          <Grafico serie={serie} meses={meses} seleccion={seleccion} rutaBase={rutaBase} />
        </div>
      ) : (
        <UnicoPunto serie={serie} />
      )}

      <div className="px-5 pb-4 space-y-1">
        <p className="text-xs text-gray-400">
          El número de abajo de cada mes son los <strong className="font-medium text-gray-500">PDV
          sobre los que se calculó</strong>. Sin eso, dos meses no se pueden comparar.
        </p>
        {/* Un corte se explica en palabras, además de verse. Sin esto, el hueco
            se puede leer como un problema del gráfico en vez de como lo que es:
            meses en los que no se midió esta métrica. */}
        {huecos.length > 0 && (
          <p className="text-xs text-amber-700">
            {huecos.length === 1
              ? `En ${mesCorto(huecos[0])} no se midió, por eso la línea se corta.`
              : `Sin mediciones en ${huecos.length} meses del período, por eso la línea se corta.`}
          </p>
        )}
        {hayEvolucion && !puntoAbierto && (
          <p className="text-xs text-gray-400">
            Tocá un punto para ver qué campañas lo componen.
          </p>
        )}
      </div>

      {puntoAbierto && <Desglose serie={serie} punto={puntoAbierto} rutaBase={rutaBase} />}
    </div>
  )
}

/**
 * Lo que se muestra en lugar del gráfico cuando hay una sola medición.
 *
 * Dice el valor, de qué mes es y sobre qué se calculó — la misma base que el
 * eje del gráfico pone bajo cada punto. Lo único que se pierde es la
 * comparación, que con un punto no existe.
 */
function UnicoPunto({ serie }: { serie: SerieMetrica }) {
  const punto = serie.puntos.find(p => p.valor !== null)

  if (!punto) {
    return (
      <div className="px-5 py-5">
        <p className="text-sm text-gray-500">
          Hay observaciones pero ninguna con un valor usable, así que no hay número que mostrar.
        </p>
      </div>
    )
  }

  return (
    <div className="px-5 py-5 flex items-baseline gap-3 flex-wrap">
      <span className="text-3xl font-bold text-gray-900 leading-none">
        {formatearValor(punto.valor, serie.unidad)}
      </span>
      <span className="text-sm text-gray-500">en {punto.etiqueta}</span>
      <span className="text-xs text-gray-400">· {textoBase(punto)}</span>
      <p className="w-full text-xs text-gray-400 mt-1">
        Una sola medición: todavía no hay evolución que mostrar. Con un mes más, acá va el gráfico.
      </p>
    </div>
  )
}

// ── El bloque completo ───────────────────────────────────────────────────────

export function SerieMensual({ panel, seleccion, rutaBase }: {
  panel: PanelMarca
  /** El punto abierto, desde la URL. Ver el encabezado. */
  seleccion?: Seleccion
  /** La pantalla que monta esta serie: a dónde navega el desglose. */
  rutaBase: string
}) {
  // ── Regla: una métrica sin datos no se dibuja ──────────────────────────────
  // `armarPanel` ya las dejó afuera, así que acá no hay nada que filtrar. Si
  // NINGUNA tiene datos, el bloque entero se reemplaza por el vacío explicado:
  // cinco tarjetas en blanco no dicen "no medimos", dicen "dio cero".
  if (panel.vacio) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
        <p className="text-sm text-gray-500">
          Todavía no hay métricas para mostrar en el tiempo.
        </p>
        <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto">
          La evolución se arma con las preguntas tipificadas de tus campañas.
          {panel.noMedidas.length > 0 && (
            <> Pedile a quien crea la campaña que tipifique las preguntas con la
            métrica que querés seguir.</>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-semibold text-gray-900">Evolución mensual</h3>
        <p className="text-xs text-gray-400">
          Todas tus campañas, sumadas por mes
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {panel.series.map(serie => (
          <TarjetaSerie key={serie.slug} serie={serie} meses={panel.meses} seleccion={seleccion} rutaBase={rutaBase} />
        ))}
      </div>

      {/* Las que NO se están midiendo, nombradas. Es accionable: la marca puede
          pedir que se tipifique la pregunta. Un gráfico vacío no habría dicho
          nada de esto y además habría dibujado ceros que nadie midió. */}
      {panel.noMedidas.length > 0 && (
        <p className="text-xs text-gray-400 px-1">
          No se {panel.noMedidas.length === 1 ? 'está midiendo' : 'están midiendo'}{' '}
          <span className="text-gray-500">
            {panel.noMedidas.map(m => m.nombre).join(', ')}
          </span>
          {' '}en ninguna de tus campañas.
        </p>
      )}
    </div>
  )
}
