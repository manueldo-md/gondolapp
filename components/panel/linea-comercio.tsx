/**
 * components/panel/linea-comercio.tsx — la evidencia de UN comercio, en el tiempo.
 *
 * La monta `/marca/comercio/[id]` y `/distribuidora/comercio/[id]`, igual que el
 * mapa. La página hace auth, resuelve el alcance, verifica que el comercio sea
 * suyo y firma las fotos; esto dibuja.
 *
 * ── QUÉ CONTESTA, Y POR QUÉ NO ES EL MAPA ───────────────────────────────────
 * El mapa dice DÓNDE y pinta el último estado conocido. Esto dice CÓMO VENÍA.
 * Cinco fotos sueltas no dicen nada; ordenadas muestran si la góndola se
 * mantiene o se degrada, y eso es lo que la distribuidora le vende al cliente.
 *
 * ── CADA PUNTO ES UNA VISITA ────────────────────────────────────────────────
 * No una foto. El 42% de las misiones con foto de producción dejan dos, así que
 * con una fila por foto la misma fecha aparecería dos veces. Las N fotos de una
 * visita van adentro de su fila.
 *
 * ── LA MEZCLA DE CAMPAÑAS SE VE ─────────────────────────────────────────────
 * Cada tarjeta lleva el nombre de su campaña. Prohibir la mezcla dejaría huecos
 * en algo que promete ser completo —el gondolero estuvo ahí y sacó esa foto— y
 * además la mezcla es un dato: una auditoría de precios en el medio de una
 * reposición explica por qué esa semana la foto se ve distinta.
 *
 * ── CERO JAVASCRIPT ─────────────────────────────────────────────────────────
 * Es un Server Component y no manda un byte al cliente. Ampliar una foto es un
 * `<a>` a su URL firmada, que el browser abre solo. El visor con overlay del
 * mapa existe porque ahí la lista vive en un componente cliente; acá no hace
 * falta pagar eso.
 */
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Clock, ImageOff, MapPin } from 'lucide-react'
import { etiquetaTipo } from '@/lib/tipos-comercio'
import { formatearInstante, formatearInstanteHora } from '@/lib/fecha-ar'
import {
  normalizarBinaria, normalizarNumero, normalizarSeleccionMultiple, normalizarTexto,
} from '@/lib/resultados-normalizar'
import type { CabeceraComercio } from '@/lib/visitas-comercio'
import { parDeComparacion, siguienteSeleccion } from '@/lib/linea-comercio'
import type { LineaComercio as Linea, Visita, ParComparado } from '@/lib/linea-comercio'
import { hrefMapa } from '@/lib/mapa-pdv'

/** `id → URL mostrable`, como lo devuelve `firmarFotosEnLote`. */
export type UrlsDeFotos = Record<string, string>

/** El valor de una respuesta, en el formato que le corresponde a su tipo. */
function textoDeRespuesta(tipo: string | null, valor: unknown): string {
  switch (tipo) {
    case 'binaria':            return normalizarBinaria(valor) ? 'Sí' : 'No'
    case 'numero': {
      const n = normalizarNumero(valor)
      return n === null ? '—' : n.toLocaleString('es-AR')
    }
    case 'seleccion_multiple': return normalizarSeleccionMultiple(valor).join(', ') || '—'
    default:                   return normalizarTexto(valor) || '—'
  }
}

export function PantallaLineaComercio({
  comercio, linea, urls, volverA, volverTexto, campanaFiltrada, hrefSinFiltro,
  rutaBase, seleccion,
}: {
  comercio: CabeceraComercio
  linea: Linea
  /** Las fotos ya firmadas: la pantalla no toca Storage. */
  urls: UrlsDeFotos
  /** A dónde vuelve el link de arriba. Cada panel tiene su mapa. */
  volverA: string
  volverTexto: string
  /** El nombre de la campaña, si se entró con una elegida. */
  campanaFiltrada?: string | null
  /** La misma pantalla sin el filtro, para poder sacarlo. */
  hrefSinFiltro?: string
  /**
   * Esta misma pantalla con sus parámetros puestos. Los links de la comparación
   * se arman mergeando sobre esto con `hrefMapa`, así el alcance y la campaña
   * no se pierden — es el bug que se comió el alcance en la serie mensual.
   */
  rutaBase: string
  /** El par elegido, si viene en la URL. */
  seleccion?: { a?: string | null; b?: string | null }
}) {
  // El par que se está viendo: el elegido, o la última contra la anterior.
  const par = parDeComparacion(linea.visitas, seleccion)
  // El default, para saber si hay algo a lo que volver. Se compara por id y no
  // por la presencia de los parámetros: una selección que resulta ser el default
  // no es una selección de la que haya que ofrecer salida.
  const porDefault = parDeComparacion(linea.visitas)
  const esDefault = !par || !porDefault ||
    (par.anterior.misionId === porDefault.anterior.misionId &&
     par.ultima.misionId === porDefault.ultima.misionId)

  return (
    <div className="space-y-6 max-w-6xl">
      <Link
        href={volverA}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" />
        {volverTexto}
      </Link>

      <Cabecera comercio={comercio} />

      {/* Un filtro puesto tiene que verse. Se llega acá desde el mapa, que
          puede tener una campaña elegida, y una línea recortada sin decirlo
          sería un hueco disfrazado de historia completa. */}
      {campanaFiltrada && hrefSinFiltro && (
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2.5 py-1 rounded-lg bg-gondo-amber-50 text-gondo-amber-700 border border-gondo-amber-200 text-xs font-medium">
            Solo {campanaFiltrada}
          </span>
          <a href={hrefSinFiltro} className="text-xs text-gray-500 hover:text-gray-800 underline">
            ver todas las campañas
          </a>
        </div>
      )}

      <Avisos linea={linea} />

      {/* Primero la comparación y después la línea: la comparación es la
          respuesta —es LA foto que va a un informe— y la línea es el índice
          desde el que se elige. */}
      {par && (
        <Comparacion par={par} urls={urls} rutaBase={rutaBase} esDefault={esDefault} />
      )}

      {linea.visitas.length === 0
        ? <SinVisitas />
        : <ListaDeVisitas visitas={linea.visitas} urls={urls} par={par} rutaBase={rutaBase} />}
    </div>
  )
}

/**
 * Las dos visitas lado a lado. **Esta es la pantalla que va a un informe.**
 *
 * ── LA ÚLTIMA CONTRA LA ANTERIOR, NO LA PRIMERA CONTRA LA ÚLTIMA ────────────
 * Lo que se detecta es la caída reciente. Una góndola que se vació la semana
 * pasada es una llamada hoy; una que está peor que en marzo puede llevar así
 * desde abril. El default lo decide `parDeComparacion`, y el par sale siempre
 * cronológico aunque se hayan elegido al revés.
 */
function Comparacion({ par, urls, rutaBase, esDefault }: {
  par: ParComparado
  urls: UrlsDeFotos
  rutaBase: string
  esDefault: boolean
}) {
  const dias = Math.round(
    (Date.parse(par.ultima.instante) - Date.parse(par.anterior.instante)) / 86400000)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Antes y después</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {esDefault
              ? 'La última visita contra la anterior.'
              : 'Las dos visitas que elegiste.'}
            {dias > 0 && ` ${dias} ${dias === 1 ? 'día' : 'días'} entre una y otra.`}
          </p>
        </div>
        {!esDefault && (
          <a
            href={hrefMapa(rutaBase, { a: null, b: null })}
            className="text-xs text-gray-500 hover:text-gray-800 underline shrink-0"
          >
            volver a las dos últimas
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LadoComparado visita={par.anterior} urls={urls} rotulo="Antes" />
        <LadoComparado visita={par.ultima} urls={urls} rotulo="Después" />
      </div>
    </div>
  )
}

function LadoComparado({ visita, urls, rotulo }: {
  visita: Visita
  urls: UrlsDeFotos
  rotulo: string
}) {
  // La PRIMERA foto de la visita, no todas: acá lo que se compara es el estado
  // de la góndola, y dos tomas del mismo estado al lado de dos del otro serían
  // cuatro imágenes para una sola pregunta. Las demás están en su tarjeta.
  const foto = visita.fotos.map(f => urls[f.id]).find(Boolean)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{rotulo}</p>
      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-[3/4]">
        {foto && (
          <a href={foto} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto} alt={`${rotulo}: ${visita.campanaNombre ?? ''}`}
                 className="w-full h-full object-cover" />
          </a>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{formatearInstante(visita.instante)}</p>
        {visita.campanaNombre && (
          // La campaña, también acá. Comparar la foto de una auditoría de
          // precios con la de una reposición es comparar dos cosas sacadas para
          // fines distintos, y sin el nombre al lado nada lo diría.
          <p className="text-xs text-gray-500 leading-snug">{visita.campanaNombre}</p>
        )}
        {visita.fotos.length > 1 && (
          <p className="text-xs text-gray-400 mt-0.5">
            Se muestra 1 de {visita.fotos.length} fotos de esa visita
          </p>
        )}
        {visita.respuestas.length > 0 && (
          <dl className="mt-2 space-y-0.5">
            {visita.respuestas.map((r, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <dt className="text-gray-400">{r.pregunta}</dt>
                <dd className="text-gray-900 font-medium ml-auto">
                  {textoDeRespuesta(r.tipo, r.valor)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}

function Cabecera({ comercio }: { comercio: CabeceraComercio }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">{comercio.nombre ?? 'Comercio'}</h1>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-gray-500">
        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">
          {etiquetaTipo(comercio.tipo)}
        </span>
        {/* La dirección falta en casi la mitad del padrón: 58 de 104 comercios
            en dev y 57 de 97 en prod. Cuando falta NO se escribe nada —ni un
            guión ni un "sin dirección"—: el nombre y la ciudad alcanzan para
            saber cuál es, y un renglón que anuncia que falta un dato es ruido
            en una pantalla que se mira por las fotos. */}
        {(comercio.direccion || comercio.localidad) && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-gray-400" />
            {[comercio.direccion, comercio.localidad].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Lo que la línea NO está mostrando, dicho.
 *
 * Un hueco silencioso en una pantalla de evidencia se lee como una visita que
 * no se hizo, y eso es peor que no mostrarla.
 */
function Avisos({ linea }: { linea: Linea }) {
  if (linea.recortadas === 0 && linea.sinFecha === 0) return null
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm text-amber-900 space-y-0.5">
        {linea.recortadas > 0 && (
          <p>
            Se muestran las <strong>{linea.visitas.length} visitas más recientes</strong> de{' '}
            {linea.total}. Las {linea.recortadas} más viejas quedaron afuera.
          </p>
        )}
        {linea.sinFecha > 0 && (
          <p>
            {linea.sinFecha === 1
              ? 'Hay 1 visita sin fecha de captura, así que no se puede ubicar en la línea.'
              : `Hay ${linea.sinFecha} visitas sin fecha de captura, así que no se pueden ubicar en la línea.`}
          </p>
        )}
      </div>
    </div>
  )
}

function SinVisitas() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
      <p className="text-sm font-medium text-gray-600">Todavía no hay visitas a este comercio</p>
      <p className="text-xs text-gray-500 mt-1">
        Cuando un gondolero lo releve en alguna de estas campañas, la visita aparece acá.
      </p>
    </div>
  )
}

/**
 * La lista de visitas: una fila por visita, de la MÁS NUEVA a la más vieja.
 *
 * ── POR QUÉ NO ES UNA TIRA HORIZONTAL ───────────────────────────────────────
 * La primera versión era una tira con scroll horizontal, y mirándola se vio el
 * problema: **entraban 5 de 9 visitas** y el recuadro con su propia barra se
 * leía como un iframe embebido en la página. Con las ~50 de una campaña de
 * seguimiento de seis meses sería peor, y la información quedaba comprimida
 * abajo de cada foto en una columna de 200 px.
 *
 * En filas entra todo cómodo al lado de la foto y se recorre con el scroll de
 * la página, que es el que la gente ya usa.
 *
 * ── Y DE LA MÁS NUEVA A LA MÁS VIEJA ────────────────────────────────────────
 * Al revés que el orden interno de `armarLinea`, que es cronológico porque
 * `parDeComparacion` depende de él. Acá se invierte para mostrar: **lo primero
 * que se ve al entrar es cómo está hoy**, que es la pregunta con la que uno
 * abre esta pantalla. La evolución la cuenta el comparador de arriba.
 */
function ListaDeVisitas({ visitas, urls, par, rutaBase }: {
  visitas: Visita[]
  urls: UrlsDeFotos
  par: ParComparado | null
  rutaBase: string
}) {
  // ── LA HORA SOLO CUANDO DISTINGUE ─────────────────────────────────────────
  // Se vio rindiendo la pantalla, no leyendo el código: con la hora en todas
  // las filas, ocho de nueve decían "10:00" y el dato dejaba de leerse. Pero
  // sacarla del todo pierde el único caso en que importa —dos visitas el mismo
  // día, que acá son la reposición y la auditoría de precios— y ahí dos filas
  // con la misma fecha parecen un duplicado.
  const porDia = new Map<string, number>()
  for (const v of visitas) {
    const dia = v.instante.slice(0, 10)
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }

  // Se invierte una copia: `visitas` es del caller y el orden cronológico es el
  // contrato de la lib.
  const deLaMasNueva = [...visitas].reverse()

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h2 className="text-sm font-semibold text-gray-900">
          {visitas.length === 1 ? '1 visita' : `${visitas.length} visitas`}
        </h2>
        <p className="text-xs text-gray-400">
          De la más reciente a la más vieja.
          {par && ' Al elegir otra para comparar, se enfrenta a la más reciente de las dos.'}
        </p>
      </div>

      <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {deLaMasNueva.map(v => {
          const sig = siguienteSeleccion(par, v.misionId)
          return (
            <FilaVisita
              key={v.misionId}
              visita={v}
              urls={urls}
              mostrarHora={(porDia.get(v.instante.slice(0, 10)) ?? 0) > 1}
              comparando={Boolean(par) && !sig && v.fotos.length > 0}
              hrefComparar={sig ? hrefMapa(rutaBase, sig) : null}
            />
          )
        })}
      </ul>
    </div>
  )
}

function FilaVisita({ visita, urls, mostrarHora, comparando, hrefComparar }: {
  visita: Visita
  urls: UrlsDeFotos
  /** Solo cuando otra visita cae el mismo día. Ver `ListaDeVisitas`. */
  mostrarHora: boolean
  /** Es uno de los dos lados que se están comparando. */
  comparando: boolean
  /** A dónde lleva elegirla, o `null` si no hay nada que elegir. */
  hrefComparar: string | null
}) {
  const mostrables = visita.fotos.map(f => ({ id: f.id, url: urls[f.id] })).filter(f => f.url)

  return (
    <li className={`flex gap-4 p-4 ${comparando ? 'bg-gondo-amber-50' : ''}`}>
      {/* Las fotos, a la izquierda. Las N de la visita van una al lado de la
          otra: siguen siendo UN punto de la línea. */}
      <div className="shrink-0 flex gap-1.5">
        {mostrables.length > 0
          ? mostrables.slice(0, 3).map(f => (
              <a
                key={f.id}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-24 aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
                title="Ver la foto en grande"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={visita.campanaNombre ?? 'Foto de la visita'}
                     className="w-full h-full object-cover" loading="lazy" />
              </a>
            ))
          : (
            <div className="w-24 aspect-[3/4] rounded-lg border border-gray-200 bg-gray-50">
              <SinFoto enRevision={visita.enRevision} />
            </div>
          )}
      </div>

      {/* Y al lado, todo lo demás. En una fila entra cómodo. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {formatearInstante(visita.instante)}
              {mostrarHora && (
                <span className="font-normal text-gray-400 ml-2">
                  {formatearInstanteHora(visita.instante).split(', ')[1]}
                </span>
              )}
            </p>
            {/* La campaña, en cada visita: es lo que hace legible la mezcla. Con
                el panel angosto se corta, así que el texto entero va en el
                `title` — un nombre de campaña truncado es justo el dato que
                distingue una auditoría de una reposición. */}
            <p
              className="text-xs text-gray-500 mt-0.5 truncate"
              title={[visita.campanaNombre, visita.gondolero].filter(Boolean).join(' · ')}
            >
              {[visita.campanaNombre, visita.gondolero].filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* El link solo donde hacer click cambia algo: una visita que ya está
              comparando muestra el rótulo y no un botón que no hace nada. Y una
              sin foto no muestra ninguno, porque no se puede comparar contra una
              imagen que no existe. */}
          {comparando ? (
            <span className="shrink-0 text-xs font-medium text-gondo-amber-600">Comparando</span>
          ) : hrefComparar && mostrables.length > 0 ? (
            <a
              href={hrefComparar}
              className="shrink-0 px-2.5 py-1 rounded-md border border-gray-200 text-xs
                         text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors"
            >
              Comparar
            </a>
          ) : null}
        </div>

        {visita.respuestas.length > 0 && (
          <dl className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 max-w-2xl">
            {visita.respuestas.map((r, i) => (
              <div key={i} className="flex gap-3 text-sm border-b border-gray-50 pb-0.5">
                <dt className="text-gray-500 truncate" title={r.pregunta}>{r.pregunta}</dt>
                <dd className="text-gray-900 font-medium ml-auto shrink-0">
                  {textoDeRespuesta(r.tipo, r.valor)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-2 flex gap-4 text-xs">
          {visita.enRevision > 0 && mostrables.length > 0 && (
            <span className="text-amber-700">
              {visita.enRevision === 1 ? '1 foto más en revisión' : `${visita.enRevision} fotos más en revisión`}
            </span>
          )}
          {visita.rechazadas > 0 && (
            <span className="text-gray-400">
              {visita.rechazadas === 1 ? '1 foto rechazada' : `${visita.rechazadas} fotos rechazadas`}
            </span>
          )}
          {mostrables.length > 3 && (
            <span className="text-gray-400">
              {`y ${mostrables.length - 3} fotos más`}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * La visita se hizo aunque su foto no sea evidencia todavía.
 *
 * Sacarla de la línea haría desaparecer trabajo que existió, y el hueco se
 * leería como que nadie fue. Es la misma regla que el aviso del tope.
 */
function SinFoto({ enRevision }: { enRevision: number }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3 text-center">
      {enRevision > 0 ? (
        <>
          <Clock className="w-6 h-6 text-amber-500" />
          <p className="text-xs text-amber-700 leading-snug">
            {enRevision === 1 ? 'Foto en revisión' : `${enRevision} fotos en revisión`}
          </p>
          <p className="text-[11px] text-gray-400 leading-snug">La visita se hizo</p>
        </>
      ) : (
        <>
          <ImageOff className="w-6 h-6 text-gray-300" />
          <p className="text-xs text-gray-400 leading-snug">Visita sin foto</p>
        </>
      )}
    </div>
  )
}
