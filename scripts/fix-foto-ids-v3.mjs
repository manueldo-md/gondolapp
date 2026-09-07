/**
 * fix-foto-ids-v3.mjs
 * Re-extrae FILE_IDs correctos del CSV real y actualiza las fotos en DB.
 * Valida que cada FILE_ID tenga exactamente 33 caracteres.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { resolverCampanaId } from './lib/campana.mjs'

const CSV_PATH = 'C:/Users/manue/OneDrive/LABORAL.OL/Biomega/Georgalos/Reporte Georgalos al 12032026.07.30hs.csv'
// El id se resuelve por nombre en run(): el seed recrea la campaña con id nuevo
let CAMPANA_ID = null

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function extractId(url) {
  const m = url?.match(/[?&]id=([^&\s\r]+)/)
  return m?.[1]?.trim() ?? null
}

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

function thumb(id) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w800`
}

async function run() {
  CAMPANA_ID = await resolverCampanaId(db)

  // ── 1. Leer CSV ──────────────────────────────────────────────
  const text = fs.readFileSync(CSV_PATH).toString('latin1')
  const lines = text.split('\n').filter(l => l.trim()).slice(1)

  const csvRows = []
  for (const line of lines) {
    const cols = line.split(';')
    const dir = cols[3]?.trim() ?? ''
    const id1 = extractId(cols[6]?.trim())
    const id2 = extractId(cols[7]?.trim())
    if (!id1 && !id2) continue

    // Validar longitud
    for (const [label, id] of [['foto1', id1], ['foto2', id2]]) {
      if (id && id.length !== 33) {
        console.warn(`  ⚠️  FILE_ID con longitud incorrecta (${id.length}) — ${label} — dir: "${dir}" — id: ${id}`)
      }
    }
    csvRows.push({ dir, id1, id2 })
  }
  console.log(`CSV: ${csvRows.length} filas con fotos`)

  // Set de IDs correctos para auditoría
  const correctIds = new Set([...csvRows.map(r => r.id1), ...csvRows.map(r => r.id2)].filter(Boolean))

  // ── 2. Fotos actuales en DB ───────────────────────────────────
  const { data: fotos, error: fErr } = await db
    .from('fotos')
    .select('id, mision_id, bloque_id, url')
    .eq('campana_id', CAMPANA_ID)

  if (fErr) { console.error('Error:', fErr.message); return }
  console.log(`Fotos en DB para la campaña: ${fotos?.length}`)

  // Auditoría rápida: ¿cuántas ya tienen IDs correctos?
  let yaCorrectas = 0, incorrectas = 0, otrasUrls = 0
  for (const f of fotos ?? []) {
    const m = f.url?.match(/thumbnail\?id=([^&]+)/)
    if (!m) { otrasUrls++; continue }
    correctIds.has(m[1]) ? yaCorrectas++ : incorrectas++
  }
  console.log(`  → Ya correctas: ${yaCorrectas} | IDs incorrectos: ${incorrectas} | Otras URLs: ${otrasUrls}`)

  if (incorrectas === 0 && otrasUrls === 0) {
    console.log('\n✅ Todas las fotos ya tienen FILE_IDs correctos. Nada que actualizar.')
    return
  }

  // ── 3. Resolver metadata para el match ────────────────────────
  const misionIds = [...new Set((fotos ?? []).map(f => f.mision_id).filter(Boolean))]
  const { data: misiones } = await db.from('misiones').select('id, comercio_id').in('id', misionIds)
  const misionToComercio = new Map((misiones ?? []).map(m => [m.id, m.comercio_id]))

  const comercioIds = [...new Set([...misionToComercio.values()].filter(Boolean))]
  const { data: comercios } = await db.from('comercios').select('id, direccion').in('id', comercioIds)
  const comercioToDireccion = new Map((comercios ?? []).map(c => [c.id, c.direccion]))

  const bloqueIds = [...new Set((fotos ?? []).map(f => f.bloque_id).filter(Boolean))]
  const { data: bloques } = await db.from('bloques_foto').select('id, orden').in('id', bloqueIds)
  const bloqueToOrden = new Map((bloques ?? []).map(b => [b.id, b.orden]))

  // ── 4. Actualizar solo las que tienen IDs incorrectos o no-thumbnail ──
  let updated = 0, noMatch = 0, skipped = 0
  const unmatched = []

  for (const foto of fotos ?? []) {
    // Verificar si el ID actual ya es correcto
    const currentMatch = foto.url?.match(/thumbnail\?id=([^&]+)/)
    if (currentMatch && correctIds.has(currentMatch[1])) {
      skipped++
      continue
    }

    // Necesita actualización — buscar fila CSV por dirección
    const comercioId = misionToComercio.get(foto.mision_id)
    const dbDir = comercioToDireccion.get(comercioId) ?? ''
    const orden = bloqueToOrden.get(foto.bloque_id) ?? 1

    const csvRow = csvRows.find(r => dirMatch(dbDir, r.dir))
    if (!csvRow) {
      unmatched.push(dbDir)
      noMatch++
      continue
    }

    const driveId = orden === 1 ? csvRow.id1 : csvRow.id2
    if (!driveId) {
      console.warn(`  ⚠️  Sin id para orden=${orden} en "${dbDir}"`)
      noMatch++
      continue
    }

    if (driveId.length !== 33) {
      console.warn(`  ⚠️  FILE_ID con longitud ${driveId.length} para "${dbDir}" orden=${orden}: ${driveId}`)
    }

    const newUrl = thumb(driveId)
    const { error } = await db.from('fotos').update({ url: newUrl }).eq('id', foto.id)
    if (error) {
      console.error(`  ✗ Error en ${foto.id}:`, error.message)
      noMatch++
    } else {
      updated++
    }
  }

  console.log(`\n✅ Actualizadas: ${updated}`)
  console.log(`⏭️  Omitidas (ya correctas): ${skipped}`)
  console.log(`⚠️  Sin match de dirección: ${noMatch}`)
  if (unmatched.length) {
    console.log('   Direcciones sin match:', [...new Set(unmatched)])
  }

  // ── 5. Estado final ───────────────────────────────────────────
  const { data: finals } = await db.from('fotos').select('url').eq('campana_id', CAMPANA_ID)
  let finalOk = 0, finalWrong = 0
  for (const f of finals ?? []) {
    const m = f.url?.match(/thumbnail\?id=([^&]+)/)
    if (m && correctIds.has(m[1])) finalOk++
    else { finalWrong++; if (finalWrong <= 5) console.log('  Aún incorrecta:', f.url) }
  }
  console.log(`\nEstado final: ${finalOk}/${finals?.length} fotos con FILE_IDs correctos del CSV`)
}

run().catch(err => { console.error(err); process.exit(1) })
