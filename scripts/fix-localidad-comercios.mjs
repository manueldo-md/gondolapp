/**
 * fix-localidad-comercios.mjs
 * Asigna localidad_id a los comercios que tienen localidad_id = null.
 *
 * Estrategia A — Comercios CSV (56 con dirección):
 *   CSV ciudad → se resuelve el localidad_id POR NOMBRE contra la tabla
 *
 * Estrategia B — Comercios ficticios (72 sin dirección, tienen lat/lng):
 *   Nominatim reverse geocoding → extraer localidad → buscar en localidades
 *   Rate limit: 1 req/seg (política de uso justo de Nominatim)
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { resolverEntorno } from './lib/entorno.mjs'
import { textoCsvPiloto } from './lib/csv-piloto.mjs'

// Escribe datos: el proyecto se declara con --ref y se valida contra las
// credenciales antes de tocar nada. Ver scripts/lib/entorno.mjs.
const ENTORNO = resolverEntorno(process.argv)


const db = createClient(
  ENTORNO.url,
  ENTORNO.serviceKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Ciudad del CSV → nombre real en la tabla localidades ─────────────────────
// Antes esto mapeaba a localidad_id hardcodeados, y se rompió: los ids son
// `serial`, o sea que dependen del orden de inserción del seed. Cuando se
// repobló la geografía, 'villa dominguez' apuntaba al id 944 y la tabla pasó a
// tener 942 filas → violación de foreign key. Peor todavía: un id que sigue
// existiendo pero corrido apunta en silencio a otra ciudad.
//
// Ahora el mapa solo resuelve alias (abreviaturas y acentos); el id se busca
// por nombre en tiempo de ejecución. Mismo criterio que resolverCampanaId()
// para las campañas.
//
// Solo hacen falta entradas para los casos donde el CSV NO coincide con el
// nombre de la tabla. Si coincide, no hace falta declararlo.
const ALIAS_CIUDAD = {
  'cdelu':            'Concepción del Uruguay',
  'colon':            'Colón',
  'gualeguaychu':     'Gualeguaychú',
  'chajari':          'Chajarí',
  // Villa Domínguez no está en el seed geográfico: es una de las localidades
  // que se habían agregado a mano y que la reconstrucción del 7/9/2026 no
  // reprodujo. Se aproxima a la cabecera de su departamento, a unos 25 km.
  // Cuando se agregue al seed, borrar esta línea.
  'villa dominguez':  'Villaguay',
}

// El piloto es en Entre Ríos: ante un nombre repetido entre provincias, es la
// que corresponde. Cambiar esto si el piloto se muda.
const PROVINCIA_PREFERIDA = 'Entre Ríos'

// nombre normalizado → [{ id, provincia }]. Es una lista y no un solo id porque
// hay 118 nombres repetidos entre provincias sobre 942 localidades: indexar por
// nombre a secas hace que se pisen y que "San Martín" pueda resolver a Mendoza.
const localidadesPorNombre = new Map()

async function cargarLocalidades() {
  const { data, error } = await db
    .from('localidades')
    .select('id, nombre, departamentos!inner(nombre, provincias!inner(nombre))')
  if (error) { console.error('❌ No se pudieron leer las localidades:', error.message); process.exit(1) }

  for (const l of data) {
    const clave = normCiudad(l.nombre)
    if (!localidadesPorNombre.has(clave)) localidadesPorNombre.set(clave, [])
    localidadesPorNombre.get(clave).push({ id: l.id, provincia: l.departamentos.provincias.nombre, depto: l.departamentos.nombre })
  }
  const ambiguos = [...localidadesPorNombre.values()].filter(v => v.length > 1).length
  console.log(`Localidades cargadas: ${data.length} (${localidadesPorNombre.size} nombres distintos, ${ambiguos} repetidos entre provincias)`)
}

/**
 * Resuelve una ciudad del CSV a localidad_id, o null.
 * Si el nombre existe en varias provincias, prefiere la del piloto; si aun así
 * queda ambiguo, devuelve null en vez de elegir al azar.
 */
function resolverLocalidad(ciudad) {
  const norm = normCiudad(ciudad)
  const nombre = ALIAS_CIUDAD[norm] ?? ciudad
  const candidatos = localidadesPorNombre.get(normCiudad(nombre))
  if (!candidatos || candidatos.length === 0) return null
  if (candidatos.length === 1) return candidatos[0].id

  const enPreferida = candidatos.filter(c => c.provincia === PROVINCIA_PREFERIDA)
  if (enPreferida.length === 1) return enPreferida[0].id

  // Desempate: la cabecera del departamento homónimo. Cuando un CSV dice
  // "Colón" a secas se refiere a la ciudad de Colón, departamento Colón, y no
  // a un paraje del mismo nombre en otro departamento de la misma provincia.
  const cabecera = (enPreferida.length ? enPreferida : candidatos)
    .filter(c => normCiudad(c.depto) === normCiudad(nombre))
  if (cabecera.length === 1) return cabecera[0].id

  const detalle = candidatos.map(c => `${c.provincia}/${c.depto}`).join(', ')
  console.log(`  ⚠️  "${nombre}" es ambiguo (${detalle}) — se omite`)
  return null
}

function normCiudad(s) {
  return (s ?? '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .trim()
}

function normalize(s) {
  return (s ?? '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[()[\]]/g, '').replace(/\s+/g, ' ').trim()
}

function dirMatch(a, b) {
  const na = normalize(a), nb = normalize(b)
  return na === nb || na.startsWith(nb) || nb.startsWith(na)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Nominatim reverse geocoding ──────────────────────────────────────────────
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GondolApp/1.0 (manueldo@biomega.com.ar)' }
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const json = await res.json()
  // Nominatim devuelve address.city o address.town o address.village
  const addr = json.address ?? {}
  return addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.suburb ?? null
}

async function run() {
  await cargarLocalidades()

  // ── 1. Cargar todos los comercios sin localidad_id ─────────────────────────
  const { data: comercios, error } = await db
    .from('comercios')
    .select('id, nombre, direccion, lat, lng')
    .is('localidad_id', null)

  if (error) { console.error('Error:', error.message); return }
  console.log(`Comercios sin localidad_id: ${comercios.length}`)

  const conDir = comercios.filter(c => c.direccion)
  const sinDir = comercios.filter(c => !c.direccion)
  console.log(`  Con dirección (estrategia CSV): ${conDir.length}`)
  console.log(`  Sin dirección (estrategia Nominatim): ${sinDir.length}\n`)

  // ── 2. Leer CSV → mapa dirección → ciudad ─────────────────────────────────
  const text = textoCsvPiloto()
  const lines = text.split('\n').filter(l => l.trim()).slice(1)
  const csvRows = lines.map(line => {
    const cols = line.split(';')
    return { dir: cols[3]?.trim() ?? '', ciudad: cols[4]?.trim() ?? '' }
  }).filter(r => r.dir)

  // ── ESTRATEGIA A: Comercios con dirección → match CSV → localidad_id ───────
  console.log('── Estrategia A: match por dirección CSV ────────────────────────')
  let okA = 0, noMatchA = 0
  const unmatchedA = []

  for (const com of conDir) {
    const csvRow = csvRows.find(r => dirMatch(com.direccion, r.dir))
    if (!csvRow) {
      unmatchedA.push(com.direccion ?? '(sin dir)')
      noMatchA++
      continue
    }

    const locId = resolverLocalidad(csvRow.ciudad)
    if (!locId) {
      console.log(`  ⚠️  Ciudad sin mapeo: "${csvRow.ciudad}" — comercio: "${com.nombre}"`)
      noMatchA++
      continue
    }

    const { error: upErr } = await db.from('comercios').update({ localidad_id: locId }).eq('id', com.id)
    if (upErr) {
      console.error(`  ✗ Error ${com.id}:`, upErr.message)
      noMatchA++
    } else {
      console.log(`  ✓ ${com.nombre} → ${csvRow.ciudad} (loc_id=${locId})`)
      okA++
    }
  }

  console.log(`\nEstrategia A: ${okA} OK | ${noMatchA} sin match`)
  if (unmatchedA.length) console.log('  Sin match dirección:', [...new Set(unmatchedA)])

  // ── ESTRATEGIA B: Sin dirección → Nominatim por lat/lng ───────────────────
  console.log('\n── Estrategia B: Nominatim por lat/lng ──────────────────────────')

  // Busca en TODAS las localidades del país, no solo en Entre Ríos.
  //
  // Antes se filtraba a Entre Ríos —primero por `departamento_id >= 1 && <= 18`
  // "basado en los datos vistos", después por nombre de provincia— y eso hacía
  // que los comercios de otras provincias no resolvieran nunca: los 12 a 16
  // ficticios de Córdoba quedaban siempre sin localidad y había que asignarlos
  // a mano por SQL. Nominatim devuelve bien "Córdoba"; el que no la encontraba
  // era este filtro.
  function buscarLocalidad(nombreNominatim) {
    if (!nombreNominatim) return null
    // Exacto y con alias, ya consciente de la provincia
    const exacto = resolverLocalidad(nombreNominatim)
    if (exacto) return exacto

    // Aproximado, sobre todo el país. Ante varios candidatos, prefiere la
    // provincia del piloto; si aun así hay empate, no adivina.
    const norm = normCiudad(nombreNominatim)
    const candidatos = []
    for (const [nombre, entradas] of localidadesPorNombre.entries()) {
      if (nombre.includes(norm) || norm.includes(nombre)) candidatos.push(...entradas)
    }
    if (candidatos.length === 0) return null
    if (candidatos.length === 1) return candidatos[0].id

    const enPreferida = candidatos.filter(c => c.provincia === PROVINCIA_PREFERIDA)
    if (enPreferida.length === 1) return enPreferida[0].id
    return null
  }

  let okB = 0, noMatchB = 0, errorB = 0
  const noMatchedB = []

  for (let i = 0; i < sinDir.length; i++) {
    const com = sinDir[i]
    await sleep(1100) // 1 req/seg — política de uso justo de Nominatim

    let ciudad = null
    try {
      ciudad = await reverseGeocode(com.lat, com.lng)
    } catch (e) {
      console.error(`  ✗ Nominatim error para ${com.nombre}:`, e.message)
      errorB++
      continue
    }

    const locId = buscarLocalidad(ciudad)
    if (!locId) {
      console.log(`  ⚠️  Sin match: "${com.nombre}" → Nominatim="${ciudad}"`)
      noMatchedB.push(`${com.nombre} (${ciudad ?? 'null'})`)
      noMatchB++
      continue
    }

    const { error: upErr } = await db.from('comercios').update({ localidad_id: locId }).eq('id', com.id)
    if (upErr) {
      console.error(`  ✗ Update error ${com.id}:`, upErr.message)
      errorB++
    } else {
      console.log(`  ✓ [${i+1}/${sinDir.length}] ${com.nombre} → "${ciudad}" → loc_id=${locId}`)
      okB++
    }
  }

  console.log(`\nEstrategia B: ${okB} OK | ${noMatchB} sin match | ${errorB} errores`)
  if (noMatchedB.length) console.log('  Sin match:', noMatchedB)

  // ── 3. Resumen final ───────────────────────────────────────────────────────
  const { data: restantes } = await db.from('comercios').select('id', { count: 'exact' }).is('localidad_id', null)
  console.log(`\n══ RESUMEN ══════════════════════════════`)
  console.log(`  Estrategia A (CSV):      ${okA} actualizados`)
  console.log(`  Estrategia B (Nominatim):${okB} actualizados`)
  console.log(`  Total actualizados:      ${okA + okB}`)
  console.log(`  Aún sin localidad_id:    ${restantes?.length ?? '?'}`)
}

run().catch(err => { console.error(err); process.exit(1) })
