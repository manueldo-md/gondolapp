/**
 * fix-localidad-comercios.mjs
 * Asigna localidad_id a los comercios que tienen localidad_id = null.
 *
 * Estrategia A — Comercios CSV (56 con dirección):
 *   CSV ciudad → localidad_id hardcodeado desde tabla localidades
 *
 * Estrategia B — Comercios ficticios (72 sin dirección, tienen lat/lng):
 *   Nominatim reverse geocoding → extraer localidad → buscar en localidades
 *   Rate limit: 1 req/seg (política de uso justo de Nominatim)
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const CSV_PATH = 'C:/Users/manue/OneDrive/LABORAL.OL/Biomega/Georgalos/Reporte Georgalos al 12032026.07.30hs.csv'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Mapa hardcodeado ciudad CSV → localidad_id (verificado contra tabla localidades) ──
const CIUDAD_TO_LOC_ID = {
  'colon':                    1,    // Colón, Entre Ríos (depto 1)
  'colon ':                   1,
  'cdelu':                    119,  // Concepción del Uruguay (depto 15)
  'concordia':                13,
  'gualeguaychu':             57,
  'villaguay':                136,
  'chajari':                  31,
  'rosario del tala':         112,
  'general campos':           109,
  'villa dominguez':          944,
  'san salvador':             108,
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
  const text = fs.readFileSync(CSV_PATH).toString('latin1')
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

    const locId = CIUDAD_TO_LOC_ID[normCiudad(csvRow.ciudad)]
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

  // Cargar todas las localidades de Entre Ríos para buscar matches
  const { data: todasLocs } = await db.from('localidades').select('id, nombre, departamento_id')

  // Departamentos de Entre Ríos: 1-18 (basado en los datos vistos)
  const locsEntreRios = (todasLocs ?? []).filter(l => l.departamento_id >= 1 && l.departamento_id <= 18)
  console.log(`  Localidades de Entre Ríos cargadas: ${locsEntreRios.length}`)

  function buscarLocalidad(nombreNominatim) {
    if (!nombreNominatim) return null
    const norm = normCiudad(nombreNominatim)
    // Primero buscar en CIUDAD_TO_LOC_ID
    if (CIUDAD_TO_LOC_ID[norm]) return CIUDAD_TO_LOC_ID[norm]
    // Luego buscar en tabla
    const match = locsEntreRios.find(l =>
      normCiudad(l.nombre) === norm ||
      normCiudad(l.nombre).includes(norm) ||
      norm.includes(normCiudad(l.nombre))
    )
    return match?.id ?? null
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
