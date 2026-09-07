/**
 * fix-fechas-piloto.mjs
 * Actualiza created_at de misiones y fotos del piloto Georgalos
 * para reflejar las fechas reales del relevamiento (11-14 marzo 2026).
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { resolverCampanaId } from './lib/campana.mjs'

// El id se resuelve por nombre en run(): el seed recrea la campaña con id nuevo
let CAMPANA_ID = null

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// gondolero_id → fecha base del relevamiento
const FECHA_POR_GONDOLERO = {
  '206b3176-ff50-42c1-83f2-68fade16d221': '2026-03-11', // Agustín
  'e7b4a6ae-f0c0-4e8a-9d4b-1b2d59c9ecf1': '2026-03-11', // Alejandro
  '05ef9fa6-7f05-469e-b965-6694d5caaf39': '2026-03-11', // Martín
  '4a22d255-b2f8-43e4-a248-0a536490c882': '2026-03-12', // Gonzalo
  'f6de6101-bf73-4839-bc2b-8c4b62465d2d': '2026-03-12', // Guillermo
  '9aa2e6f3-6c15-46bb-89a8-33a66a4327d9': '2026-03-12', // Raúl
  'cd6dbbcc-0c1c-4d98-a02c-2cf240a9deeb': '2026-03-13', // José
  'd7ec9c81-64a2-423f-8ba7-737fe8530b70': '2026-03-13', // Juan
  'f9c376da-840c-42a3-bead-0820e2ce2673': '2026-03-14', // Marisol
}

// Horario de campo: entre 8:30 y 18:00, distribuir misiones en orden
function timestampParaMision(fechaBase, indice, total) {
  // Rango: 8h30 a 17h30 = 540 minutos de ventana
  const inicioMin = 8 * 60 + 30
  const finMin    = 17 * 60 + 30
  const offsetMin = total <= 1 ? inicioMin : inicioMin + Math.round((indice / (total - 1)) * (finMin - inicioMin))
  const hh = String(Math.floor(offsetMin / 60)).padStart(2, '0')
  const mm = String(offsetMin % 60).padStart(2, '0')
  return `${fechaBase}T${hh}:${mm}:00+00:00`
}

async function run() {
  CAMPANA_ID = await resolverCampanaId(db)

  // 1. Traer todas las misiones de la campaña
  const { data: misiones, error: mErr } = await db
    .from('misiones')
    .select('id, gondolero_id, created_at')
    .eq('campana_id', CAMPANA_ID)
    .order('created_at')

  if (mErr) { console.error('Error:', mErr.message); return }
  console.log(`Misiones totales en campaña: ${misiones?.length}`)

  // 2. Agrupar por gondolero para asignar timestamps escalonados
  const porGondolero = new Map()
  for (const m of misiones ?? []) {
    if (!porGondolero.has(m.gondolero_id)) porGondolero.set(m.gondolero_id, [])
    porGondolero.get(m.gondolero_id).push(m)
  }

  // 3. Construir mapa misionId → nuevo timestamp
  const misionTimestamps = new Map()
  for (const [gid, misions] of porGondolero.entries()) {
    const fecha = FECHA_POR_GONDOLERO[gid]
    if (!fecha) {
      console.log(`  ⚠️  Sin fecha para gondolero ${gid} — ${misions.length} misiones omitidas`)
      continue
    }
    misions.forEach((m, i) => {
      misionTimestamps.set(m.id, timestampParaMision(fecha, i, misions.length))
    })
  }

  console.log(`\nMisiones a actualizar: ${misionTimestamps.size}`)

  // Los gondolero_id de FECHA_POR_GONDOLERO también están hardcodeados. Hoy
  // siguen siendo válidos porque auth.users sobrevivió al DROP SCHEMA, pero si
  // alguna vez se recrean las cuentas, este script volvería a "andar" sin hacer
  // nada. Cortar acá en vez de reportar 0 en silencio.
  if (misionTimestamps.size === 0) {
    console.error('\n✗ Ninguna misión quedó mapeada a una fecha.')
    console.error(`  La campaña tiene ${misiones?.length ?? 0} misiones, pero ningún gondolero_id`)
    console.error('  coincide con los de FECHA_POR_GONDOLERO. Si se recrearon las cuentas,')
    console.error('  hay que actualizar ese mapa con los ids nuevos.\n')
    process.exit(1)
  }

  // 4. Actualizar misiones de a una (para respetar el timestamp individual)
  let okM = 0, errM = 0
  for (const [misionId, ts] of misionTimestamps.entries()) {
    const { error } = await db.from('misiones').update({ created_at: ts }).eq('id', misionId)
    if (error) { console.error(`  ✗ mision ${misionId}:`, error.message); errM++ }
    else okM++
  }
  console.log(`✓ Misiones actualizadas: ${okM} | ✗ Errores: ${errM}`)

  // 5. Traer fotos de la campaña con su mision_id
  const { data: fotos, error: fErr } = await db
    .from('fotos')
    .select('id, mision_id, gondolero_id')
    .eq('campana_id', CAMPANA_ID)

  if (fErr) { console.error('Error fotos:', fErr.message); return }
  console.log(`\nFotos totales en campaña: ${fotos?.length}`)

  // 6. Actualizar fotos usando el timestamp de su misión (+5 min para simular captura post-llegada)
  let okF = 0, errF = 0, sinMision = 0
  for (const foto of fotos ?? []) {
    const misionTs = misionTimestamps.get(foto.mision_id ?? '')
    if (!misionTs) { sinMision++; continue }

    // Foto tomada ~5-15 min después de llegar al comercio
    const base = new Date(misionTs)
    base.setMinutes(base.getMinutes() + 7)
    const fotoTs = base.toISOString()

    const { error } = await db.from('fotos').update({
      created_at: fotoTs,
      timestamp_dispositivo: fotoTs,
    }).eq('id', foto.id)
    if (error) { console.error(`  ✗ foto ${foto.id}:`, error.message); errF++ }
    else okF++
  }
  console.log(`✓ Fotos actualizadas: ${okF} | ✗ Errores: ${errF} | Sin misión: ${sinMision}`)

  // 7. Resumen por fecha
  console.log('\nDistribución por fecha:')
  const conteoFecha = {}
  for (const [, ts] of misionTimestamps.entries()) {
    const fecha = ts.slice(0, 10)
    conteoFecha[fecha] = (conteoFecha[fecha] ?? 0) + 1
  }
  Object.entries(conteoFecha).sort().forEach(([f, n]) => console.log(`  ${f}: ${n} misiones`))
}

run().catch(err => { console.error(err); process.exit(1) })
