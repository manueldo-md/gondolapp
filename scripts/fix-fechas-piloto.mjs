/**
 * fix-fechas-piloto.mjs
 * Actualiza created_at de misiones y fotos del piloto Georgalos
 * para reflejar las fechas reales del relevamiento (11-14 marzo 2026).
 */

import { createClient } from '@supabase/supabase-js'
import { resolverEntorno } from './lib/entorno.mjs'

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

// ── Fecha base del relevamiento, por gondolero ───────────────────────────────
// Antes esto mapeaba gondolero_id hardcodeados. Los ids los genera Supabase al
// crear cada cuenta, así que son distintos en cada ambiente: en dev el script
// no mapeaba ninguna misión y, sin la guarda, habría reportado 0 en silencio.
// Es el mismo problema que ya tuvimos con el id de la campaña y con los
// localidad_id.
//
// La clave ahora es el email, que sí es estable entre ambientes: el seed crea
// siempre las mismas cuentas <nombre>@demo.gondolapp.com. El id se resuelve en
// runtime contra auth.users.
const FECHA_POR_EMAIL = {
  'agustin@demo.gondolapp.com':   '2026-03-11',
  'alejandro@demo.gondolapp.com': '2026-03-11',
  'martin@demo.gondolapp.com':    '2026-03-11',
  'gonzalo@demo.gondolapp.com':   '2026-03-12',
  'guillermo@demo.gondolapp.com': '2026-03-12',
  'raul@demo.gondolapp.com':      '2026-03-12',
  'jose@demo.gondolapp.com':      '2026-03-13',
  'juan@demo.gondolapp.com':      '2026-03-13',
  'marisol@demo.gondolapp.com':   '2026-03-14',
}

// gondolero_id → fecha, se llena en runtime resolviendo los emails de arriba
const FECHA_POR_GONDOLERO = {}

async function resolverGondoleros() {
  const encontrados = new Map()
  let page = 1
  while (true) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) { console.error('❌ No se pudieron listar los usuarios:', error.message); process.exit(1) }
    if (!data?.users?.length) break
    for (const u of data.users) {
      const email = u.email?.toLowerCase()
      if (email && FECHA_POR_EMAIL[email]) encontrados.set(email, u.id)
    }
    if (data.users.length < 1000) break
    page++
  }

  for (const [email, fecha] of Object.entries(FECHA_POR_EMAIL)) {
    const id = encontrados.get(email)
    if (!id) { console.log(`  ⚠️  Sin cuenta para ${email} — sus misiones se omiten`); continue }
    FECHA_POR_GONDOLERO[id] = fecha
  }
  console.log(`Gondoleros resueltos: ${Object.keys(FECHA_POR_GONDOLERO).length} de ${Object.keys(FECHA_POR_EMAIL).length}`)
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
  await resolverGondoleros()

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

  // Cortar en vez de reportar 0 en silencio. Esta guarda ya sirvió una vez:
  // detectó en dev que los gondolero_id estaban hardcodeados, que es lo que
  // motivó resolverlos por email.
  if (misionTimestamps.size === 0) {
    console.error('\n✗ Ninguna misión quedó mapeada a una fecha.')
    console.error(`  La campaña tiene ${misiones?.length ?? 0} misiones, pero ninguna pertenece`)
    console.error('  a los gondoleros de FECHA_POR_EMAIL. Revisá que el seed haya creado las')
    console.error('  cuentas <nombre>@demo.gondolapp.com en este ambiente.\n')
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
