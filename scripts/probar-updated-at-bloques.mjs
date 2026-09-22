/**
 * probar-updated-at-bloques.mjs — DRY RUN, no deja nada escrito.
 *
 * Aplica 20260922200000 dentro de una transacción, comprueba que
 * `campanas.updated_at` se mueve ante cada cambio en un bloque o un campo, y
 * hace ROLLBACK siempre.
 *
 *   node scripts/probar-updated-at-bloques.mjs --ref <project-ref>
 *
 * POR QUÉ EL CENTINELA Y NO "creció"
 * `now()` es la hora de INICIO de la transacción y no avanza adentro, así que
 * dos operaciones seguidas dejan el MISMO timestamp. La primera versión de esta
 * prueba comparaba `updated_at > anterior` y daba tres falsos negativos. Se
 * planta un valor viejo antes de cada paso —con el trigger de `campanas`
 * desactivado, que si no lo pisa— y se mira si el trigger lo reemplazó.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const i = process.argv.indexOf('--ref')
const ref = i !== -1 ? process.argv[i + 1] : 'mqeymmprvpclpyjpujvf'
const cred = credencialesDeRef(ref)
if (!cred) { console.error('✗ sin credenciales para ' + ref); process.exit(1) }

const sql = readFileSync('supabase/migrations/20260922200000_campanas_updated_at_desde_bloques.sql', 'utf8')
  .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')

const c = new Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()
c.on('notice', n => { if (!/does not exist, skipping/.test(n.message)) console.log(`   ${n.severity}: ${n.message}`) })

let fallos = 0
const chequear = (ok, etq, extra = '') => { if (!ok) fallos++; console.log(`   ${ok ? '✓' : '✗'}  ${etq}${extra ? ' — ' + extra : ''}`) }

const CENTINELA = '2000-01-01T00:00:00Z'
async function plantarCentinela(id) {
  await c.query('ALTER TABLE campanas DISABLE TRIGGER set_updated_at_campanas')
  await c.query('UPDATE campanas SET updated_at = $2 WHERE id = $1', [id, CENTINELA])
  await c.query('ALTER TABLE campanas ENABLE TRIGGER set_updated_at_campanas')
}
async function seMovio(id) {
  const { rows: [r] } = await c.query(
    'SELECT updated_at > $2::timestamptz AS movio FROM campanas WHERE id = $1', [id, CENTINELA])
  return r.movio
}

console.log(`\n══ DRY RUN sobre ${nombreDeRef(ref)} (${ref}) ══`)
console.log('   Todo lo que sigue se revierte al final.\n')

try {
  await c.query('BEGIN')
  await c.query(sql)

  const { rows: [ca] } = await c.query(`
    SELECT ca.id, ca.nombre, bf.id AS bloque_id
      FROM campanas ca JOIN bloques_foto bf ON bf.campana_id = ca.id LIMIT 1`)
  console.log(`▸ Campaña de prueba: ${ca.nombre}\n`)

  await plantarCentinela(ca.id)
  const { rows: [campo] } = await c.query(
    `INSERT INTO bloque_campos (bloque_id, tipo, pregunta, orden) VALUES ($1,'texto','dry run',99) RETURNING id`, [ca.bloque_id])
  chequear(await seMovio(ca.id), 'INSERT de un campo mueve campanas.updated_at')

  await plantarCentinela(ca.id)
  await c.query(`UPDATE bloque_campos SET pregunta = 'dry run 2' WHERE id = $1`, [campo.id])
  chequear(await seMovio(ca.id), 'UPDATE de un campo mueve campanas.updated_at')

  await plantarCentinela(ca.id)
  await c.query('DELETE FROM bloque_campos WHERE id = $1', [campo.id])
  chequear(await seMovio(ca.id), 'DELETE de un campo mueve campanas.updated_at')

  await plantarCentinela(ca.id)
  const { rows: [bl] } = await c.query(
    `INSERT INTO bloques_foto (campana_id, orden, instruccion) VALUES ($1, 98, 'dry run') RETURNING id`, [ca.id])
  chequear(await seMovio(ca.id), 'INSERT de un bloque mueve campanas.updated_at')

  await c.query(`INSERT INTO bloque_campos (bloque_id, tipo, pregunta, orden) VALUES ($1,'texto','hijo',1)`, [bl.id])
  await plantarCentinela(ca.id)
  await c.query('SAVEPOINT s')
  try {
    await c.query('DELETE FROM bloques_foto WHERE id = $1', [bl.id])
    await c.query('RELEASE SAVEPOINT s')
    chequear(await seMovio(ca.id), 'DELETE de un bloque, con cascade a sus campos, mueve updated_at y no explota')
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT s')
    chequear(false, 'DELETE de un bloque con cascade', e.message.split('\n')[0])
  }

  // CONTROL — si esto fallara, el trigger estaría tocando campañas de más.
  const { rows: [otra] } = await c.query('SELECT id, updated_at FROM campanas WHERE id <> $1 LIMIT 1', [ca.id])
  const { rows: [o2] } = await c.query('SELECT updated_at FROM campanas WHERE id = $1', [otra.id])
  chequear(String(o2.updated_at) === String(otra.updated_at), 'CONTROL — otra campaña no se movió')

  // CONTROL — que el trigger que QUEDÓ en campanas siga funcionando: si se
  // hubiera borrado el equivocado, esto falla.
  await plantarCentinela(ca.id)
  await c.query('UPDATE campanas SET nombre = nombre WHERE id = $1', [ca.id])
  chequear(await seMovio(ca.id), 'CONTROL — un UPDATE directo de campanas sigue moviendo updated_at')
} catch (e) {
  console.error('\n   ✗ la migración no corrió:', e.message.split('\n')[0]); fallos++
} finally {
  await c.query('ROLLBACK').catch(() => {})
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba. Nada quedó escrito.\n')
process.exitCode = fallos ? 1 : 0
