/**
 * fix-declaracion-georgalos.mjs
 * Actualiza fotos.declaracion para la campaña Georgalos
 * basándose en "Hay productos GEORGALOS en el local?" del CSV.
 *
 * Mapeo: SI → 'producto_presente' | NO → 'producto_no_encontrado'
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { resolverEntorno } from './lib/entorno.mjs'
import { textoCsvPiloto } from './lib/csv-piloto.mjs'

// Escribe datos: el proyecto se declara con --ref y se valida contra las
// credenciales antes de tocar nada. Ver scripts/lib/entorno.mjs.
const ENTORNO = resolverEntorno(process.argv)

import { resolverCampanaId } from './lib/campana.mjs'

// El id se resuelve por nombre en run(): el seed recrea la campaña con id nuevo
let CAMPANA_ID = null

const db = createClient(
  ENTORNO.url,
  ENTORNO.serviceKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function normalize(s) {
  return (s ?? '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function dirMatch(dbDir, csvDir) {
  const a = normalize(dbDir)
  const b = normalize(csvDir)
  return a === b || a.startsWith(b) || b.startsWith(a)
}

async function run() {
  CAMPANA_ID = await resolverCampanaId(db)

  // ── 1. Leer CSV ──────────────────────────────────────────────
  const text = textoCsvPiloto()
  const lines = text.split('\n').filter(l => l.trim()).slice(1) // skip header

  const csvRows = lines.map(line => {
    const cols = line.split(';')
    const hayGeorgalos = cols[5]?.trim().toUpperCase()
    return {
      dir:         cols[3]?.trim() ?? '',
      declaracion: hayGeorgalos === 'SI' ? 'producto_presente' : 'producto_no_encontrado',
    }
  }).filter(r => r.dir)

  console.log(`CSV: ${csvRows.length} filas`)
  const presentes    = csvRows.filter(r => r.declaracion === 'producto_presente').length
  const noEncontrados = csvRows.filter(r => r.declaracion === 'producto_no_encontrado').length
  console.log(`  → producto_presente: ${presentes} | producto_no_encontrado: ${noEncontrados}`)

  // ── 2. Cargar misiones de la campaña con sus comercios ────────
  const { data: misiones, error: mErr } = await db
    .from('misiones')
    .select('id, comercio_id')
    .eq('campana_id', CAMPANA_ID)

  if (mErr) { console.error('Error cargando misiones:', mErr.message); return }
  console.log(`\nMisiones en DB: ${misiones?.length}`)

  // ── 3. Cargar direcciones de comercios ────────────────────────
  const comercioIds = [...new Set((misiones ?? []).map(m => m.comercio_id).filter(Boolean))]
  const { data: comercios } = await db
    .from('comercios')
    .select('id, direccion')
    .in('id', comercioIds)
  const comercioToDireccion = new Map((comercios ?? []).map(c => [c.id, c.direccion]))

  // ── 4. Construir misionId → declaracion ──────────────────────
  let matched = 0, unmatched = 0
  const unmatchedDirs = []
  const misionDeclaracion = new Map()

  for (const mision of misiones ?? []) {
    const dbDir = comercioToDireccion.get(mision.comercio_id) ?? ''
    const csvRow = csvRows.find(r => dirMatch(dbDir, r.dir))

    if (!csvRow) {
      unmatched++
      unmatchedDirs.push(dbDir)
      continue
    }
    misionDeclaracion.set(mision.id, csvRow.declaracion)
    matched++
  }

  console.log(`Match: ${matched} | Sin match: ${unmatched}`)
  if (unmatchedDirs.length) {
    console.log('  Sin match:', [...new Set(unmatchedDirs)])
  }

  // ── 5. Actualizar fotos ───────────────────────────────────────
  let ok = 0, errCount = 0

  for (const [misionId, declaracion] of misionDeclaracion.entries()) {
    const { error } = await db
      .from('fotos')
      .update({ declaracion })
      .eq('mision_id', misionId)

    if (error) {
      console.error(`  ✗ mision ${misionId}:`, error.message)
      errCount++
    } else {
      ok++
    }
  }

  console.log(`\n✅ Misiones actualizadas: ${ok} | ✗ Errores: ${errCount}`)

  // ── 6. Verificar resultado final ─────────────────────────────
  const { data: check } = await db
    .from('fotos')
    .select('declaracion')
    .eq('campana_id', CAMPANA_ID)

  const counts = { producto_presente: 0, producto_no_encontrado: 0, null: 0, otro: 0 }
  for (const f of check ?? []) {
    const k = f.declaracion ?? 'null'
    counts[k] = (counts[k] ?? 0) + 1
  }
  console.log('\nEstado final fotos campaña Georgalos:')
  console.log(`  producto_presente:     ${counts['producto_presente']}`)
  console.log(`  producto_no_encontrado: ${counts['producto_no_encontrado']}`)
  console.log(`  null (sin actualizar):  ${counts['null']}`)
}

run().catch(err => { console.error(err); process.exit(1) })
