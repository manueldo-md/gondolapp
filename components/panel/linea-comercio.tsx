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
 * con un punto por foto la misma fecha aparecería dos veces. Las N fotos de una
 * visita van adentro de su tarjeta.
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
import type { LineaComercio as Linea, Visita } from '@/lib/linea-comercio'

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
}) {
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

      {linea.visitas.length === 0
        ? <SinVisitas />
        : <TiraDeVisitas visitas={linea.visitas} urls={urls} />}
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
 * La línea: horizontal, de la más vieja a la más nueva.
 *
 * Horizontal y no vertical porque lo que se compara es el ANTES y el DESPUÉS de
 * la misma góndola, y eso se lee de izquierda a derecha. Con muchas visitas
 * scrollea, que es lo que hace una línea de tiempo.
 */
function TiraDeVisitas({ visitas, urls }: { visitas: Visita[]; urls: UrlsDeFotos }) {
  // ── LA HORA SOLO CUANDO DISTINGUE ─────────────────────────────────────────
  // Se vio rindiendo la pantalla, no leyendo el código: con la hora en todas
  // las tarjetas, ocho de nueve decían "10:00" y el dato dejaba de leerse. Pero
  // sacarla del todo pierde el único caso en que importa —dos visitas el mismo
  // día, que acá son la reposición y la auditoría de precios— y ahí dos
  // tarjetas con la misma fecha parecen un duplicado.
  const porDia = new Map<string, number>()
  for (const v of visitas) {
    const dia = v.instante.slice(0, 10)
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex gap-4 overflow-x-auto pb-2">
        {visitas.map(v => (
          <TarjetaVisita
            key={v.misionId}
            visita={v}
            urls={urls}
            mostrarHora={(porDia.get(v.instante.slice(0, 10)) ?? 0) > 1}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        De la visita más vieja a la más reciente. Cada tarjeta es una visita, con las fotos que dejó.
      </p>
    </div>
  )
}

function TarjetaVisita({ visita, urls, mostrarHora }: {
  visita: Visita
  urls: UrlsDeFotos
  /** Solo cuando otra visita cae el mismo día. Ver `TiraDeVisitas`. */
  mostrarHora: boolean
}) {
  const mostrables = visita.fotos.map(f => ({ id: f.id, url: urls[f.id] })).filter(f => f.url)

  return (
    <div className="shrink-0 w-52 space-y-2">
      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-[3/4]">
        {mostrables.length > 0
          ? <Fotos fotos={mostrables} alt={visita.campanaNombre ?? 'Foto de la visita'} />
          : <SinFoto enRevision={visita.enRevision} />}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-900 leading-tight">
          {formatearInstante(visita.instante)}
        </p>
        {mostrarHora && (
          <p className="text-xs text-gray-400">{formatearInstanteHora(visita.instante).split(', ')[1]}</p>
        )}

        {/* La campaña, en cada visita. Es lo que hace legible la mezcla. */}
        {visita.campanaNombre && (
          <p className="text-xs text-gray-600 leading-snug line-clamp-2" title={visita.campanaNombre}>
            {visita.campanaNombre}
          </p>
        )}
        {visita.gondolero && <p className="text-xs text-gray-400">{visita.gondolero}</p>}

        {visita.respuestas.length > 0 && (
          <dl className="pt-1 space-y-0.5 border-t border-gray-100 mt-1.5">
            {visita.respuestas.map((r, i) => (
              <div key={i} className="flex gap-1.5 text-xs leading-snug">
                <dt className="text-gray-400 truncate" title={r.pregunta}>{r.pregunta}</dt>
                <dd className="text-gray-900 font-medium ml-auto shrink-0">
                  {textoDeRespuesta(r.tipo, r.valor)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* Una foto en revisión con otra ya aprobada en la misma visita: se
            dice igual, porque la tarjeta estaría mostrando menos de lo que hay. */}
        {visita.enRevision > 0 && mostrables.length > 0 && (
          <p className="text-xs text-amber-700 pt-0.5">
            {visita.enRevision === 1 ? '1 foto más en revisión' : `${visita.enRevision} fotos más en revisión`}
          </p>
        )}
        {visita.rechazadas > 0 && (
          <p className="text-xs text-gray-400 pt-0.5">
            {visita.rechazadas === 1 ? '1 foto rechazada' : `${visita.rechazadas} fotos rechazadas`}
          </p>
        )}
      </div>
    </div>
  )
}

/** Las N fotos de la visita, adentro del mismo recuadro. */
function Fotos({ fotos, alt }: { fotos: { id: string; url: string }[]; alt: string }) {
  return (
    <div className={`w-full h-full grid gap-px bg-gray-200 ${fotos.length > 1 ? 'grid-rows-2' : ''}`}>
      {fotos.slice(0, 4).map(f => (
        // Ampliar sin JavaScript. `noreferrer` porque la URL firmada lleva el
        // token adentro y no tiene por qué viajar en el Referer.
        <a
          key={f.id}
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden bg-gray-100"
          title="Ver la foto en grande"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={alt} className="w-full h-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
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
