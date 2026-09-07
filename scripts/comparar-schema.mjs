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

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DUMP_REAL = join(RAIZ, 'docs', 'schema-real-2026-09.md')

function salirCon(mensaje) {
  console.error(`\n✗ ${mensaje}\n`)
  process.exit(1)
}

// ── Validación de entrada (misma guarda que aplicar-migraciones.mjs) ─────────
const pgurl = process.env.PGURL
if (!pgurl) salirCon("Falta PGURL.\n  export PGURL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'")

const indiceRef = process.argv.indexOf('--ref')
const refEsperado = indiceRef !== -1 ? process.argv[indiceRef + 1] : null
if (!refEsperado) salirCon('Falta --ref <project-ref>.')
if (!pgurl.includes(refEsperado)) {
  salirCon(`PGURL no apunta al proyecto "${refEsperado}". Verificá contra cuál base estás corriendo esto.`)
}

const indiceOut = process.argv.indexOf('--out')
const dirSalida = indiceOut !== -1 ? process.argv[indiceOut + 1] : join(tmpdir(), 'gondolapp-schema-diff')
mkdirSync(dirSalida, { recursive: true })

let Client
try {
  ;({ Client } = await import('pg'))
} catch {
  salirCon('Falta el paquete `pg`:\n  npm install --no-save pg')
}

// ── Las secciones tabulares del dump ─────────────────────────────────────────
const SECCIONES = [
  {
    n: 1,
    titulo: '1. Tablas y columnas',
    columnas: ['table_name', 'column_name', 'data_type', 'is_nullable', 'column_default'],
    sql: `SELECT table_name, column_name, data_type, is_nullable, column_default
          FROM information_schema.columns WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position`,
  },
  {
    n: 2,
    titulo: '2. Constraints',
    columnas: ['tabla', 'conname', 'definicion'],
    sql: `SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
          FROM pg_constraint WHERE connamespace = 'public'::regnamespace
          ORDER BY conrelid::regclass::text, conname`,
  },
  {
    n: 3,
    titulo: '3. Políticas RLS',
    columnas: ['tablename', 'policyname', 'cmd', 'roles', 'qual', 'with_check'],
    sql: `SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
          FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`,
  },
  {
    n: 4,
    titulo: '4. Índices',
    columnas: ['tablename', 'indexname', 'indexdef'],
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
const celda = (v) => (v === null || v === undefined ? 'null' : String(v))
const normalizar = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const claveFila = (cols) => cols.map(normalizar).join(' | ')
const esTruncada = (linea) => linea.includes(' ... ')

// ── Parseo de las tablas markdown del dump ───────────────────────────────────
function tablasDelDump(texto, tituloSeccion) {
  const lineas = texto.split('\n')
  const inicio = lineas.findIndex((l) => l.trim() === `## ${tituloSeccion}`)
  if (inicio === -1) return null
  const filas = []
  for (let i = inicio + 1; i < lineas.length; i++) {
    const l = lineas[i].trim()
    if (l.startsWith('## ')) break
    if (!l.startsWith('|')) continue
    if (/^\|[\s|:-]+\|$/.test(l)) continue // separador
    const cols = l.slice(1, -1).split('|').map((c) => c.trim())
    if (cols.length < 2) continue
    filas.push({ cols, linea: l })
  }
  return filas
}

// ── Corrida ──────────────────────────────────────────────────────────────────
const client = new Client({
  connectionString: pgurl,
  ssl: process.env.PGSSLROOTCERT
    ? { ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8') }
    : { rejectUnauthorized: false },
})
await client.connect()
console.log(`\nProyecto: ${refEsperado}`)

const dumpReal = readFileSync(DUMP_REAL, 'utf8')
const fecha = new Date().toISOString().slice(0, 10)
const salidaMd = [
  `# Schema extraído de ${refEsperado} — ${fecha}`,
  '',
  '> Generado por `scripts/comparar-schema.mjs`. Mismo formato que',
  '> `docs/schema-real-2026-09.md` para poder diffear los dos documentos.',
  '',
]

let totalFaltan = 0
let totalSobran = 0
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

  // comparación contra el dump
  const filasReales = tablasDelDump(dumpReal, seccion.titulo)
  if (!filasReales) {
    console.log(`\n[${seccion.n}] ${seccion.titulo}: no se encontró la sección en el dump, se omite la comparación`)
    continue
  }
  const datos = filasReales.filter((f) => f.cols[0] !== seccion.columnas[0]) // saca el encabezado
  const truncadas = datos.filter((f) => esTruncada(f.linea))
  const comparables = datos.filter((f) => !esTruncada(f.linea))

  const tsvReal = comparables.map((f) => f.cols.map(normalizar).join('\t')).sort()
  writeFileSync(join(dirSalida, `schema-real-${seccion.n}.tsv`), tsvReal.join('\n') + '\n', 'utf8')

  const setReal = new Set(tsvReal)
  const setNuevo = new Set(tsvNuevo)
  const faltan = tsvReal.filter((k) => !setNuevo.has(k))   // están en producción, no en la base nueva
  const sobran = tsvNuevo.filter((k) => !setReal.has(k))   // están en la base nueva, no en producción

  totalFaltan += faltan.length
  totalSobran += sobran.length
  totalNoComparables += truncadas.length

  console.log(`\n[${seccion.n}] ${seccion.titulo}`)
  console.log(`    dump: ${datos.length} filas (${truncadas.length} truncadas, no comparables)`)
  console.log(`    base nueva: ${filasNuevas.length} filas`)
  console.log(`    faltan en la base nueva: ${faltan.length}`)
  console.log(`    sobran en la base nueva: ${sobran.length}`)
  for (const f of faltan.slice(0, 15)) console.log(`      - ${f.replace(/\t/g, ' | ')}`)
  if (faltan.length > 15) console.log(`      ... y ${faltan.length - 15} más`)
  for (const f of sobran.slice(0, 15)) console.log(`      + ${f.replace(/\t/g, ' | ')}`)
  if (sobran.length > 15) console.log(`      ... y ${sobran.length - 15} más`)
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
console.log(`\n${'─'.repeat(70)}`)
console.log(`Faltan en la base nueva: ${totalFaltan}   Sobran: ${totalSobran}   No comparables: ${totalNoComparables}`)
console.log(`\nDocumento: ${rutaSalida}`)
console.log(`TSVs:      ${dirSalida}`)
console.log(`\nPara ver una sección en detalle:`)
console.log(`  diff "${join(dirSalida, 'schema-real-1.tsv')}" "${join(dirSalida, 'schema-nuevo-1.tsv')}"`)
console.log(
  totalFaltan === 0 && totalSobran === 0
    ? '\n✓ Las secciones comparables coinciden. Revisar igual las funciones y las filas no comparables.\n'
    : '\n✗ Hay diferencias. Cada una es algo que las migraciones no reproducen, o ruido de formato del dump.\n'
)
