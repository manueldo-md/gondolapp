/**
 * fix-foto-urls-v2.mjs
 * Lee el CSV real de Georgalos y actualiza las URLs de fotos en la DB
 * al formato thumbnail de Google Drive.
 *
 * CSV cols (sep ;, encoding latin1):
 *   0  Marca temporal
 *   1  VENDEDOR
 *   2  Tipo de Comercio
 *   3  Dirección Completa
 *   4  Ciudad
 *   5  Hay Georgalos?
 *   6  Foto 1 Góndola    → https://drive.google.com/open?id=FILE_ID
 *   7  Foto 2 Góndola    → https://drive.google.com/open?id=FILE_ID
 *   10 Email
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { resolverEntorno } from './lib/entorno.mjs'

// Escribe datos: el proyecto se declara con --ref y se valida contra las
// credenciales antes de tocar nada. Ver scripts/lib/entorno.mjs.
const ENTORNO = resolverEntorno(process.argv)

const CSV_PATH = 'C:/Users/manue/OneDrive/LABORAL.OL/Biomega/Georgalos/Reporte Georgalos al 12032026.07.30hs.csv'

const db = createClient(
  ENTORNO.url,
  ENTORNO.serviceKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function extractDriveId(url) {
  if (!url) return null
  // formats: open?id=XXX, uc?export=view&id=XXX, thumbnail?id=XXX
  const m = url.match(/[?&]id=([^&\s]+)/)
  return m ? m[1].trim() : null
}

function thumb(id) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w800`
}

function normalize(s) {
  return (s ?? '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[()[\]]/g, '')   // quitar paréntesis
    .replace(/\s+/g, ' ')
    .trim()
}

// Similarity: does normalized(a) start with or contain normalized(b)?
function dirMatch(dbDir, csvDir) {
  const a = normalize(dbDir)
  const b = normalize(csvDir)
  return a === b || a.startsWith(b) || b.startsWith(a)
}

async function run() {
  // 1. Leer CSV
  const buf = fs.readFileSync(CSV_PATH)
  const text = buf.toString('latin1')
  const lines = text.split('\n').filter(l => l.trim())

  // Skip header line
  const rows = lines.slice(1).map(line => {
    const cols = line.split(';')
    return {
      direccion: cols[3]?.trim() ?? '',
      ciudad:    cols[4]?.trim() ?? '',
      foto1:     extractDriveId(cols[6]?.trim()),
      foto2:     extractDriveId(cols[7]?.trim()),
    }
  }).filter(r => r.foto1 || r.foto2)

  console.log(`CSV: ${rows.length} filas con fotos`)

  // 2. Buscar fotos de la campaña Georgalos
  // Primero encontrar la campaña
  const { data: campanas } = await db.from('campanas').select('id, nombre').ilike('nombre', '%snacks%')
  console.log('Campañas encontradas:', campanas?.map(c => `${c.nombre} (${c.id})`))

  if (!campanas?.length) {
    console.error('No se encontró campaña Georgalos/snacks')
    return
  }
  const campanaId = campanas[0].id

  // 3. Obtener fotos con URLs que no sean thumbnail (incluye picsum y otras)
  const { data: fotos } = await db
    .from('fotos')
    .select('id, mision_id, bloque_id, url')
    .eq('campana_id', campanaId)
    .not('url', 'ilike', '%thumbnail%')  // las que ya están bien no las toco

  console.log(`Fotos a revisar (campaña ${campanaId}):`, fotos?.length ?? 0)
  if (!fotos?.length) { console.log('Todas las fotos ya tienen URLs correctas.'); return }

  // 4. Misiones → comercio_id
  const misionIds = [...new Set(fotos.map(f => f.mision_id).filter(Boolean))]
  const { data: misiones } = await db.from('misiones').select('id, comercio_id').in('id', misionIds)
  const misionToComercio = new Map((misiones ?? []).map(m => [m.id, m.comercio_id]))

  // 5. Comercios → direccion
  const comercioIds = [...new Set([...misionToComercio.values()].filter(Boolean))]
  const { data: comercios } = await db.from('comercios').select('id, direccion').in('id', comercioIds)
  const comercioToDireccion = new Map((comercios ?? []).map(c => [c.id, c.direccion]))

  // 6. Bloques → orden
  const bloqueIds = [...new Set(fotos.map(f => f.bloque_id).filter(Boolean))]
  const { data: bloques } = await db.from('bloques_foto').select('id, orden').in('id', bloqueIds)
  const bloqueToOrden = new Map((bloques ?? []).map(b => [b.id, b.orden]))

  // 7. Actualizar
  let ok = 0, noMatch = 0
  const unmatched = []

  for (const foto of fotos) {
    const comercioId = misionToComercio.get(foto.mision_id)
    const dbDireccion = comercioToDireccion.get(comercioId) ?? ''
    const orden = bloqueToOrden.get(foto.bloque_id) ?? 1

    // Buscar fila CSV que haga match con la dirección
    const csvRow = rows.find(r => dirMatch(dbDireccion, r.direccion))

    if (!csvRow) {
      console.log(`  ⚠️  Sin match: "${dbDireccion}"`)
      unmatched.push(dbDireccion)
      noMatch++
      continue
    }

    const driveId = orden === 1 ? csvRow.foto1 : csvRow.foto2
    if (!driveId) {
      console.log(`  ⚠️  Sin driveId para orden=${orden} en "${dbDireccion}"`)
      noMatch++
      continue
    }

    const newUrl = thumb(driveId)
    const { error } = await db.from('fotos').update({ url: newUrl }).eq('id', foto.id)
    if (error) {
      console.error(`  ✗ Error actualizando ${foto.id}:`, error.message)
      noMatch++
    } else {
      ok++
    }
  }

  console.log(`\n✅ Actualizadas: ${ok}`)
  console.log(`⚠️  Sin match: ${noMatch}`)
  if (unmatched.length) {
    console.log('Direcciones sin match:', [...new Set(unmatched)])
  }

  // Verificar estado final
  const { count: totalThumb } = await db.from('fotos').select('*', { count: 'exact', head: true }).eq('campana_id', campanaId).ilike('url', '%thumbnail%')
  const { count: totalFotos } = await db.from('fotos').select('*', { count: 'exact', head: true }).eq('campana_id', campanaId)
  console.log(`\nEstado final campaña Georgalos: ${totalThumb}/${totalFotos} fotos con URL thumbnail`)
}

run().catch(err => { console.error(err); process.exit(1) })
