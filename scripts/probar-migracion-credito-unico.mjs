/**
 * probar-migracion-credito-unico.mjs — dry-run de 20261003100000.
 *
 *   node scripts/probar-migracion-credito-unico.mjs --ref <project-ref>
 *
 * Aplica la migración DENTRO de una transacción y termina con ROLLBACK.
 * No deja nada escrito.
 *
 * Prueba, en orden:
 *   1. Que la migración corra sobre los datos de HOY.
 *   2. Que el índice efectivamente IMPIDA el segundo crédito de la misma foto.
 *   3. Que SÍ deje pasar un débito sobre esa misma foto (por eso `tipo` está
 *      en la clave) y los créditos de otras fotos.
 *   4. Que las filas sin `foto_id` no se estorben entre sí — son la mayoría.
 *   5. Que la PRECONDICIÓN muerda: se mete un duplicado a propósito y se
 *      espera la excepción. Una precondición que nadie ejercitó puede estar
 *      mal escrita sin que se note.
 *   6. Que sea idempotente.
 *
 * El `BEGIN;`/`COMMIT;` del archivo se saca antes de ejecutarlo, y **se aborta
 * si no se puede**: ese COMMIT cerraría la transacción del dry-run y escribiría
 * sobre la base de verdad. Un reemplazo que no matchea sería un borrado
 * silencioso con daño real.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const AQUI = dirname(fileURLToPath(import.meta.url))

const i = process.argv.indexOf('--ref')
if (i === -1 || !process.argv[i + 1]) {
  console.error('\n✗ Falta --ref <project-ref>\n'); process.exit(1)
}
const ref = process.argv[i + 1]
const { vars } = credencialesDeRef(ref)

const RUTA = join(AQUI, '..', 'supabase', 'migrations', '20261003100000_credito_unico_por_foto.sql')
let sql = readFileSync(RUTA, 'utf8')

// Sacar el BEGIN/COMMIT del archivo. Si no matchean, abortar: ver el encabezado.
const antes = sql
sql = sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')
if (sql === antes || /\bCOMMIT;/.test(sql)) {
  console.error('\n✗ No se pudo sacar el BEGIN/COMMIT del archivo. Abortado para no escribir sobre la base.\n')
  process.exit(1)
}

const pg = new Client({ connectionString: vars.PGURL })
await pg.connect()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
async function falla(sqlText) {
  try { await pg.query(sqlText); return null } catch (e) { return e.code ?? e.message }
}

console.log(`\n▸ Dry-run sobre ${nombreDeRef(ref)}`)
await pg.query('BEGIN')

try {
  // ── Fotos y gondoleros reales, para no inventar FKs ──────────────────────
  const { rows: base } = await pg.query(
    `SELECT f.id foto_id, f.gondolero_id, f.campana_id
       FROM fotos f WHERE f.gondolero_id IS NOT NULL LIMIT 2`)
  if (base.length < 2) {
    console.log('   ⊘  NO VERIFICABLE: hacen falta 2 fotos con gondolero en esta base')
    await pg.query('ROLLBACK'); await pg.end(); process.exit(0)
  }
  const [A, B] = base

  const { rows: antesN } = await pg.query('SELECT count(*) n FROM movimientos_puntos')

  console.log('\n▸ 1. La migración corre sobre los datos de hoy')
  await pg.query(sql)
  caso('aplicó sin excepción', true, true)

  const { rows: idx } = await pg.query(`
    SELECT indexdef FROM pg_indexes
     WHERE indexname = 'movimientos_puntos_credito_unico_por_foto'`)
  caso('el índice existe', idx.length, 1)
  caso('es UNIQUE', /UNIQUE/i.test(idx[0]?.indexdef ?? ''), true)
  caso('es parcial (WHERE foto_id IS NOT NULL)', /WHERE \(foto_id IS NOT NULL\)/i.test(idx[0]?.indexdef ?? ''), true)
  caso('la clave lleva tipo', /tipo/.test(idx[0]?.indexdef ?? ''), true)

  console.log('\n▸ 2. El segundo crédito de la MISMA foto no entra')
  const ins = (foto, tipo, monto = 10) => `
    INSERT INTO movimientos_puntos (gondolero_id, tipo, monto, concepto, campana_id, foto_id)
    VALUES ('${foto.gondolero_id}', '${tipo}', ${monto}, 'dry-run', ${foto.campana_id ? `'${foto.campana_id}'` : 'NULL'}, '${foto.foto_id}')`

  await pg.query('SAVEPOINT s1')
  caso('el PRIMER crédito entra', await falla(ins(A, 'credito')), null)
  caso('el SEGUNDO lo rebota con 23505', await falla(ins(A, 'credito')), '23505')

  console.log('\n▸ 3. Lo que SÍ tiene que seguir entrando')
  // La excepción aborta la transacción: hay que volver al savepoint.
  await pg.query('ROLLBACK TO SAVEPOINT s1')
  await pg.query(ins(A, 'credito'))
  caso('un DÉBITO sobre la misma foto entra (por eso `tipo` está en la clave)',
    await falla(ins(A, 'debito')), null)
  await pg.query('ROLLBACK TO SAVEPOINT s1')
  await pg.query(ins(A, 'credito'))
  caso('un crédito de OTRA foto entra', await falla(ins(B, 'credito')), null)

  console.log('\n▸ 4. Las filas sin foto_id no se estorban (son la mayoría)')
  await pg.query('ROLLBACK TO SAVEPOINT s1')
  const sinFoto = `
    INSERT INTO movimientos_puntos (gondolero_id, tipo, monto, concepto)
    VALUES ('${A.gondolero_id}', 'credito', 10, 'dry-run sin foto')`
  caso('la primera sin foto_id entra', await falla(sinFoto), null)
  caso('y la segunda también', await falla(sinFoto), null)

  console.log('\n▸ 5. La PRECONDICIÓN muerde con un duplicado preexistente')
  await pg.query('ROLLBACK TO SAVEPOINT s1')
  await pg.query('SAVEPOINT s2')
  await pg.query(`DROP INDEX IF EXISTS movimientos_puntos_credito_unico_por_foto`)
  await pg.query(ins(A, 'credito'))
  await pg.query(ins(A, 'credito'))   // sin índice, el duplicado entra
  const err = await falla(sql)
  caso('la migración se niega a crear el índice', err !== null, true)
  await pg.query('ROLLBACK TO SAVEPOINT s2')

  console.log('\n▸ 6. Idempotente')
  caso('correrla de nuevo no falla', await falla(sql), null)

  console.log('\n▸ 7. La otra dirección: no se tocó ninguna fila preexistente')
  await pg.query('ROLLBACK TO SAVEPOINT s1')
  const { rows: despues } = await pg.query('SELECT count(*) n FROM movimientos_puntos')
  caso('mismo conteo de movimientos', despues[0].n, antesN[0].n)
} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e.message}`)
} finally {
  await pg.query('ROLLBACK')
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal — NO aplicar\n` : '\n✓ Dry-run limpio (ROLLBACK hecho, nada quedó escrito).\n')
process.exit(fallos ? 1 : 0)
