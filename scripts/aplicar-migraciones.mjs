#!/usr/bin/env node
// =============================================================================
// aplicar-migraciones.mjs — aplica supabase/migrations/*.sql en orden
// =============================================================================
// Para qué existe: verificar que el set completo de migraciones reproduce el
// schema de producción sobre una base vacía. No reemplaza a `supabase db push`
// para el flujo normal; es una herramienta de verificación.
//
// Requiere el paquete `pg`, que NO está en package.json a propósito:
//   npm install --no-save pg
//
// Uso:
//   export PGURL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
//   node scripts/aplicar-migraciones.mjs --ref <project-ref>
//
// El --ref es obligatorio y se valida contra PGURL. Es la red de seguridad
// contra correr esto sobre producción por accidente: si el ref no aparece en
// la connection string, el script no hace nada.
//
// Cada archivo se envía en una sola llamada, así que corre dentro de una
// transacción implícita: si un archivo falla, se revierte entero y no deja la
// base a mitad de camino. Se corta en el primer error.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { salirCon, resolverConexion, cargarClient } from './lib/conexion.mjs'

const DIR_MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

// ── Conexión y guardas ───────────────────────────────────────────────────────
const { config, refEsperado, descripcion, verificaSsl } = resolverConexion(process.argv)
const Client = await cargarClient()

// ── Archivos, en orden lexicográfico ─────────────────────────────────────────
const archivos = readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()
if (archivos.length === 0) salirCon(`No hay archivos .sql en ${DIR_MIGRACIONES}`)

// ── Contexto del error: ubicar la sentencia que falló ────────────────────────
// Postgres devuelve `position` como offset en caracteres sobre el string
// enviado. Con eso se puede señalar la línea exacta dentro del archivo.
function contextoDelError(sql, position) {
  if (!position) return null
  const offset = Number(position) - 1
  if (!Number.isFinite(offset) || offset < 0 || offset > sql.length) return null

  const lineas = sql.slice(0, offset).split('\n')
  const nroLinea = lineas.length
  const columna = lineas[lineas.length - 1].length + 1
  const todas = sql.split('\n')
  const desde = Math.max(0, nroLinea - 4)
  const hasta = Math.min(todas.length, nroLinea + 3)

  const extracto = []
  for (let i = desde; i < hasta; i++) {
    const marca = i === nroLinea - 1 ? '>' : ' '
    extracto.push(`  ${marca} ${String(i + 1).padStart(4)} | ${todas[i]}`)
    if (i === nroLinea - 1) extracto.push(`         ${' '.repeat(String(columna).length)}${' '.repeat(columna)}^`)
  }
  return { nroLinea, columna, extracto: extracto.join('\n') }
}

// ── Corrida ──────────────────────────────────────────────────────────────────
const client = new Client(config)

await client.connect()

const { rows: [info] } = await client.query('SELECT current_database() AS db, version() AS v')
console.log(`\nConexión:  ${descripcion}`)
console.log(`Base:      ${info.db}`)
console.log(`Servidor:  ${info.v.split(',')[0]}`)
console.log(`Proyecto:  ${refEsperado}`)
if (!verificaSsl) console.log('SSL:       sin verificación de cadena (definí PGSSLROOTCERT para verificarla)')
console.log(`Archivos:  ${archivos.length}\n`)

let aplicados = 0
const arranque = Date.now()

for (const archivo of archivos) {
  const sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8')
  const t0 = Date.now()
  try {
    await client.query(sql)
    aplicados++
    console.log(`  ✓ ${String(aplicados).padStart(2)}/${archivos.length}  ${archivo}  (${Date.now() - t0}ms)`)
  } catch (error) {
    console.error(`\n✗ FALLÓ en ${archivo}\n`)
    console.error(`  ${error.code ?? 'sin código'}: ${error.message}`)
    if (error.detail) console.error(`  detalle: ${error.detail}`)
    if (error.hint) console.error(`  hint: ${error.hint}`)
    if (error.where) console.error(`  contexto: ${error.where}`)

    const ctx = contextoDelError(sql, error.position)
    if (ctx) {
      console.error(`\n  Línea ${ctx.nroLinea}, columna ${ctx.columna} de ${archivo}:\n`)
      console.error(ctx.extracto)
    } else {
      console.error('\n  Postgres no reportó posición. Suele pasar con errores de constraint')
      console.error('  o de dependencias, no de sintaxis — revisar el mensaje de arriba.')
    }

    console.error(`\n  El archivo se revirtió entero (transacción implícita).`)
    console.error(`  Aplicados sin problema antes de este: ${aplicados}/${archivos.length}\n`)
    await client.end()
    process.exit(1)
  }
}

await client.end()
console.log(`\n✓ ${aplicados}/${archivos.length} migraciones aplicadas en ${((Date.now() - arranque) / 1000).toFixed(1)}s\n`)
console.log('Siguiente paso: node scripts/comparar-schema.mjs --ref ' + refEsperado + '\n')
