/**
 * medir-geocoding.mts — ¿qué tan seguido acierta el proveedor, de verdad?
 *
 *   npx tsx scripts/medir-geocoding.mts              (dev)
 *   npx tsx scripts/medir-geocoding.mts --prod
 *   npx tsx scripts/medir-geocoding.mts --sin-loc    (los que hoy no tienen)
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El número que decide todo el tramo —el geocoding SUGIERE, no escribe— salió
 * de medir la precisión contra verdad de referencia: los comercios que ya
 * tienen localidad asignada desde el CSV del piloto. Este script es el que lo
 * mide, y hay que poder volver a correrlo cuando cambie el proveedor o crezca
 * el padrón.
 *
 * ── LLAMA A LA LIB, NO LA REIMPLEMENTA ──────────────────────────────────────
 * La primera versión de esta medición replicaba el matching a mano y dio un
 * resultado falso: normalizaba los acentos del parámetro y comparaba contra los
 * nombres CON acento de la base, así que "Concordia" figuraba como "fuera del
 * padrón". Concordia está en el padrón desde el primer día.
 *
 * Es el mismo defecto que el proyecto ya documentó dos veces —la sonda del mapa
 * que medía una URL escrita a mano, y el control del thumb que replicaba el
 * SQL—: **un script que reimplementa lo que dice medir, mide otra cosa.** Ahora
 * usa `resolverLocalidad`, que es la que corre en producción.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { resolverLocalidad, candidatosDe, type FilaPadron, type DireccionProveedor } from '../lib/geocoding'

const esProd = process.argv.includes('--prod')
const soloSinLoc = process.argv.includes('--sin-loc')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'

const { vars } = credencialesDeRef(ref)
const KEY = vars.GEOAPIFY_SERVER_KEY
if (!KEY) { console.error('\n✗ Falta GEOAPIFY_SERVER_KEY en el .env\n'); process.exit(1) }

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
const c = new Client({ connectionString: vars.PGURL })
await c.connect()
console.log(`\n▸ ${nombreDeRef(ref)} · proveedor: Geoapify${soloSinLoc ? ' · solo los que NO tienen localidad' : ''}`)

/** La misma llamada que va a hacer el servidor. */
async function geocodificar(lat: number, lng: number): Promise<DireccionProveedor | null> {
  const u = new URL('https://api.geoapify.com/v1/geocode/reverse')
  u.searchParams.set('lat', String(lat))
  u.searchParams.set('lon', String(lng))
  u.searchParams.set('format', 'json')
  u.searchParams.set('lang', 'es')
  u.searchParams.set('apiKey', KEY)
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const a = (await r.json())?.results?.[0] ?? {}
    return { village: a.village, town: a.town, city: a.city, municipality: a.municipality,
             suburb: a.suburb, county: a.county, state: a.state }
  } catch { return null }
}

/** El padrón que la lib necesita: las filas que matchean algún candidato. */
async function padronDe(cands: string[]): Promise<FilaPadron[]> {
  if (!cands.length) return []
  const { rows } = await c.query(`
    SELECT l.id, l.nombre, d.nombre AS departamento, p.nombre AS provincia
      FROM localidades l
      JOIN departamentos d ON d.id = l.departamento_id
      JOIN provincias   p ON p.id = d.provincia_id
     WHERE unaccent_lower(l.nombre) = ANY($1::text[])`,
    [cands.map(x => x.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))])
    .catch(async () => {
      // Sin la función en la base: se trae por nombre exacto y la lib normaliza.
      return c.query(`
        SELECT l.id, l.nombre, d.nombre AS departamento, p.nombre AS provincia
          FROM localidades l
          JOIN departamentos d ON d.id = l.departamento_id
          JOIN provincias   p ON p.id = d.provincia_id
         WHERE lower(l.nombre) = ANY($1::text[])`, [cands.map(x => x.toLowerCase())])
    })
  return rows as FilaPadron[]
}

const sql = soloSinLoc
  ? `SELECT co.nombre AS etiqueta, co.lat, co.lng, NULL::text AS real
       FROM comercios co WHERE co.localidad_id IS NULL AND co.lat IS NOT NULL
      ORDER BY co.created_at`
  // Uno por localidad, para cubrir pueblos distintos y no 20 del mismo.
  : `SELECT DISTINCT ON (l.id) l.nombre AS etiqueta, co.lat, co.lng, l.nombre AS real
       FROM comercios co
       JOIN localidades l ON l.id = co.localidad_id
      WHERE co.lat IS NOT NULL ORDER BY l.id, co.created_at`

const { rows } = await c.query(sql)
console.log(`  ${rows.length} puntos\n`)

const cuenta = { coincide: 0, distinto: 0, exacto: 0, ambiguo: 0, fuera: 0, sin_dato: 0, error: 0 }

for (const co of rows) {
  await dormir(220)                                    // ~4/s, bajo el límite de 5
  const dir = await geocodificar(Number(co.lat), Number(co.lng))
  if (!dir) { cuenta.error++; console.log('  ' + String(co.etiqueta).slice(0, 24).padEnd(24) + 'error de red'); continue }

  const r = resolverLocalidad(dir, await padronDe(candidatosDe(dir)))
  cuenta[r.estado]++

  let linea: string
  if (r.estado === 'exacto') {
    if (co.real == null) linea = '→ ' + r.fila.nombre + ' (' + r.fila.departamento + ')'
    else if (r.fila.nombre.toLowerCase() === String(co.real).toLowerCase()) { cuenta.coincide++; linea = '✓ coincide' }
    else { cuenta.distinto++; linea = '✗✗ DISTINTO: dijo "' + r.fila.nombre + '"' }
  } else if (r.estado === 'ambiguo') linea = '⚠ ambiguo x' + r.opciones.length + ' (' + r.opciones.map(o => o.departamento).join('/') + ')'
  else if (r.estado === 'fuera')     linea = '✗ fuera del padrón → "' + r.candidatos[0] + '"'
  else                               linea = '· sin dato del proveedor'
  console.log('  ' + String(co.etiqueta).slice(0, 24).padEnd(24) + linea)
}

console.log('\n  ── por estado de la lib ──')
console.log(`  exacto ${cuenta.exacto} · ambiguo ${cuenta.ambiguo} · fuera ${cuenta.fuera} · sin_dato ${cuenta.sin_dato} · error ${cuenta.error}`)
if (!soloSinLoc) {
  const t = cuenta.coincide + cuenta.distinto
  console.log(`  ── contra verdad de referencia ──`)
  console.log(`  de los ${t} que resolvieron exacto: COINCIDE ${cuenta.coincide} · DISTINTO ${cuenta.distinto}` +
    (t ? `  (${Math.round(cuenta.distinto / t * 100)}% mal)` : ''))
  console.log('\n  Recordatorio: DISTINTO no lo puede detectar ninguna lógica — la respuesta')
  console.log('  es internamente consistente. Por eso el resultado es una SUGERENCIA.')
}
await c.end()
