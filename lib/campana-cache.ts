/**
 * lib/campana-cache.ts
 *
 * Query compartida, tipos y transformación para el cache de campañas en IndexedDB.
 * Usada por:
 *   - app/(gondolero)/gondolero/captura/page.tsx  (online: guarda al cargar captura)
 *   - app/(gondolero)/gondolero/campanas/campanas-sections.tsx
 *                                                  (precarga al abrir la lista con señal)
 *
 * IMPORTANTE: guardarComercios / leerComercios son el único punto de acceso a
 * COMERCIOS_CACHE_KEY. No usar get/set de idb-keyval directamente con esa clave.
 */

import { get, set } from 'idb-keyval'
import type { SupabaseClient } from '@supabase/supabase-js'
import { diaAR, formatearInstante } from '@/lib/fecha-ar'

// ── Claves de IndexedDB ────────────────────────────────────────────────────────

export const CAMPANA_CACHE_PREFIX = 'campana_cache_'
const COMERCIOS_CACHE_KEY  = 'comercios_cache'  // privada — acceder solo via helpers
const RELEVADOS_CACHE_PREFIX = 'relevados_cache_'  // privada — acceder solo via helpers

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface CampoBloque {
  id: string
  tipo: 'seleccion_multiple' | 'seleccion_unica' | 'binaria' | 'numero' | 'texto' | 'foto'
  pregunta: string
  opciones: string[] | null
  obligatorio: boolean
  orden: number
  /** Solo aplica cuando tipo='foto'. Default DB: true. */
  blur_requerido?: boolean
  /** Solo aplica cuando tipo='foto'. Default DB: false. */
}

export interface BloqueData {
  id: string
  instruccion: string
  campos: CampoBloque[]
}

export interface CampanaData {
  id: string
  nombre: string
  tipo: string
  /**
   * 'puntual' | 'seguimiento'. Opcional porque los caches escritos antes de
   * que existiera la columna no la tienen — tratar undefined como 'puntual',
   * que es el caso seguro (marca de más, nunca de menos).
   */
  modalidad?: string
  /**
   * `YYYY-MM-DD` o null (seguimiento no vence). Opcional porque los caches
   * escritos antes del 18/9/2026 no la tienen: ahí `estaVencida(undefined)` da
   * false y no se bloquea nada. El gate del servidor sigue estando al enviar, y
   * bloquear offline por un dato que falta por culpa nuestra sería rechazar
   * trabajo legítimo.
   */
  fecha_fin?: string | null
  puntos_por_foto: number
  puntos_por_mision: number
  bloques: BloqueData[]
  primerBloqueId: string | null
}

// ── Select de Supabase ─────────────────────────────────────────────────────────
// Incluye `orden` en bloques_foto para ordenamiento correcto.

export const CAMPANA_CACHE_SELECT =
  // `fecha_fin` está acá para que captura pueda cerrarse ANTES de que el
  // gondolero saque la primera foto. Sin ella, la única barrera era el gate del
  // servidor al enviar: rechazo tardío sobre una misión ya hecha entera.
  // `updated_at` es la marca de cambio del caché: con ella, un TTL vencido se
  // resuelve con una consulta de dos columnas en vez de bajar los bloques
  // anidados otra vez. La mueven los triggers de la migración 20260922200000,
  // también cuando el cambio es en un bloque o un campo.
  'id, nombre, tipo, modalidad, fecha_fin, updated_at, puntos_por_foto, puntos_por_mision, ' +
  'bloques_foto ( id, instruccion, orden, ' +
  'bloque_campos ( id, tipo, pregunta, opciones, obligatorio, orden, blur_requerido ) )'

// ── Helpers de comercios (único acceso a COMERCIOS_CACHE_KEY) ─────────────────
//
// Formato canónico en IDB: { data: array, timestamp: number }
// leerComercios acepta también el formato antiguo (array crudo) por compatibilidad
// con dispositivos que tengan datos de versiones anteriores.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guardarComercios(data: any[]): Promise<void> {
  await set(COMERCIOS_CACHE_KEY, { data, timestamp: Date.now() })
}

/**
 * Lee el cache de comercios desde IndexedDB.
 * Retorna el array de comercios o null si no hay cache válida.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leerComercios(): Promise<any[] | null> {
  const entry = await get(COMERCIOS_CACHE_KEY)
  if (!entry) return null
  // Backward compat: versiones anteriores guardaban el array crudo
  if (Array.isArray(entry)) return entry
  if (entry && Array.isArray(entry.data)) return entry.data
  return null
}

// ── Helpers de comercios relevados (único acceso a RELEVADOS_CACHE_PREFIX) ────
//
// Por campaña: el set depende de la campaña, no del dispositivo.
//
// El cache existe para que la marca de "Ya relevado" funcione sin señal. Pero un
// set de cache SIEMPRE puede estar viejo, y el uso real lo empeora: el gondolero
// precarga en casa a la mañana y trabaja todo el día sin señal, así que el set
// puede tener ocho horas. Por eso lo que viene de acá se muestra con aviso —
// ver esRelevadosFresco en captura/page.tsx.

/**
 * Forma cacheada del estado de selección de comercios.
 *
 * Es el payload de `obtenerEstadoComercios`. Antes del 17/9/2026 acá se
 * guardaba un `string[]` pelado con los relevados; ahora hace falta también el
 * cupo propio del gondolero, así que es un objeto.
 */
export interface EstadoComerciosCache {
  relevadosPorOtros: string[]
  misComercios: string[]
  maxComercios: number | null
  /**
   * Cobertura de la semana por comercio: `[comercioId, visitas, cubierto, hayDeOtro]`.
   *
   * **Opcional a propósito.** Los teléfonos que ya usaron la app tienen en IDB
   * la forma anterior, sin este campo. Marcarlo obligatorio haría que el primer
   * arranque después del deploy leyera `undefined` donde el código espera un
   * array, justo en la pantalla de captura — el mismo modo de falla que la
   * guarda del array viejo de más abajo ya documenta.
   *
   * Que falte significa "no sé", y la UI no muestra nada: un comercio sin dato
   * de cobertura se ve como antes del cambio.
   */
  semanaPorComercio?: [string, number, boolean, boolean][]
  /** `visitas_por_semana`. `null`/ausente fuera de seguimiento. */
  visitasPorSemana?: number | null
}

export async function guardarRelevados(campanaId: string, estado: EstadoComerciosCache): Promise<void> {
  await set(RELEVADOS_CACHE_PREFIX + campanaId, { data: estado, timestamp: Date.now() })
}

/**
 * LA GUARDA DEL ARRAY VIEJO NO ES OPCIONAL.
 *
 * Los teléfonos que ya usaron la app tienen en IDB la forma anterior —un
 * `string[]`— escrita antes del deploy. Sin este chequeo, el primer arranque
 * después de actualizar leería un array donde el código espera un objeto y
 * rompería en `estado.misComercios`, justo en la pantalla de captura y justo en
 * el teléfono del que más usa la app.
 *
 * Un array viejo se interpreta como lo que era: solo relevados, sin datos de
 * cupo. `maxComercios: null` hace que `cupoPropioLleno` dé false, así que en el
 * peor caso no se bloquea de más — el control del servidor sigue estando. El
 * refresco en línea reemplaza la entrada por la forma nueva.
 */
export async function leerRelevados(campanaId: string): Promise<EstadoComerciosCache | null> {
  const entry = await get(RELEVADOS_CACHE_PREFIX + campanaId)
  if (!entry) return null

  if (Array.isArray(entry.data)) {
    return { relevadosPorOtros: entry.data as string[], misComercios: [], maxComercios: null }
  }
  if (entry.data && Array.isArray(entry.data.relevadosPorOtros)) {
    return {
      relevadosPorOtros: entry.data.relevadosPorOtros as string[],
      misComercios:      Array.isArray(entry.data.misComercios) ? entry.data.misComercios as string[] : [],
      maxComercios:      typeof entry.data.maxComercios === 'number' ? entry.data.maxComercios : null,
    }
  }
  return null
}

// ── Transformación ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCampanaData(raw: any): CampanaData {
  const bloques = raw.bloques_foto as {
    id: string
    instruccion: string | null
    orden?: number
    bloque_campos: CampoBloque[] | null
  }[]
  const bloquesOrdenados = [...(bloques ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const bloquesData: BloqueData[] = bloquesOrdenados.map(b => ({
    id: b.id,
    instruccion: b.instruccion ?? 'el producto',
    campos: [...(b.bloque_campos ?? [])].sort((a, b) => a.orden - b.orden),
  }))
  return {
    id: raw.id,
    nombre: raw.nombre,
    tipo: raw.tipo ?? 'relevamiento',
    modalidad: raw.modalidad ?? 'puntual',
    fecha_fin: raw.fecha_fin ?? null,
    puntos_por_foto:   raw.puntos_por_foto,
    puntos_por_mision: raw.puntos_por_mision ?? 0,
    bloques: bloquesData,
    primerBloqueId: bloquesData[0]?.id ?? null,
  }
}

// ── Helpers de campañas (único acceso a CAMPANA_CACHE_PREFIX) ────────────────
//
// Hasta el 22/9/2026 acá no había helpers: cada pantalla hacía
// `set(CAMPANA_CACHE_PREFIX + id, campanaData)` con el objeto pelado, sin
// timestamp. Eso dejaba dos agujeros:
//
//   · No se podía saber si el caché estaba viejo. El precache de la lista hacía
//     `if (already) continue` y NUNCA refrescaba: una campaña cacheada hace dos
//     semanas se capturaba offline con los bloques de hace dos semanas. Si el
//     creador agregaba una pregunta, la misión llegaba sin esa respuesta.
//   · El precache solo corría en la pantalla de la LISTA, así que la secuencia
//     `detalle → Unirme → captura → modo avión` dejaba al gondolero sin nada.

/**
 * 12 horas.
 *
 * El ciclo real es "abro la app en casa a la mañana, salgo a la ruta". Doce
 * horas cubren una jornada entera: si precargó a las 7, a las 19 sigue vigente
 * y no gasta datos. Dos o cuatro harían que a media tarde todo esté vencido —y
 * como igual se usa, sería ruido—. Una semana deja pasar demasiadas ediciones
 * en los ratos en que sí hay señal para detectarlas.
 *
 * **Vencido no es inválido.** Ver `leerCampana`.
 */
export const CAMPANA_CACHE_TTL_MS = 12 * 60 * 60 * 1000

export interface CampanaCacheEntry {
  data: CampanaData
  /** Cuándo se guardó. `0` en los caches viejos, que no lo tenían. */
  timestamp: number
  /** `campanas.updated_at` al guardar. `null` en los caches viejos. */
  updatedAt: string | null
}

export async function guardarCampana(
  campanaId: string,
  data: CampanaData,
  updatedAt: string | null,
): Promise<void> {
  await set(CAMPANA_CACHE_PREFIX + campanaId, { data, timestamp: Date.now(), updatedAt })
}

/**
 * LA GUARDA DEL FORMATO VIEJO NO ES OPCIONAL.
 *
 * Los teléfonos que ya usaron la app tienen en IDB el `CampanaData` pelado, sin
 * envoltorio. Sin este chequeo, el primer arranque después del deploy leería
 * `entry.data` como `undefined` y la pantalla de captura quedaría sin campaña
 * —sin conexión, sin forma de recuperarse— justo en el teléfono del que más usa
 * la app. Es el mismo modo de falla que ya documenta `leerRelevados`.
 *
 * Un caché viejo se interpreta como lo que era, con `timestamp: 0`: se usa
 * igual, y queda vencido, así que la primera vez que haya señal se revisa.
 */
export async function leerCampana(campanaId: string): Promise<CampanaCacheEntry | null> {
  const entry = await get(CAMPANA_CACHE_PREFIX + campanaId)
  if (!entry) return null

  // Formato viejo: el CampanaData pelado.
  if (Array.isArray(entry.bloques)) {
    return { data: entry as CampanaData, timestamp: 0, updatedAt: null }
  }
  if (entry.data && Array.isArray(entry.data.bloques)) {
    return {
      data:      entry.data as CampanaData,
      timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : 0,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
    }
  }
  return null
}

/** ¿Pasó el TTL? Vencido significa "hay que revisarlo con señal", no "es basura". */
export function campanaCacheVencido(entry: CampanaCacheEntry, ahora = Date.now()): boolean {
  return ahora - entry.timestamp > CAMPANA_CACHE_TTL_MS
}

/**
 * Renueva el plazo sin volver a bajar nada.
 *
 * Es lo que se llama cuando el TTL venció pero `updated_at` dice que la campaña
 * no cambió: el contenido sigue siendo bueno, lo único viejo era el plazo.
 */
export async function renovarCampana(campanaId: string): Promise<void> {
  const entry = await leerCampana(campanaId)
  if (!entry) return
  await guardarCampana(campanaId, entry.data, entry.updatedAt)
}

/**
 * Baja la campaña entera y la guarda. Devuelve si lo logró.
 *
 * No lanza: sin señal esto es un no-op y el llamador sigue su camino. Todos los
 * llamadores son caminos de precarga, donde fallar no tiene que romper nada.
 */
export async function precacheCampana(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  campanaId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('campanas')
      .select(CAMPANA_CACHE_SELECT)
      .eq('id', campanaId)
      .single()
    if (!data) return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = data as any
    await guardarCampana(campanaId, toCampanaData(raw), raw.updated_at ?? null)
    return true
  } catch {
    return false
  }
}

/**
 * El chequeo barato: `id, updated_at` de varias campañas en UNA consulta.
 *
 * Son bytes. Lo caro es `CAMPANA_CACHE_SELECT`, con los bloques y campos
 * anidados, y eso solo se baja cuando esto dice que algo cambió.
 */
export async function leerUpdatedAt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  campanaIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (campanaIds.length === 0) return out
  try {
    const { data } = await supabase.from('campanas').select('id, updated_at').in('id', campanaIds)
    for (const c of (data ?? []) as { id: string; updated_at: string | null }[]) {
      out.set(c.id, c.updated_at ?? null)
    }
  } catch { /* sin señal: el llamador se queda con lo que tiene */ }
  return out
}

/**
 * Pone al día el caché de varias campañas, gastando lo mínimo.
 *
 *   sin caché              → baja la campaña entera
 *   caché fresco           → no consulta nada
 *   vencido y sin cambios  → renueva el plazo, no baja nada
 *   vencido y con cambios  → baja la campaña entera
 *
 * Devuelve los ids que quedaron cacheados, para que la pantalla marque cuáles
 * están listos para trabajar sin señal.
 */
export async function sincronizarCampanas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  campanaIds: string[],
): Promise<Set<string>> {
  const cacheadas = new Set<string>()
  const aRevisar: string[] = []
  const entradas = new Map<string, CampanaCacheEntry | null>()

  for (const id of campanaIds) {
    const entry = await leerCampana(id).catch(() => null)
    entradas.set(id, entry)
    if (entry) cacheadas.add(id)
    if (!entry || campanaCacheVencido(entry)) aRevisar.push(id)
  }

  if (aRevisar.length === 0) return cacheadas

  const remotos = await leerUpdatedAt(supabase, aRevisar)

  for (const id of aRevisar) {
    const entry = entradas.get(id) ?? null
    const remoto = remotos.get(id)

    // Sin respuesta del servidor —sin señal, o la campaña ya no existe— se deja
    // lo que haya. Un caché vencido se sigue usando: mejor formulario viejo que
    // ningún formulario.
    if (remoto === undefined) continue

    if (entry && entry.updatedAt && remoto && entry.updatedAt === remoto) {
      await renovarCampana(id).catch(() => {})
      continue
    }

    if (await precacheCampana(supabase, id)) cacheadas.add(id)
  }

  return cacheadas
}

/**
 * "de hoy a las 07:30", "de ayer", "del martes", "del 15 de septiembre".
 *
 * Va en el aviso de caché vencido. Lo importante es que diga CUÁNDO y no
 * "hace mucho": el gondolero sabe si el martes pasó algo o no, y con eso decide
 * si vale la pena buscar señal antes de entrar al comercio.
 *
 * Se fija la zona argentina aunque esto **solo** se renderice en client
 * components —el teléfono del gondolero ya está en hora argentina— por dos
 * motivos: un dispositivo con la zona mal puesta deja de mentir, y el día que
 * alguien mueva este texto a un server component no se convierte en el bug de
 * las 21:00 sin que nada falle. Es la misma zona explícita que el resto de la
 * app desde el 22/9/2026.
 */
export function fechaCacheRelativa(timestamp: number, ahora = Date.now()): string {
  // `0` es el caché escrito antes de que existiera el envoltorio. Decir "del 1
  // de enero de 1970" sería peor que no decir nada.
  if (!timestamp) return 'de una versión anterior de la app'

  // Los dos días se comparan como ETIQUETAS argentinas, no como instantes.
  const dias = Math.round(
    (Date.parse(`${diaAR(ahora)}T00:00:00Z`) - Date.parse(`${diaAR(timestamp)}T00:00:00Z`)) / 86_400_000
  )

  if (dias <= 0) return `de hoy a las ${formatearInstante(timestamp, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
  if (dias === 1) return 'de ayer'
  if (dias < 7)  return `del ${formatearInstante(timestamp, { weekday: 'long' })}`
  return `del ${formatearInstante(timestamp, { day: 'numeric', month: 'long' })}`
}
