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

// ─────────────────────────────────────────────────────────────────────────────
// LA CONSULTA — acá y no en la server action, a propósito
//
// La regla "con una campaña elegida, la foto es DE ESA CAMPAÑA" no vive en
// `ultimaFotoPorComercio`: esa función elige la más reciente de las filas que
// le dan, y hace bien. **Vive en los filtros de esta consulta.**
//
// Mientras estuvo adentro de la server action no había forma de probarla: una
// action `'use server'` necesita sesión y no se puede llamar desde un script.
// El primer control que escribí REPLICABA el SQL, y un control que replica lo
// que dice verificar se queda verde el día que los dos se separan — que es
// exactamente el modo de falla que este proyecto ya documentó tres veces.
//
// Acá la llaman las dos: la action (con el permiso ya resuelto) y
// `scripts/probar-fotos-por-campana.mjs` (con service role y datos reales).
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Cuántos comercios puede pedir una sola apertura. Un grupo real son 1–10. */
export const TOPE_COMERCIOS = 60

/**
 * Las fotos candidatas de esos comercios, ACOTADAS a esas campañas.
 *
 * `campanaIds` ya viene resuelto por `idsDe(campanas, campanaId)`:
 *
 *   · con una campaña elegida → un arreglo de UN elemento, y el thumb sale solo
 *     de ahí. Entrar a una campaña de hace seis meses y ver una foto de hace 30
 *     días de otra campaña es mostrar evidencia equivocada, y la foto no lleva
 *     la fecha escrita: nadie lo notaría.
 *   · sin campaña elegida → todas las del alcance, y la más reciente gana. Ahí
 *     corresponde, porque el punto pinta el último estado conocido.
 *   · vacío → no se consulta nada. El scope falla cerrado.
 */
export async function fotosCandidatas(
  comercioIds: string[],
  campanaIds: string[],
  admin: Admin,
): Promise<FilaFotoMapa[]> {
  if (comercioIds.length === 0 || campanaIds.length === 0) return []

  const { data, error } = await admin
    .from('fotos')
    .select('id, comercio_id, storage_path, url, created_at, misiones(capturada_at)')
    .in('comercio_id', comercioIds.slice(0, TOPE_COMERCIOS))
    .in('campana_id', campanaIds)
    // Solo aprobadas: una foto pendiente todavía no es evidencia, y mostrarla
    // al lado de un número la convierte en una.
    .eq('estado', 'aprobada')
    // Con misión: descarta la foto de FACHADA del alta de comercio, que va sin
    // `mision_id`. Es evidencia de que el comercio existe, no de cómo está la
    // góndola, que es lo que este mapa está contando.
    .not('mision_id', 'is', null)

  if (error) {
    console.error('[mapa] fotos de la lista:', error.message)
    return []
  }
  return (data ?? []) as FilaFotoMapa[]
}
