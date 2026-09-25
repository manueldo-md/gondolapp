/**
 * probar-migracion-avisos-vuelta.mjs — dry-run de 20261004100000.
 *
 *   node scripts/probar-migracion-avisos-vuelta.mjs --ref <project-ref>
 *
 * Aplica la migración DENTRO de una transacción y termina con ROLLBACK.
 *
 * Prueba, en orden:
 *   1. Que corra sobre los datos de hoy.
 *   2. Que los dos tipos nuevos ENTREN de verdad — no que estén en el texto
 *      del constraint, sino que un insert con ellos no reboten.
 *   3. Que TODOS los tipos viejos sigan entrando. Es lo que esta migración
 *      puede romper: recrear un CHECK de lista es reescribirla entera.
 *   4. Que un tipo inventado siga rebotando (el CHECK no quedó abierto).
 *   5. Que sea idempotente.
 *   6. Que la precondición muerda si el parseo del constraint falla.
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
if (i === -1 || !process.argv[i + 1]) { console.error('\n✗ Falta --ref <project-ref>\n'); process.exit(1) }
const ref = process.argv[i + 1]
const { vars } = credencialesDeRef(ref)

const RUTA = join(AQUI, '..', 'supabase', 'migrations', '20261004100000_avisos_de_vuelta_del_gondolero.sql')
let sql = readFileSync(RUTA, 'utf8')

const antes = sql
sql = sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')
if (sql === antes || /\bCOMMIT;/.test(sql)) {
  console.error('\n✗ No se pudo sacar el BEGIN/COMMIT. Abortado para no escribir sobre la base.\n')
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
async function falla(q) { try { await pg.query(q); return null } catch (e) { return e.code ?? e.message } }

console.log(`\n▸ Dry-run sobre ${nombreDeRef(ref)}`)
await pg.query('BEGIN')

try {
  const { rows: g } = await pg.query(
    `SELECT id FROM profiles WHERE tipo_actor = 'gondolero' LIMIT 1`)
  const { rows: d } = await pg.query('SELECT id FROM distribuidoras LIMIT 1')
  if (!g.length || !d.length) {
    console.log('   ⊘  NO VERIFICABLE: hace falta un gondolero y una distribuidora')
    await pg.query('ROLLBACK'); await pg.end(); process.exit(0)
  }

  const { rows: antesN } = await pg.query('SELECT count(*) n FROM notificaciones')
  const { rows: viejosRows } = await pg.query(
    `SELECT DISTINCT tipo FROM notificaciones WHERE tipo IS NOT NULL ORDER BY 1`)
  const tiposConDatos = viejosRows.map(r => r.tipo)

  console.log('\n▸ 1. La migración corre sobre los datos de hoy')
  await pg.query(sql)
  caso('aplicó sin excepción', true, true)

  const ins = tipo => `
    INSERT INTO notificaciones (actor_id, actor_tipo, tipo, titulo)
    VALUES ('${d[0].id}', 'distribuidora', '${tipo}', 'dry-run')`

  console.log('\n▸ 2. Los dos tipos nuevos ENTRAN (no que estén en el texto: que entren)')
  await pg.query('SAVEPOINT s1')
  caso('vinculacion_rechazada', await falla(ins('vinculacion_rechazada')), null)
  caso('desvinculacion_gondolero', await falla(ins('desvinculacion_gondolero')), null)

  console.log('\n▸ 3. Y TODOS los tipos que ya tienen filas siguen entrando')
  await pg.query('ROLLBACK TO SAVEPOINT s1')
  let rotos = 0
  for (const t of tiposConDatos) {
    await pg.query('SAVEPOINT sx')
    const e = await falla(ins(t))
    if (e) { rotos++; console.log(`       ✗ ${t} dejó de entrar (${e})`) }
    await pg.query('ROLLBACK TO SAVEPOINT sx')
  }
  caso(`ninguno de los ${tiposConDatos.length} tipos con datos se perdió`, rotos, 0)

  console.log('\n▸ 4. Y el CHECK NO quedó abierto')
  await pg.query('SAVEPOINT s2')
  caso('un tipo inventado sigue rebotando con 23514', await falla(ins('tipo_que_no_existe')), '23514')
  await pg.query('ROLLBACK TO SAVEPOINT s2')

  console.log('\n▸ 5. Idempotente')
  caso('correrla de nuevo no falla', await falla(sql), null)
  const { rows: def2 } = await pg.query(
    `SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'notificaciones_tipo_check'`)
  const veces = (def2[0].d.match(/vinculacion_rechazada/g) ?? []).length
  caso('y no duplica el valor', veces, 1)

  console.log('\n▸ 6. La precondición muerde si el CHECK no está')
  await pg.query('SAVEPOINT s3')
  await pg.query('ALTER TABLE notificaciones DROP CONSTRAINT notificaciones_tipo_check')
  caso('sin el constraint, la migración se niega', (await falla(sql)) !== null, true)
  await pg.query('ROLLBACK TO SAVEPOINT s3')

  console.log('\n▸ 7. La otra dirección: no se tocó ninguna fila')
  const { rows: desp } = await pg.query('SELECT count(*) n FROM notificaciones')
  caso('mismo conteo de notificaciones', desp[0].n, antesN[0].n)
} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e.message}`)
} finally {
  await pg.query('ROLLBACK')
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal — NO aplicar\n` : '\n✓ Dry-run limpio (ROLLBACK hecho).\n')
process.exit(fallos ? 1 : 0)
