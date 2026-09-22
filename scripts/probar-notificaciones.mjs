/**
 * probar-notificaciones.mjs — compara la unión de TypeScript contra el CHECK de
 * la base VIVA, en las dos direcciones.
 *
 * ESTE ARCHIVO EXISTE PORQUE ESA DERIVA NO SE NOTA.
 *
 * Un insert de notificación no puede hacer fallar la acción que lo dispara —si
 * aprobar una foto reventara porque el aviso no entró, sería peor el remedio—
 * así que su fallo es silencioso POR DISEÑO. Eso convierte cualquier desajuste
 * entre `TipoNotificacion` y `notificaciones_tipo_check` en un aviso que no
 * llega y que nadie reclama.
 *
 * No es hipotético: hasta el 24/9/2026 el CHECK rechazaba CUATRO tipos que el
 * código escribía. `vinculacion_invitacion` era uno, y **ningún gondolero ni
 * fixer recibió jamás el aviso de que lo habían invitado** — cero filas de ese
 * tipo en la base, con vínculos aprobados existiendo. Se descubrió de casualidad
 * relevando otra cosa.
 *
 * Compara también `actor_tipo`, que fue la otra mitad del mismo bug: aceptaba
 * cuatro actores y el código escribía 'fixer'.
 *
 *   node scripts/probar-notificaciones.mjs            (dev)
 *   node scripts/probar-notificaciones.mjs <ref>      (otro proyecto)
 */
import pg from 'pg'
import fs from 'fs'

const ref = process.argv[2] ?? null
let url = null
for (const a of fs.readdirSync('.').filter(f => /^\.env.*\.local$/.test(f))) {
  const t = fs.readFileSync(a, 'utf8')
  if (ref && !t.includes(ref)) continue
  if (!ref && a !== '.env.dev.local') continue
  const m = t.match(/^PGURL=(.+)$/m)
  if (m) { url = m[1].trim().replace(/^["']|["']$/g, ''); break }
}
if (!url) { console.error('No se encontró PGURL' + (ref ? ` para ${ref}` : ' en .env.dev.local')); process.exit(1) }

let fallos = 0
const mal = (msg) => { fallos++; console.log(`   ✗  ${msg}`) }
const ok  = (msg) => console.log(`   ✓  ${msg}`)

// ── 1. La unión de TypeScript ────────────────────────────────────────────────
// Se lee del archivo y no se importa: el .ts no corre desde un .mjs, y copiar la
// lista acá sería crear una TERCERA copia de lo mismo, que es justo el problema.
const fuente = fs.readFileSync('lib/notificaciones.ts', 'utf8')
const bloque = fuente.match(/export type TipoNotificacion\s*=([\s\S]*?)\ninterface /)
if (!bloque) { console.error('No se pudo leer TipoNotificacion de lib/notificaciones.ts'); process.exit(1) }
const enTS = new Set([...bloque[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]))

// ── 2. Los CHECK de la base ──────────────────────────────────────────────────
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
const leerCheck = async (nombre) => {
  const { rows } = await c.query(
    `SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'notificaciones' AND con.conname = $1`, [nombre])
  if (!rows[0]) return null
  return new Set([...rows[0].def.matchAll(/'([a-z_]+)'::text/g)].map(m => m[1]))
}
const enDB      = await leerCheck('notificaciones_tipo_check')
const actoresDB = await leerCheck('notificaciones_actor_tipo_check')
await c.end()

if (!enDB || !actoresDB) { console.error('No se encontraron los CHECK de notificaciones'); process.exit(1) }

console.log(`\n▸ tipo — ${enTS.size} en TypeScript, ${enDB.size} en la base`)

// Las dos direcciones. Mirar una sola es como mirar un lado del DROP.
const soloTS = [...enTS].filter(t => !enDB.has(t))
const soloDB = [...enDB].filter(t => !enTS.has(t))

if (soloTS.length) {
  mal(`el código puede escribir tipos que la base RECHAZA: ${soloTS.join(', ')}`)
  console.log('       → el aviso rebota y nadie se entera. Ampliar notificaciones_tipo_check.')
} else {
  ok('todo lo que TypeScript permite escribir, la base lo acepta')
}

if (soloDB.length) {
  // Esta dirección no rompe nada, pero es deuda: un tipo que la base acepta y
  // el código no conoce es uno que nadie puede emitir.
  console.log(`   ·  la base acepta ${soloDB.length} tipo(s) que la unión no declara: ${soloDB.join(', ')}`)
} else {
  ok('y la base no acepta ninguno que el código no conozca')
}

console.log('\n▸ Los cuatro que estuvieron rotos hasta el 24/9/2026')
for (const t of ['vinculacion_invitacion', 'vinculacion_invitacion_enviada',
                 'vinculacion_nueva', 'desvinculacion_repositora']) {
  if (enTS.has(t) && enDB.has(t)) ok(`${t} — en los dos lados`)
  else mal(`${t} — TS:${enTS.has(t)} base:${enDB.has(t)}`)
}
if (enTS.has('postulacion_fixer') && enDB.has('postulacion_fixer')) ok('postulacion_fixer — en los dos lados')
else mal(`postulacion_fixer — TS:${enTS.has('postulacion_fixer')} base:${enDB.has('postulacion_fixer')}`)

console.log('\n▸ actor_tipo')
// La otra mitad del mismo bug: el tipo era válido y el actor no.
for (const a of ['gondolero', 'fixer', 'marca', 'distribuidora', 'repositora', 'admin']) {
  if (actoresDB.has(a)) ok(`la base acepta actor_tipo='${a}'`)
  else mal(`la base NO acepta actor_tipo='${a}'`)
}

console.log('\n▸ Nadie escribe notificaciones fuera del helper')
// El helper es el único que chequea el error. Un insert suelto vuelve a la
// falla silenciosa, así que esto cuenta cuántos quedan y no deja que crezcan.
const sueltos = []
for (const dir of ['app', 'lib']) {
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`
      if (e.isDirectory()) { stack.push(p); continue }
      if (!/\.tsx?$/.test(e.name)) continue
      if (p === 'lib/notificaciones.ts') continue
      const t = fs.readFileSync(p, 'utf8')
      // El mismo criterio que `grep "from('notificaciones')" | grep insert`:
      // la llamada puede venir partida en varias líneas con cualquier sangría.
      const n = (t.match(/from\('notificaciones'\)[\s\S]{0,40}?\.insert\(/g) ?? []).length
      if (n) sueltos.push({ p, n })
    }
  }
}
// Se cuentan los INSERTS, no los archivos. Un archivo con cuatro adentro cuenta
// cuatro: si contara uno, agregar tres más al mismo archivo pasaría el tope sin
// moverlo, que es exactamente la forma de burlar un trinquete sin darse cuenta.
const totalSueltos = sueltos.reduce((a, s) => a + s.n, 0)
// 16 al 24/9/2026: los 9 que rebotaban ya pasaron por el helper; los que quedan
// escriben tipos válidos, así que hoy no fallan — pero si fallaran, nadie lo
// sabría. Bajar este número es deuda anotada, no de este tramo.
const TOPE = 16
if (totalSueltos > TOPE) {
  mal(`hay ${totalSueltos} inserts sueltos de notificación (tope: ${TOPE}) — no agregar más`)
  for (const s of sueltos) console.log(`       ${s.p} (${s.n})`)
} else {
  ok(`${totalSueltos} inserts sueltos en ${sueltos.length} archivos, ninguno nuevo (tope: ${TOPE})`)
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
