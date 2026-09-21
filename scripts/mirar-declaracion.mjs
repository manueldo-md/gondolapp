/**
 * mirar-declaracion.mjs — SOLO LECTURA
 * Qué hay realmente en fotos.declaracion, por campaña.
 *
 *   node scripts/mirar-declaracion.mjs --ref <project-ref>
 */
import { createClient } from '@supabase/supabase-js'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const ref = process.argv[process.argv.indexOf('--ref') + 1]
const cred = credencialesDeRef(ref)
if (!cred) { console.error('sin credenciales para ' + ref); process.exit(1) }
const db = createClient(cred.vars.NEXT_PUBLIC_SUPABASE_URL, cred.vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

console.log(`\n══ ${nombreDeRef(ref)} (${ref}) ══`)

const { data: fotos, error } = await db
  .from('fotos')
  .select('id, campana_id, comercio_id, mision_id, bloque_id, declaracion, created_at')
if (error) { console.error(error); process.exit(1) }

const { data: campanas } = await db.from('campanas').select('id, nombre, marca_id, modalidad')
const nombreCampana = new Map((campanas ?? []).map(c => [c.id, c.nombre]))

console.log(`fotos totales: ${fotos.length}`)
const porDecl = {}
for (const f of fotos) porDecl[f.declaracion ?? 'NULL'] = (porDecl[f.declaracion ?? 'NULL'] ?? 0) + 1
console.log('por declaracion:', porDecl)

const porCampana = new Map()
for (const f of fotos) {
  const k = f.campana_id
  if (!porCampana.has(k)) porCampana.set(k, { total: 0, decl: {}, conMision: 0, sinMision: 0, comercios: new Set() })
  const e = porCampana.get(k)
  e.total++
  e.decl[f.declaracion ?? 'NULL'] = (e.decl[f.declaracion ?? 'NULL'] ?? 0) + 1
  if (f.declaracion) {
    if (f.mision_id) e.conMision++; else e.sinMision++
    e.comercios.add(f.comercio_id)
  }
}
for (const [id, e] of porCampana) {
  const conDecl = e.total - (e.decl['NULL'] ?? 0)
  if (conDecl === 0) continue
  console.log(`\n  ${nombreCampana.get(id) ?? id}`)
  console.log(`    fotos ${e.total} · con declaracion ${conDecl} · comercios distintos ${e.comercios.size}`)
  console.log(`    ${JSON.stringify(e.decl)}`)
  console.log(`    con mision_id ${e.conMision} · SIN mision_id ${e.sinMision}`)
}

const huerfanas = fotos.filter(f => f.declaracion && !f.mision_id)
console.log(`\n  fotos con declaracion y SIN mision_id: ${huerfanas.length}`)

// ¿Cuántas fotos por misión? Presencia se cuenta por comercio/visita, no por foto.
const porMision = new Map()
for (const f of fotos) {
  if (!f.mision_id || !f.declaracion) continue
  if (!porMision.has(f.mision_id)) porMision.set(f.mision_id, new Set())
  porMision.get(f.mision_id).add(f.declaracion)
}
const multi = [...porMision.entries()].filter(([, s]) => s.size > 1)
console.log(`  misiones con declaracion: ${porMision.size} · con declaraciones CONTRADICTORIAS entre sus fotos: ${multi.length}`)
