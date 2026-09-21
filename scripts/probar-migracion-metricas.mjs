/**
 * probar-migracion-metricas.mjs — DRY RUN, no deja nada escrito.
 *
 * Aplica 20260921200000_metricas_catalogo.sql dentro de una transacción,
 * corre las comprobaciones, y hace ROLLBACK siempre. Sirve para que un error
 * de sintaxis o un constraint mal escrito aparezca acá y no en el SQL Editor.
 *
 *   node scripts/probar-migracion-metricas.mjs --ref <project-ref>
 */
import { readFileSync } from 'node:fs'
import { salirCon, resolverConexion, cargarClient } from './lib/conexion.mjs'

const { config, refEsperado, descripcion } = resolverConexion(process.argv)
const Client = await cargarClient()
const client = new Client(config)

const RUTA = 'supabase/migrations/20260921200000_metricas_catalogo.sql'
// El archivo trae su propio BEGIN/COMMIT. Para poder revertir, se sacan: la
// transacción la abre y la cierra este script.
const sql = readFileSync(RUTA, 'utf8')
  .replace(/^BEGIN;$/m, '')
  .replace(/^COMMIT;$/m, '')

try {
  await client.connect()
} catch (e) {
  salirCon(`No se pudo conectar a "${refEsperado}": ${e.message}`)
}
console.log(`\n══ DRY RUN sobre ${descripcion} ══`)
console.log('   Todo lo que sigue se revierte al final.\n')

client.on('notice', (n) => console.log(`   ${n.severity}: ${n.message}`))

let fallo = null
try {
  await client.query('BEGIN')
  await client.query(sql)

  const q = async (label, texto) => {
    const { rows } = await client.query(texto)
    console.log(`\n▸ ${label}`)
    for (const r of rows) console.log('   ', JSON.stringify(r))
    return rows
  }

  await q('Las métricas sembradas',
    `SELECT slug, tipo_respuesta, fuentes, orden FROM metricas ORDER BY orden`)

  await q('La columna nueva',
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'bloque_campos' AND column_name = 'metrica_id'`)

  await q('Preguntas existentes, por tipo (candidatas a tipificar)',
    `SELECT tipo, count(*) FROM bloque_campos GROUP BY tipo ORDER BY count(*) DESC`)

  // ── Las tres reglas que hay que ver fallar, no solo pasar ──────────────────
  const especiales = [
    ['El trigger rechaza tipo que no coincide',
     `UPDATE bloque_campos SET metrica_id = (SELECT id FROM metricas WHERE slug = 'precio')
        WHERE id = (SELECT id FROM bloque_campos WHERE tipo = 'binaria' LIMIT 1)`,
     true],
    ['El trigger acepta tipo que sí coincide',
     `UPDATE bloque_campos SET metrica_id = (SELECT id FROM metricas WHERE slug = 'presencia')
        WHERE id = (SELECT id FROM bloque_campos WHERE tipo = 'binaria' LIMIT 1)`,
     false],
    ['fuentes rechaza un valor desconocido',
     `INSERT INTO metricas (slug, nombre, tipo_respuesta, fuentes)
        VALUES ('x', 'X', 'numero', ARRAY['inventada'])`,
     true],
    ['fuentes rechaza el array vacío',
     `INSERT INTO metricas (slug, nombre, tipo_respuesta, fuentes)
        VALUES ('y', 'Y', 'numero', ARRAY[]::text[])`,
     true],
    ['tipo_respuesta rechaza foto',
     `INSERT INTO metricas (slug, nombre, tipo_respuesta) VALUES ('z', 'Z', 'foto')`,
     true],
    ['el slug no se puede repetir',
     `INSERT INTO metricas (slug, nombre, tipo_respuesta) VALUES ('precio', 'Otro', 'numero')`,
     true],
  ]

  console.log('\n▸ Las reglas, probadas contra la base')
  for (const [label, texto, debeFallar] of especiales) {
    await client.query('SAVEPOINT s')
    try {
      await client.query(texto)
      await client.query('RELEASE SAVEPOINT s')
      console.log(`   ${debeFallar ? '✗ PASÓ Y NO DEBÍA' : '✓'}  ${label}`)
      if (debeFallar) fallo = label
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT s')
      const msg = e.message.split('\n')[0]
      console.log(`   ${debeFallar ? '✓' : '✗ FALLÓ Y NO DEBÍA'}  ${label}`)
      console.log(`       → ${msg}`)
      if (!debeFallar) fallo = label
    }
  }
} catch (e) {
  console.error(`\n✗ La migración no corrió: ${e.message}`)
  fallo = 'la migración'
} finally {
  await client.query('ROLLBACK').catch(() => {})
  await client.end()
}

console.log(fallo ? `\n✗ Revisar: ${fallo}\n` : '\n✓ Todo como se esperaba. Nada quedó escrito.\n')
process.exit(fallo ? 1 : 0)
