/**
 * verificar-drop-columnas.mjs — SOLO LECTURA
 *
 * Dice, sin ambigüedad, si el DROP de 20260922100000 está aplicado en una base.
 *
 *   node scripts/verificar-drop-columnas.mjs --ref <project-ref>
 *   node scripts/verificar-drop-columnas.mjs            (las dos bases)
 *
 * POR QUÉ EXISTE
 * El 22/9/2026 el DROP se dio por corrido en dev y prod y no estaba aplicado en
 * ninguna de las dos. El bloque de verificación de la migración emitía un
 * WARNING si quedaban columnas y, dos líneas después, un `RAISE NOTICE '[drop]
 * OK'` **sin condición**: el OK salía igual. En el SQL Editor el WARNING se
 * pierde entre el ruido y lo que se lee es el OK.
 *
 * La migración ya está arreglada —ahora usa RAISE EXCEPTION— pero eso sigue
 * dependiendo de leer bien la salida de una UI. Esto no: sale con código 0 o 1
 * y lo dice en una línea.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const i = process.argv.indexOf('--ref')
const refs = i !== -1 ? [process.argv[i + 1]] : ['mqeymmprvpclpyjpujvf', 'xzznzustgsacmfwsupux']

/** Las que tienen que haberse ido. */
const DROPEADAS = [
  ['bloques_foto', 'tipo_contenido'],
  ['bloques_foto', 'solicitar_precio'],
  ['bloque_campos', 'solicitar_precio'],
]

/** Las que tienen que SEGUIR. Verificar solo una dirección deja pasar un DROP de más. */
const INTACTAS = [
  ['fotos', 'precio_confirmado'],
  ['fotos', 'precio_detectado'],
  ['bloque_campos', 'metrica_id'],
]

let fallos = 0

for (const ref of refs) {
  const cred = credencialesDeRef(ref)
  if (!cred) { console.error(`\n✗ sin credenciales para ${ref}`); fallos++; continue }

  const c = new Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
  await c.connect()

  const { rows } = await c.query(`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'`)
  const hay = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))

  const { rows: ck } = await c.query(`
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'bloques_foto'::regclass
       AND conname = 'bloques_foto_tipo_contenido_check'`)

  console.log(`\n══ ${nombreDeRef(ref)} (${ref}) ══`)

  let malEnEsta = 0
  for (const [t, col] of DROPEADAS) {
    const sigue = hay.has(`${t}.${col}`)
    if (sigue) malEnEsta++
    console.log(`  ${sigue ? '✗ SIGUE  ' : '✓ dropeada'}  ${t}.${col}`)
  }
  if (ck.length) { malEnEsta++; console.log('  ✗ SIGUE    bloques_foto_tipo_contenido_check') }
  else console.log('  ✓ dropeada  bloques_foto_tipo_contenido_check')

  for (const [t, col] of INTACTAS) {
    const sigue = hay.has(`${t}.${col}`)
    if (!sigue) malEnEsta++
    console.log(`  ${sigue ? '✓ intacta ' : '✗ FALTA  '}  ${t}.${col}`)
  }

  console.log(malEnEsta === 0
    ? '  → El DROP está aplicado.'
    : `  → El DROP NO está aplicado (${malEnEsta} cosa(s) mal). Volvé a correr la migración: es idempotente.`)
  fallos += malEnEsta
  await c.end()
}

console.log('')
process.exitCode = fallos ? 1 : 0
