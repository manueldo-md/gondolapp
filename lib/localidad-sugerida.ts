/**
 * lib/localidad-sugerida.ts — la parte que SÍ toca la red y la base.
 *
 * ETAPA 4 del tramo "localidad_id en el alta de comercio".
 *
 * La decisión vive en `lib/geocoding.ts`, que es pura y se prueba sin red ni
 * base. Acá está lo sucio: llamar al proveedor, traer el padrón y guardar.
 *
 * ── NO HAY SELECTOR EN EL ALTA ──────────────────────────────────────────────
 * La dirección y los demás campos del alta ya son opcionales y los gondoleros
 * no los cargan, así que sumar un selector obligatorio es trabajo que no van a
 * hacer — y la adopción vale más que el dato. Se resuelve acá, en el servidor,
 * donde hay señal.
 *
 * ── Y LO QUE SE ESCRIBE ES UNA SUGERENCIA ───────────────────────────────────
 * Medido contra los comercios que ya tienen localidad del CSV del piloto, con
 * Geoapify y el padrón ya limpio: **9 resuelven exacto y 1 de esos 9 es OTRA
 * localidad** —un comercio de Gualeguaychú resolvió a "Larroque"—. Ese caso no
 * lo detecta ninguna lógica: la respuesta es internamente consistente. Por eso
 * esto escribe `localidad_sugerida_*` y `localidad_id` lo escribe una persona
 * desde la bandeja de pendientes.
 *
 * ── FALLA ABIERTO, SIEMPRE ──────────────────────────────────────────────────
 * Esta función **no lanza nunca** y se llama DESPUÉS de que el comercio ya está
 * insertado. Un proveedor caído, sin cuota o lento no puede impedir un alta: el
 * gondolero está parado en la puerta del comercio y su trabajo ya está hecho.
 * Lo peor que pasa es que el comercio quede sin sugerencia y lo resuelva una
 * persona, que es el camino que igual existe.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverLocalidad, candidatosDe, explicarResolucion, type DireccionProveedor, type FilaPadron } from './geocoding'

/** Corto a propósito: es latencia que el gondolero espera parado en el local. */
const TIMEOUT_MS = 4000

/**
 * La llamada al proveedor.
 *
 * Geoapify y no Nominatim: la política de Nominatim prohíbe las consultas
 * sistemáticas y su uso comercial solo se banca si el geocoding no es central,
 * sin SLA y con baneo discrecional. Geoapify ya está en el proyecto para las
 * tiles y su plan gratuito permite uso comercial en producción.
 *
 * **Y la key NO es la del mapa.** `NEXT_PUBLIC_GEOAPIFY_KEY` está restringida
 * por Allowed HTTP Origins a los dos dominios del deploy, y una llamada desde
 * el servidor no manda Origin ni Referer: habría rebotado con 401/403.
 * `GEOAPIFY_SERVER_KEY` es una segunda key del MISMO proyecto, sin
 * restricciones. Comparte la cuota de 3.000 créditos/día, que a 4 altas de pico
 * por día es ruido — una tile cuesta 0,25 y una sesión de mapa gasta más que un
 * mes de esto.
 */
async function consultarProveedor(lat: number, lng: number): Promise<DireccionProveedor | null> {
  const key = process.env.GEOAPIFY_SERVER_KEY
  if (!key) {
    console.error('[localidad] Falta GEOAPIFY_SERVER_KEY: el alta sigue, sin sugerencia.')
    return null
  }
  const u = new URL('https://api.geoapify.com/v1/geocode/reverse')
  u.searchParams.set('lat', String(lat))
  u.searchParams.set('lon', String(lng))
  u.searchParams.set('format', 'json')
  u.searchParams.set('lang', 'es')      // devuelve los nombres con acento, como el padrón
  u.searchParams.set('apiKey', key)

  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) {
    console.error(`[localidad] Geoapify respondió ${res.status}. El alta sigue, sin sugerencia.`)
    return null
  }
  const a = (await res.json())?.results?.[0] ?? {}
  return {
    village: a.village, town: a.town, city: a.city,
    municipality: a.municipality, suburb: a.suburb,
    county: a.county,   // OJO: no es nuestro departamento. Ver lib/geocoding.ts
    state: a.state,
  }
}

/**
 * Las filas del padrón que pueden matchear alguno de los candidatos.
 *
 * Se trae POR NOMBRE y no el padrón entero: 941 filas hoy entran bajo el techo
 * de 1.000 de PostgREST, pero ese techo **no avisa** cuando se cruza, y este
 * padrón está pensado para crecer — la cola de "fuera del padrón" existe justo
 * para eso. Un `select` que un día devuelve 1.000 de 1.200 daría sugerencias
 * equivocadas sin que nada falle.
 *
 * ── LÍMITE CONOCIDO: LOS ACENTOS ────────────────────────────────────────────
 * La base no tiene la extensión `unaccent`, así que este filtro es
 * case-insensitive pero NO accent-insensitive, y **246 de las 941 localidades
 * llevan acento o ñ**. Si el proveedor devolviera "Colon" en vez de "Colón", la
 * fila no se traería.
 *
 * No se tapa con variantes inventadas porque **el modo de falla ya es seguro**:
 * sin la fila, `resolverLocalidad` devuelve `fuera` y el comercio va a la
 * bandeja para que lo resuelva una persona. Se degrada a trabajo manual, nunca
 * a un dato equivocado. Medido con `lang=es`, Geoapify devuelve los nombres
 * acentuados y el caso no aparece.
 */
async function traerPadron(cands: string[], admin: SupabaseClient): Promise<FilaPadron[]> {
  if (cands.length === 0) return []

  const { data, error } = await admin
    .from('localidades')
    .select('id, nombre, departamentos!inner(nombre, provincias!inner(nombre))')
    .or(cands.map(n => `nombre.ilike.${n.replace(/[,()]/g, ' ')}`).join(','))
    .limit(200)

  if (error) {
    console.error('[localidad] No se pudo leer el padrón:', error.message)
    return []
  }

  // Los embeds de PostgREST vienen como objeto o como array según el caso.
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  return (data ?? []).flatMap(l => {
    const d = uno(l.departamentos as never) as { nombre: string; provincias: unknown } | null
    const p = uno(d?.provincias as never) as { nombre: string } | null
    if (!d || !p) return []
    return [{ id: l.id as number, nombre: l.nombre as string, departamento: d.nombre, provincia: p.nombre }]
  })
}

/**
 * Resuelve la localidad de un comercio recién creado y guarda la SUGERENCIA.
 *
 * No lanza nunca. Se llama después del insert, así que un fallo acá no puede
 * impedir un alta.
 *
 * Los dos caminos de alta la llaman igual, y por la misma razón por la que
 * `registrarMision` tiene que vivir en un solo lugar: dos copias de esto es
 * garantizar que el día que se corrija una, la otra quede vieja en silencio.
 */
export async function sugerirLocalidad(
  comercioId: string,
  lat: number,
  lng: number,
  admin: SupabaseClient,
): Promise<void> {
  try {
    const dir = await consultarProveedor(lat, lng)

    // `error` distingue "no se pudo preguntar" de "se preguntó y no dio nada".
    // Sin esa diferencia no se puede reprocesar solo lo que falta.
    if (!dir) {
      await guardar(comercioId, { estado: 'error' }, admin)
      return
    }

    const r = resolverLocalidad(dir, await traerPadron(candidatosDe(dir), admin))
    console.log(`[localidad] ${comercioId}: ${r.estado} — ${explicarResolucion(r)}`)

    switch (r.estado) {
      case 'exacto':
        await guardar(comercioId, { estado: 'exacto', id: r.localidadId, texto: r.fila.nombre }, admin)
        break
      case 'ambiguo':
        // Sin id a propósito: elegir entre dos localidades es la decisión que
        // este tramo saca de la máquina. El CHECK de la base además lo impide.
        await guardar(comercioId, { estado: 'ambiguo', texto: r.candidato }, admin)
        break
      case 'fuera':
        // El texto es el pedido de alta de localidad: sin él, el hueco del
        // padrón no es accionable.
        await guardar(comercioId, { estado: 'fuera', texto: r.candidatos[0] }, admin)
        break
      case 'sin_dato':
        await guardar(comercioId, { estado: 'sin_dato' }, admin)
        break
    }
  } catch (e) {
    // Timeout, DNS, JSON roto, lo que sea. El alta ya está hecha.
    console.error('[localidad] Falló la sugerencia, el alta sigue:', e instanceof Error ? e.message : e)
    try { await guardar(comercioId, { estado: 'error' }, admin) } catch { /* ni eso */ }
  }
}

async function guardar(
  comercioId: string,
  v: { estado: string; id?: number; texto?: string },
  admin: SupabaseClient,
): Promise<void> {
  // supabase-js devuelve el error en .error y no lo lanza: sin este chequeo,
  // una sugerencia que no se guarda es indistinguible de una que no se calculó.
  const { error } = await admin
    .from('comercios')
    .update({
      localidad_sugerida_estado: v.estado,
      localidad_sugerida_id: v.id ?? null,
      localidad_sugerida_texto: v.texto ?? null,
    })
    .eq('id', comercioId)
  if (error) console.error('[localidad] No se pudo guardar la sugerencia:', error.message)
}
