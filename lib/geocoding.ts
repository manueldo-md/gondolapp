/**
 * lib/geocoding.ts — de lo que dice un proveedor de reverse geocoding a una
 * localidad del padrón. SIN RED Y SIN BASE: recibe la respuesta ya parseada y
 * las filas candidatas, y decide.
 *
 * ETAPA 2 del tramo "localidad_id en el alta de comercio".
 *
 * ── LO QUE ESTA FUNCIÓN DEVUELVE ES UNA SUGERENCIA, NUNCA UN DATO ───────────
 * Medido el 25/9/2026 contra verdad de referencia —los 91 comercios que tienen
 * localidad asignada desde el CSV del piloto—:
 *
 *     COINCIDE   8 de 12
 *     DISTINTO   1          ← un comercio de Gualeguaychú resolvió a "Larroque"
 *     ambiguo    1
 *     sin dato   2
 *
 * Ese 8% que resuelve DISTINTO es la razón de que el resultado vaya a
 * `comercios.localidad_sugerida` y lo confirme una persona en la bandeja de
 * pendientes. **Un dato malo que entra como bueno es peor que un hueco, porque
 * el hueco se ve**: un comercio con la localidad equivocada no cae en ninguna
 * bandeja y envenena el corte por provincia, que es para lo que existe todo
 * esto.
 *
 * Y ojo con lo que este archivo NO puede hacer: cuando el proveedor contesta
 * "Larroque" y Larroque existe en el padrón, acá se devuelve `exacto` — con
 * toda la razón, porque la respuesta es internamente consistente. **El error
 * está río arriba y no hay lógica que lo detecte.** Por eso la salvaguarda no
 * es un `if`, es que alguien mire.
 *
 * ── EL BUG QUE MUERE ACÁ ────────────────────────────────────────────────────
 * `resolverLocalidadPorGPS` en `gondolero/comercios/nuevo/actions.ts` hacía:
 *
 *     .from('localidades').select('id').ilike('nombre', nombre).limit(1).maybeSingle()
 *
 * **Sin filtrar provincia y quedándose con el primero.** Hay 99 nombres
 * repetidos entre provincias —"25 de Mayo" cuatro veces, "Bella Vista" cuatro,
 * "Mercedes" tres— así que podía asignar un comercio bonaerense al "25 de Mayo"
 * de San Juan, loguear `[geocoding] Match` y seguir. Estaba dormido porque esa
 * ruta no se linkea desde ningún lado; pasa a ser el camino principal, y ahí sí
 * importa.
 *
 * Las dos reglas que lo cierran: **se filtra por provincia**, y **ante
 * ambigüedad no se adivina** — se devuelven las opciones y decide una persona.
 */

/** Los campos que interesan de un reverse geocoding, ya parseados. */
export interface DireccionProveedor {
  village?: string | null
  town?: string | null
  city?: string | null
  municipality?: string | null
  suburb?: string | null
  /**
   * OJO: **`county` NO es nuestro departamento.** Medido contra Colón (Entre
   * Ríos), Nominatim devuelve `"Distrito Primero"`, que es una división
   * sub-departamental entrerriana que no existe en `departamentos`.
   *
   * Por eso se usa **solo como desempate cuando coincide**, nunca para
   * rechazar: si `county` no matchea ningún departamento —el caso normal— el
   * resultado no cambia. Tratarlo como requisito dejaría fuera casi todo.
   */
  county?: string | null
  /** La provincia. Es el filtro que cierra el bug del `ilike`. */
  state?: string | null
}

/** Una fila del padrón, con su cadena resuelta. */
export interface FilaPadron {
  id: number
  nombre: string
  departamento: string
  provincia: string
}

export type Resolucion =
  /** Una sola localidad. Sigue siendo una SUGERENCIA. */
  | { estado: 'exacto'; localidadId: number; fila: FilaPadron; candidato: string }
  /** Varias. No se elige: van las opciones para que decida una persona. */
  | { estado: 'ambiguo'; opciones: FilaPadron[]; candidato: string }
  /** El proveedor dio un nombre y no está en el padrón. */
  | { estado: 'fuera'; candidatos: string[]; provincia: string | null }
  /** El proveedor no devolvió ningún nombre de lugar usable. */
  | { estado: 'sin_dato' }

/**
 * Los candidatos EN ORDEN DE ESPECIFICIDAD. El orden importa y no es cosmético:
 * el primero que matchea gana, así que aplanarlos —probarlos todos juntos y
 * juntar los resultados— convierte un pueblo bien resuelto en un empate.
 *
 * Es el error que cometí midiendo esto el 25/9: aplané la lista y me dio 18
 * ambiguos de 19, cuando el problema real era otro.
 *
 * `county` NO entra: es el departamento, no la localidad. Incluirlo hacía
 * matchear el nombre del departamento como si fuera un pueblo.
 */
export function candidatosDe(d: DireccionProveedor): string[] {
  return [d.village, d.town, d.city, d.municipality, d.suburb]
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(v => v.length > 0)
    // Sin repetir: los proveedores suelen mandar el mismo nombre en dos campos.
    .filter((v, i, a) => a.findIndex(x => normalizar(x) === normalizar(v)) === i)
}

/**
 * Para comparar nombres de lugar: sin acentos, sin may/min, sin espacios de
 * más. El padrón tiene "Colón" y el proveedor puede mandar "Colon".
 */
export function normalizar(s: string | null | undefined): string {
  return String(s ?? '')
    // Saca las marcas de combinación (categoría Unicode M) que NFD dejó sueltas:
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/** "Provincia de Buenos Aires" y "Buenos Aires" son la misma. */
function normalizarProvincia(s: string | null | undefined): string {
  return normalizar(s).replace(/^provincia de /, '')
}

/**
 * Resuelve la localidad.
 *
 * `padron` son las filas candidatas — en producción, el resultado de consultar
 * `localidades` por los nombres de `candidatosDe`. Se pasan por parámetro para
 * que esto sea probable sin base y sin red, que es la mitad del punto: el bug
 * que murió acá vivía en una función que solo se podía ejercitar con las dos.
 */
export function resolverLocalidad(d: DireccionProveedor, padron: FilaPadron[]): Resolucion {
  const candidatos = candidatosDe(d)
  if (candidatos.length === 0) return { estado: 'sin_dato' }

  const prov = d.state ? normalizarProvincia(d.state) : null

  for (const candidato of candidatos) {
    const porNombre = padron.filter(f => normalizar(f.nombre) === normalizar(candidato))
    if (porNombre.length === 0) continue

    // ── EL ARREGLO DEL BUG: la provincia filtra ─────────────────────────────
    // Si el proveedor no la dio, NO se inventa: se sigue con todas y lo más
    // probable es que termine en `ambiguo`, que es la respuesta honesta.
    const enProvincia = prov
      ? porNombre.filter(f => normalizarProvincia(f.provincia) === prov)
      : porNombre

    // Si la provincia no dejó ninguna, el proveedor y el padrón no coinciden.
    // Se sigue con el candidato siguiente en vez de caer a `porNombre`, que
    // sería volver a elegir una localidad de otra provincia.
    if (enProvincia.length === 0) continue

    if (enProvincia.length === 1) {
      return { estado: 'exacto', localidadId: enProvincia[0].id, fila: enProvincia[0], candidato }
    }

    // ── El desempate por departamento, que casi nunca aplica ────────────────
    // Solo si `county` coincide EXACTO con uno de los departamentos. Como
    // `county` suele traer otra cosa (ver DireccionProveedor), lo normal es que
    // esto no filtre nada y el resultado sea `ambiguo`. Está bien que así sea.
    const porDepto = d.county
      ? enProvincia.filter(f => normalizar(f.departamento) === normalizar(d.county))
      : []
    if (porDepto.length === 1) {
      return { estado: 'exacto', localidadId: porDepto[0].id, fila: porDepto[0], candidato }
    }

    // Varias y sin forma de elegir: NO SE ADIVINA.
    return { estado: 'ambiguo', opciones: enProvincia, candidato }
  }

  return { estado: 'fuera', candidatos, provincia: d.state ?? null }
}

/** Para el log y para la bandeja: una línea que dice qué pasó y por qué. */
export function explicarResolucion(r: Resolucion): string {
  switch (r.estado) {
    case 'exacto':
      return `${r.fila.nombre} — ${r.fila.departamento}, ${r.fila.provincia}`
    case 'ambiguo':
      return `"${r.candidato}" existe ${r.opciones.length} veces en ${r.opciones[0].provincia}` +
        ` (${r.opciones.map(o => o.departamento).join(', ')}). Sin resolver: lo elige una persona.`
    case 'fuera':
      return `"${r.candidatos[0]}"${r.provincia ? ` (${r.provincia})` : ''} no está en el padrón.`
    case 'sin_dato':
      return 'El proveedor no devolvió ningún nombre de lugar.'
  }
}
