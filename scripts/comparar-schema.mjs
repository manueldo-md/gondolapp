#!/usr/bin/env node
// =============================================================================
// comparar-schema.mjs — extrae el schema de una base y lo compara con el dump
// =============================================================================
// Corre las mismas queries que generaron docs/schema-real-2026-09.md contra el
// proyecto indicado, escribe el resultado en el mismo formato para poder
// diffear, y además informa un resumen de diferencias por sección.
//
// Requiere `pg`:  npm install --no-save pg
//
// Uso:
//   export PGURL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
//   node scripts/comparar-schema.mjs --ref <project-ref>
//
// Salidas:
//   docs/schema-nuevo-<fecha>.md        — mismo formato que el dump, para diff
//   <tmp>/schema-{real,nuevo}-N.tsv     — por sección, para diff mecánico
//
// NOTA sobre la query de funciones: la sección "Cómo se generó" del dump
// declara una lista fija de 6 funciones, pero el documento muestra varias que
// no están en esa lista. Acá se traen TODAS las funciones del esquema public,
// que es lo que hace falta para una comparación real.
//
// NOTA sobre filas no comparables: algunas filas del dump fueron truncadas a
// mano al escribir el documento (contienen " ... "). Esas no se pueden comparar
// textualmente y se informan aparte, no como diferencias.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { resolverConexion, cargarClient } from './lib/conexion.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DUMP_REAL = join(RAIZ, 'docs', 'schema-real-2026-09.md')

// ── Conexión y guardas (compartidas con aplicar-migraciones.mjs) ─────────────
const { config, refEsperado, descripcion } = resolverConexion(process.argv)

const indiceOut = process.argv.indexOf('--out')
const dirSalida = indiceOut !== -1 ? process.argv[indiceOut + 1] : join(tmpdir(), 'gondolapp-schema-diff')
mkdirSync(dirSalida, { recursive: true })

const Client = await cargarClient()

// ── Las secciones tabulares del dump ─────────────────────────────────────────
const SECCIONES = [
  {
    n: 1,
    titulo: '1. Tablas y columnas',
    columnas: ['table_name', 'column_name', 'data_type', 'is_nullable', 'column_default'],
    clave: 2,
    sql: `SELECT table_name, column_name, data_type, is_nullable, column_default
          FROM information_schema.columns WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position`,
  },
  {
    n: 2,
    titulo: '2. Constraints',
    columnas: ['tabla', 'conname', 'definicion'],
    clave: 2,
    sql: `SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
          FROM pg_constraint WHERE connamespace = 'public'::regnamespace
          ORDER BY conrelid::regclass::text, conname`,
  },
  {
    n: 3,
    titulo: '3. Políticas RLS',
    columnas: ['tablename', 'policyname', 'cmd', 'roles', 'qual', 'with_check'],
    clave: 2,
    sql: `SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
          FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`,
  },
  {
    n: 4,
    titulo: '4. Índices',
    columnas: ['tablename', 'indexname', 'indexdef'],
    clave: 2,
    sql: `SELECT tablename, indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' ORDER BY tablename, indexname`,
  },
]

const SQL_FUNCIONES = `SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
  ORDER BY p.proname`

const SQL_TRIGGERS = `SELECT event_object_table, trigger_name, action_timing, event_manipulation
  FROM information_schema.triggers WHERE trigger_schema = 'public'
  ORDER BY event_object_table, trigger_name`

// ── Normalización para comparar ──────────────────────────────────────────────
// Postgres devuelve los `qual` de las policies con saltos de línea internos.
// Volcarlos crudos parte la fila markdown en varias líneas y corrompe tanto el
// documento como la comparación: en la primera corrida, 20 de 89 policies
// quedaron mal por esto. Se colapsan a un espacio, y se escapan los '|' para
// que no inventen columnas.
const celda = (v) =>
  v === null || v === undefined ? 'null' : String(v).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()

// Comparar el texto crudo produce falsos positivos: el dump fue transcrito a
// mano en partes y no coincide carácter por carácter con lo que emite
// Postgres. Se normaliza lo que es puramente de forma:
//   - negrita markdown y backticks del documento
//   - casts explícitos: 'admin' y 'admin'::text son el mismo valor
//   - espaciado dentro de paréntesis y alrededor de comas
const normalizar = (s) =>
  String(s)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/::[a-z][a-z0-9_ ]*(\[\])?/g, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()

// Dos filas que solo difieren en paréntesis son ruido de transcripción del
// dump, no una diferencia de schema.
const soloParentesis = (a, b) => a !== b && a.replace(/[()]/g, '') === b.replace(/[()]/g, '')

const esTruncada = (linea) => linea.includes(' ... ')

// ── Parseo de las tablas markdown ────────────────────────────────────────────
// Reensambla filas partidas en varias líneas. Hace falta para leer documentos
// generados antes del fix de `celda()`, y para tolerar cualquier edición manual
// que meta un salto de línea dentro de una celda.
const ENCABEZADOS = new Set(['table_name', 'tabla', 'tablename'])

function tablasDelDump(texto, tituloSeccion, ncols) {
  const lineas = texto.split('\n')
  const inicio = lineas.findIndex((l) => l.trim() === `## ${tituloSeccion}`)
  if (inicio === -1) return null

  const filas = []
  let buffer = null
  const cerrar = () => {
    if (buffer === null) return
    const t = buffer.trim()
    if (t.endsWith('|')) {
      const cols = t.slice(1, -1).split('|').map((c) => c.trim())
      if (cols.length === ncols && !ENCABEZADOS.has(cols[0])) filas.push({ cols, linea: t })
    }
    buffer = null
  }
  const completa = () => {
    const t = buffer.trim()
    return t.endsWith('|') && t.slice(1, -1).split('|').length === ncols
  }

  for (let i = inicio + 1; i < lineas.length; i++) {
    const l = lineas[i].trim()
    if (l.startsWith('## ')) break
    if (/^\|[\s|:-]+\|$/.test(l)) { cerrar(); continue } // separador
    if (l.startsWith('|')) {
      cerrar()
      buffer = l
      if (completa()) cerrar()
    } else if (buffer !== null) {
      buffer += ' ' + l
      if (completa()) cerrar()
    }
  }
  cerrar()
  return filas
}

// ── Corrida ──────────────────────────────────────────────────────────────────
const client = new Client(config)
await client.connect()
console.log(`\nConexión: ${descripcion}`)
console.log(`Proyecto: ${refEsperado}`)

const dumpReal = readFileSync(DUMP_REAL, 'utf8')
const fecha = new Date().toISOString().slice(0, 10)
const salidaMd = [
  `# Schema extraído de ${refEsperado} — ${fecha}`,
  '',
  '> Generado por `scripts/comparar-schema.mjs`. Mismo formato que',
  '> `docs/schema-real-2026-09.md` para poder diffear los dos documentos.',
  '',
]

// Clasificación pedida:
//   A — existe en producción y no en las migraciones → se hizo a mano, falta versionarla
//   B — existe en las migraciones y no en producción → la migración nunca se aplicó
//   C — existe en las dos pero distinto → divergencia real, hay que decidir
const grupoA = []
const grupoB = []
const grupoC = []
let totalNoComparables = 0

for (const seccion of SECCIONES) {
  const { rows } = await client.query(seccion.sql)
  const filasNuevas = rows.map((r) => seccion.columnas.map((c) => celda(r[c])))

  // markdown, mismo formato que el dump
  salidaMd.push(`## ${seccion.titulo}`, '')
  salidaMd.push(`| ${seccion.columnas.join(' | ')} |`)
  salidaMd.push(`| ${seccion.columnas.map(() => '---').join(' | ')} |`)
  for (const f of filasNuevas) salidaMd.push(`| ${f.join(' | ')} |`)
  salidaMd.push('')

  // tsv para diff mecánico
  const tsvNuevo = filasNuevas.map((f) => f.map(normalizar).join('\t')).sort()
  writeFileSync(join(dirSalida, `schema-nuevo-${seccion.n}.tsv`), tsvNuevo.join('\n') + '\n', 'utf8')

  const filasReales = tablasDelDump(dumpReal, seccion.titulo, seccion.columnas.length)
  if (!filasReales) {
    console.log(`\n[${seccion.n}] ${seccion.titulo}: no se encontró la sección en el dump, se omite la comparación`)
    continue
  }
  writeFileSync(
    join(dirSalida, `schema-real-${seccion.n}.tsv`),
    filasReales.map((f) => f.cols.map(normalizar).join('\t')).sort().join('\n') + '\n',
    'utf8'
  )

  // Se compara por clave (las primeras `clave` columnas identifican el objeto),
  // no por fila completa. Así una diferencia de detalle sale como C y no como
  // un par A+B espurio.
  const claveDe = (cols) => cols.slice(0, seccion.clave).map(normalizar).join('::')
  const porClaveReal = new Map(filasReales.map((f) => [claveDe(f.cols), f]))
  const porClaveNueva = new Map(filasNuevas.map((c) => [claveDe(c), c]))

  let noComparables = 0
  for (const [k, f] of porClaveReal) {
    const g = porClaveNueva.get(k)
    if (!g) { grupoA.push({ sec: seccion.n, k, detalle: f.cols.join(' | ') }); continue }
    // Una fila truncada a mano en el dump existe, pero su texto no sirve para comparar.
    if (esTruncada(f.linea)) { noComparables++; continue }
    const a = f.cols.map(normalizar).join('\t')
    const b = g.map(normalizar).join('\t')
    if (a === b) continue
    if (soloParentesis(a, b)) { noComparables++; continue }
    grupoC.push({ sec: seccion.n, k, prod: f.cols.slice(seccion.clave).join(' | '), dev: g.slice(seccion.clave).join(' | ') })
  }
  for (const [k, c] of porClaveNueva) {
    if (!porClaveReal.has(k)) grupoB.push({ sec: seccion.n, k, detalle: c.join(' | ') })
  }
  totalNoComparables += noComparables

  console.log(`\n[${seccion.n}] ${seccion.titulo}`)
  console.log(`    producción: ${filasReales.length}   base nueva: ${filasNuevas.length}   no comparables: ${noComparables}`)
}

const NOMBRE_SEC = { 1: 'columna', 2: 'constraint', 3: 'policy', 4: 'índice' }
for (const [etiqueta, grupo, glosa] of [
  ['A', grupoA, 'en PRODUCCIÓN y no en las migraciones → se hizo a mano, falta escribir la migración'],
  ['B', grupoB, 'en las MIGRACIONES y no en producción → la migración nunca se aplicó'],
]) {
  console.log(`\n${'═'.repeat(70)}\nGRUPO ${etiqueta} (${grupo.length}) — ${glosa}\n`)
  for (const x of grupo) console.log(`  [${NOMBRE_SEC[x.sec]}] ${x.detalle}`)
}
console.log(`\n${'═'.repeat(70)}\nGRUPO C (${grupoC.length}) — distinto en ambos → divergencia real, decidir cuál queda\n`)
for (const x of grupoC) {
  console.log(`  [${NOMBRE_SEC[x.sec]}] ${x.k}`)
  console.log(`        prod: ${x.prod}`)
  console.log(`        dev : ${x.dev}`)
}

// ── Funciones y triggers: se vuelcan para diff manual ────────────────────────
const { rows: funciones } = await client.query(SQL_FUNCIONES)
salidaMd.push('## 5. Funciones y triggers', '', '### Funciones', '')
for (const f of funciones) salidaMd.push('```sql', f.definicion.trim(), '```', '')

const { rows: triggers } = await client.query(SQL_TRIGGERS)
salidaMd.push('### Triggers', '')
salidaMd.push('| event_object_table | trigger_name | action_timing | event_manipulation |')
salidaMd.push('| --- | --- | --- | --- |')
for (const t of triggers) {
  salidaMd.push(`| ${t.event_object_table} | ${t.trigger_name} | ${t.action_timing} | ${t.event_manipulation} |`)
}
salidaMd.push('')

console.log(`\n[5] Funciones y triggers`)
console.log(`    ${funciones.length} funciones y ${triggers.length} triggers volcados al .md`)
console.log(`    El cuerpo de las funciones no se compara automáticamente: diffear el .md a mano.`)

const rutaSalida = join(RAIZ, 'docs', `schema-nuevo-${fecha}.md`)
writeFileSync(rutaSalida, salidaMd.join('\n'), 'utf8')
await client.end()

// ── Resumen ──────────────────────────────────────────────────────────────────
const totalReales = grupoA.length + grupoB.length + grupoC.length
console.log(`\n${'─'.repeat(70)}`)
console.log(`A=${grupoA.length}  B=${grupoB.length}  C=${grupoC.length}   →  ${totalReales} diferencias reales`)
console.log(`No comparables (truncadas en el dump o solo distintas en paréntesis): ${totalNoComparables}`)
console.log(`\nDocumento: ${rutaSalida}`)
console.log(`TSVs:      ${dirSalida}`)
console.log(`\nPara ver una sección en detalle:`)
console.log(`  diff "${join(dirSalida, 'schema-real-1.tsv')}" "${join(dirSalida, 'schema-nuevo-1.tsv')}"`)
console.log(
  totalReales === 0
    ? '\n✓ Las secciones comparables coinciden. Revisar igual las funciones y las filas no comparables.\n'
    : '\n✗ Hay diferencias. Ver la clasificación de arriba antes de tocar nada.\n'
)
