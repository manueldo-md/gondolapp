/**
 * fix-declaracion-georgalos.mjs
 * Actualiza fotos.declaracion para la campaña Georgalos
 * basándose en "Hay productos GEORGALOS en el local?" del CSV.
 *
 * Mapeo: SI → 'producto_presente' | NO → 'producto_no_encontrado'
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const CSV_PATH   = 'C:/Users/manue/OneDrive/LABORAL.OL/Biomega/Georgalos/Reporte Georgalos al 12032026.07.30hs.csv'
const CAMPANA_ID = 'c3621111-597b-445b-8129-69a6fe81cb9c' // Relevamiento snacks · Entre Ríos Q1 2026

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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
  // ── 1. Leer CSV ──────────────────────────────────────────────
  const text = fs.readFileSync(CSV_PATH).toString('latin1')
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
