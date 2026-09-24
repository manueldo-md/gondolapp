/**
 * components/panel/selector-alcance.tsx — el tercer control de la distribuidora.
 *
 * Una distri ejecuta campañas de varias marcas y esos números no se suman, así
 * que antes de dibujar nada hay que saber cuál está mirando. Lo usan el panel
 * de métricas y el mapa, y por eso vive acá y no adentro de una de las dos:
 * dos copias de un control obligatorio son dos oportunidades de que una se dé
 * un default a sí misma.
 *
 * ── NO TIENE OPCIÓN "TODAS", Y NO TIENE DEFAULT ─────────────────────────────
 * El 80% de presencia de una marca y el 64% de otra darían un 74% que no
 * describe a ninguna. Y un default escondido —"si no eligió, la primera"— es
 * peor que una pantalla vacía: la distri leería el número de una marca
 * creyendo que es de otra.
 *
 * Son links y no un `<select>`: la selección vive en la URL, la pantalla sigue
 * siendo Server Component y el link se puede mandar.
 */
import type { OpcionAlcance } from '@/lib/panel-distri'

export function SelectorAlcance({ opciones, activo, ruta }: {
  opciones: OpcionAlcance[]
  /** La clave elegida, o `null` si todavía no eligió. */
  activo: string | null
  /** La pantalla que lo monta: el panel y el mapa son rutas distintas. */
  ruta: string
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mr-1">
        Qué mirás
      </span>
      {opciones.map(o => (
        <a
          key={o.clave}
          // Solo el alcance: cambiar de marca RESETEA los demás filtros a
          // propósito. Una campaña de Georgalos no existe dentro de Suprante,
          // así que arrastrarla daría una pantalla vacía sin explicación.
          href={`${ruta}?alcance=${encodeURIComponent(o.clave)}`}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            o.clave === activo
              ? 'bg-gondo-amber-400 text-white border-gondo-amber-400'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
          }`}
        >
          {o.etiqueta}
          <span className={`ml-2 text-xs ${o.clave === activo ? 'text-white/70' : 'text-gray-400'}`}>
            {o.campanas}
          </span>
        </a>
      ))}
    </div>
  )
}

/**
 * Lo que se muestra mientras no eligió. Es la mitad del control obligatorio: si
 * la pantalla dibujara algo acá, el control dejaría de ser obligatorio.
 */
export function SinAlcanceElegido() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
      <p className="text-sm font-medium text-gray-600">Elegí qué querés mirar</p>
      <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">
        No hay una vista de “todas” a propósito: la presencia de una marca y la de
        otra miden productos distintos, y el promedio de las dos no describe a
        ninguna. Son vistas separadas porque son decisiones separadas.
      </p>
    </div>
  )
}

/** Cuando la distribuidora no ejecuta ninguna campaña todavía. */
export function SinCampanas() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
      <p className="text-sm font-medium text-gray-600">Todavía no ejecutás ninguna campaña</p>
      <p className="text-xs text-gray-500 mt-1">
        Cuando crees una campaña propia o una marca te asigne la ejecución de la suya,
        las métricas aparecen acá.
      </p>
    </div>
  )
}
