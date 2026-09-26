/**
 * probar-migracion-comercio-rechazado.mjs — dry-run de 20261007100000.
 *
 *   node scripts/probar-migracion-comercio-rechazado.mjs --ref <project-ref>
 *
 * Aplica la migración DENTRO de una transacción y termina con ROLLBACK.
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. QUE NO SE MUEVA UN PESO. Se comparan `movimientos_puntos` y
 *      `profiles.puntos_disponibles` fila por fila, antes y después. Es lo
 *      único que esta migración no puede deshacer.
 *
 *   2. QUE EL BOUNTY PAGADO SIGA DICIENDO 'acreditado'. Si la migración
 *      arrastrara el `anulado` del camino normal, la fila diría que nunca se
 *      pagó y la plata quedaría sin respaldo en la base.
 *
 *   3. QUE NO TOQUE NADA MÁS. Las misiones de comercios NO rechazados tienen
 *      que quedar exactamente como estaban — la consulta es un JOIN y un JOIN
 *      mal escrito se lleva puesto lo que no era suyo.
 *
 *   4. QUE SIRVA EN UNA BASE LIMPIA. En dev no hay ni un comercio rechazado,
 *      así que un "quedó en cero" ahí no prueba nada: el caso 6 arma el
 *      escenario completo —pagar y después rechazar— para tener qué arreglar.
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

const RUTA = join(AQUI, '..', 'supabase', 'migrations',
  '20261007100000_cerrar_misiones_de_comercio_rechazado.sql')

function sqlDeLaMigracion() {
  const crudo = readFileSync(RUTA, 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(`No se pudieron sacar el BEGIN/COMMIT (${sacados} encontrados). Se aborta.`)
  }
  return sql
}
const SQL = sqlDeLaMigracion()

const pg = new Client({ connectionString: vars.PGURL, ssl: { rejectUnauthorized: false } })
await pg.connect()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
const uno = async (q, a = []) => (await pg.query(q, a)).rows[0]
const todas = async (q, a = []) => (await pg.query(q, a)).rows
async function falla(q) { try { await pg.query(q); return null } catch (e) { return e.message } }

const CONTABILIDAD = `
  SELECT gondolero_id, tipo, monto, concepto FROM movimientos_puntos
   ORDER BY gondolero_id, created_at, monto`
const SALDOS = `SELECT id, puntos_disponibles FROM profiles ORDER BY id`
const MISIONES = `SELECT id, estado, bounty_estado FROM misiones ORDER BY id`
const abiertasDeRechazado = async () => (await uno(`
  SELECT count(*)::int n FROM misiones m JOIN comercios co ON co.id = m.comercio_id
   WHERE co.estado = 'rechazado' AND m.estado IS DISTINCT FROM 'descartada'`)).n

console.log(`\n▸ Dry-run sobre ${nombreDeRef(ref)}`)

try {
  await pg.query('BEGIN')

  const movAntes    = await todas(CONTABILIDAD)
  const saldosAntes = await todas(SALDOS)
  const misAntes    = await todas(MISIONES)
  const abiertas    = await abiertasDeRechazado()
  const acreditadasDeRechazadoAntes = (await uno(`
    SELECT count(*)::int n FROM misiones m JOIN comercios co ON co.id = m.comercio_id
     WHERE co.estado = 'rechazado' AND m.bounty_estado = 'acreditado'`)).n

  console.log(`\n▸ Estado de partida: ${abiertas} misión(es) abierta(s) de comercio rechazado`)
  console.log(`   ${movAntes.length} movimientos de puntos · ${misAntes.length} misiones`)

  console.log('\n▸ 1. La migración corre sobre los datos de hoy')
  caso('aplicó sin excepción', await falla(SQL), null)

  console.log('\n▸ 2. NO SE MOVIÓ UN PESO')
  caso(`los ${movAntes.length} movimientos son idénticos`,
    JSON.stringify(await todas(CONTABILIDAD)), JSON.stringify(movAntes))
  caso('y los saldos de todos los perfiles también',
    JSON.stringify(await todas(SALDOS)), JSON.stringify(saldosAntes))

  console.log('\n▸ 3. Las misiones de comercios rechazados quedaron cerradas')
  caso('ninguna abierta', await abiertasDeRechazado(), 0)
  // El número se toma ANTES y se compara DESPUÉS: si la migración arrastrara
  // el `anulado` del camino normal, bajaría. Comparar contra sí mismo —que es
  // lo que hacía la primera versión de este control— no prueba nada.
  caso('y el bounty que estaba pagado SIGUE diciendo acreditado', (await uno(`
    SELECT count(*)::int n FROM misiones m JOIN comercios co ON co.id = m.comercio_id
     WHERE co.estado = 'rechazado' AND m.bounty_estado = 'acreditado'`)).n,
    acreditadasDeRechazadoAntes)

  console.log('\n▸ 4. Y NO tocó ninguna misión que no fuera suya')
  const idsTocables = new Set((await todas(`
    SELECT m.id FROM misiones m JOIN comercios co ON co.id = m.comercio_id
     WHERE co.estado = 'rechazado'`)).map(r => r.id))
  const misDesp = await todas(MISIONES)
  const intrusas = misDesp.filter((m, k) =>
    !idsTocables.has(m.id) && JSON.stringify(m) !== JSON.stringify(misAntes[k]))
  caso('cero misiones ajenas modificadas', intrusas.length, 0)

  console.log('\n▸ 5. Idempotente, y el comentario quedó')
  caso('correrla de nuevo no falla', await falla(SQL), null)
  caso('el COMMENT está puesto', (await uno(`
    SELECT col_description('public.misiones'::regclass, a.attnum) IS NOT NULL c
      FROM pg_attribute a
     WHERE a.attrelid = 'public.misiones'::regclass AND a.attname = 'bounty_estado'`)).c, true)

  await pg.query('ROLLBACK')

  // ═══ Parte 2: el escenario completo, armado a propósito ══════════════════
  // En dev no hay ni un comercio rechazado, así que arriba no se probó nada.
  // Acá se reproduce el caso de prod entero: una misión pagada cuyo comercio
  // se rechaza después.
  console.log('\n▸ 6. Con el caso armado a mano: se cierra y la plata queda')
  await pg.query('BEGIN')
  const base = await uno(`
    SELECT m.id, m.comercio_id, m.gondolero_id, m.campana_id
      FROM misiones m
      JOIN comercios co ON co.id = m.comercio_id
     WHERE m.estado = 'aprobada' AND m.bounty_estado = 'acreditado'
       AND co.estado IS DISTINCT FROM 'rechazado'
     LIMIT 1`)

  if (!base) {
    console.log('   ⊘  NO VERIFICABLE: no hay ninguna misión aprobada y acreditada')
  } else {
    const movPrevio = await todas(CONTABILIDAD)
    await pg.query(`UPDATE comercios SET estado = 'rechazado' WHERE id = $1`, [base.comercio_id])
    caso('CONTROL — antes de la migración la misión está ABIERTA',
      await abiertasDeRechazado() >= 1, true)

    caso('la migración aplica', await falla(SQL), null)

    const fin = await uno(`SELECT estado, bounty_estado FROM misiones WHERE id = $1`, [base.id])
    caso('la misión quedó descartada', fin.estado, 'descartada')
    caso('Y EL BOUNTY SIGUE ACREDITADO — no se le quitó la plata',
      fin.bounty_estado, 'acreditado')
    caso('la contabilidad no se movió',
      JSON.stringify(await todas(CONTABILIDAD)), JSON.stringify(movPrevio))
    caso('no quedan abiertas', await abiertasDeRechazado(), 0)
  }
  await pg.query('ROLLBACK')

  console.log('\n▸ 7. Y la base quedó exactamente como estaba')
  caso('misiones idénticas', JSON.stringify(await todas(MISIONES)), JSON.stringify(misAntes))
  caso('movimientos idénticos', JSON.stringify(await todas(CONTABILIDAD)), JSON.stringify(movAntes))
  caso('saldos idénticos', JSON.stringify(await todas(SALDOS)), JSON.stringify(saldosAntes))

} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e.message}`)
  try { await pg.query('ROLLBACK') } catch { /* la transacción ya estaba cerrada */ }
} finally {
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal — NO aplicar\n` : '\n✓ Dry-run limpio (ROLLBACK hecho). Nada quedó escrito.\n')
process.exit(fallos ? 1 : 0)
