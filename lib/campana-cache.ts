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

// ── Claves de IndexedDB ────────────────────────────────────────────────────────

export const CAMPANA_CACHE_PREFIX = 'campana_cache_'
const COMERCIOS_CACHE_KEY  = 'comercios_cache'  // privada — acceder solo via helpers

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
  solicitar_precio?: boolean
}

export interface BloqueData {
  id: string
  tipoContenido: string
  instruccion: string
  solicitarPrecio: boolean
  campos: CampoBloque[]
}

export interface CampanaData {
  id: string
  nombre: string
  tipo: string
  puntos_por_foto: number
  puntos_por_mision: number
  bloques: BloqueData[]
  primerBloqueId: string | null
}

// ── Select de Supabase ─────────────────────────────────────────────────────────
// Incluye `orden` en bloques_foto para ordenamiento correcto.

export const CAMPANA_CACHE_SELECT =
  'id, nombre, tipo, puntos_por_foto, puntos_por_mision, ' +
  'bloques_foto ( id, tipo_contenido, instruccion, solicitar_precio, orden, ' +
  'bloque_campos ( id, tipo, pregunta, opciones, obligatorio, orden, blur_requerido, solicitar_precio ) )'

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

// ── Transformación ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCampanaData(raw: any): CampanaData {
  const bloques = raw.bloques_foto as {
    id: string
    tipo_contenido: string
    instruccion: string | null
    solicitar_precio: boolean | null
    orden?: number
    bloque_campos: CampoBloque[] | null
  }[]
  const bloquesOrdenados = [...(bloques ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const bloquesData: BloqueData[] = bloquesOrdenados.map(b => ({
    id: b.id,
    tipoContenido: b.tipo_contenido ?? 'propios',
    instruccion: b.instruccion ?? 'el producto',
    solicitarPrecio: b.solicitar_precio ?? false,
    campos: [...(b.bloque_campos ?? [])].sort((a, b) => a.orden - b.orden),
  }))
  return {
    id: raw.id,
    nombre: raw.nombre,
    tipo: raw.tipo ?? 'relevamiento',
    puntos_por_foto:   raw.puntos_por_foto,
    puntos_por_mision: raw.puntos_por_mision ?? 0,
    bloques: bloquesData,
    primerBloqueId: bloquesData[0]?.id ?? null,
  }
}
