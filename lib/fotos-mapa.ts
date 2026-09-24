/**
 * lib/fotos-mapa.ts — elegir QUÉ foto mostrar al lado de cada PDV del mapa.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * El mapa dice DÓNDE y la foto dice POR QUÉ. Un punto rojo con la foto al lado
 * es la diferencia entre "no está" y "no está porque la góndola está vacía".
 *
 * ── LA ÚLTIMA, Y "ÚLTIMA" ES POR `capturada_at` ─────────────────────────────
 * El ancla es cuándo se hizo el trabajo de campo, no cuándo entró la fila.
 * `fotos.created_at` es lo segundo, y ya nos mintió en el tramo del panel:
 * `mision_respuestas.created_at` decía 2026-09 en el 100% de las filas y
 * colapsaba toda la historia en un punto. Acá el efecto sería más chico —
 * elegir la foto equivocada de un mismo comercio— pero es el mismo error.
 *
 * `COALESCE` a `created_at` porque una foto sin misión no tiene `capturada_at`,
 * y porque una fila vieja podría no tenerlo. Mejor una fecha aproximada que
 * descartar la única foto que hay.
 */

/** Una fila de `fotos` con la misión embebida, como la trae PostgREST. */
export type FilaFotoMapa = {
  id: string
  comercio_id: string | null
  storage_path: string | null
  url: string | null
  created_at: string
  /**
   * PostgREST devuelve el embed como objeto o como arreglo según la
   * cardinalidad que infiera. Se normaliza en `instanteDeFoto` y no en cada
   * lectura — es la misma trampa que en `opcionesDeDistri`.
   */
  misiones?: { capturada_at: string | null } | { capturada_at: string | null }[] | null
}

/** Cuándo se sacó, de verdad. Ver el encabezado. */
export function instanteDeFoto(f: FilaFotoMapa): string {
  const m = f.misiones
  const capturada = Array.isArray(m) ? m[0]?.capturada_at : m?.capturada_at
  return capturada ?? f.created_at
}

export type FotoDeComercio = {
  fotoId: string
  /** El instante que se usó para elegirla, para poder fecharla en pantalla. */
  instante: string
}

/**
 * La ÚLTIMA foto de cada comercio. Una sola, no todas.
 *
 * Con varias visitas al mismo comercio la más reciente es la que describe el
 * estado que el mapa está pintando: el punto muestra el último estado conocido,
 * así que la foto tiene que ser de esa misma visita y no de una de marzo.
 *
 * Ante un empate exacto de instante gana la de `id` mayor, que es arbitrario
 * pero **estable**: sin un desempate, dos renders del mismo dato podrían
 * mostrar fotos distintas y eso se lee como un bug.
 */
export function ultimaFotoPorComercio(filas: FilaFotoMapa[]): Map<string, FotoDeComercio> {
  const mejor = new Map<string, { fotoId: string; instante: string }>()

  for (const f of filas) {
    if (!f.comercio_id) continue
    const instante = instanteDeFoto(f)
    const ya = mejor.get(f.comercio_id)
    if (!ya
      || instante > ya.instante
      || (instante === ya.instante && f.id > ya.fotoId)) {
      mejor.set(f.comercio_id, { fotoId: f.id, instante })
    }
  }

  return mejor
}
