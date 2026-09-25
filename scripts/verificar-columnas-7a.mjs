/**
 * verificar-columnas-7a.mjs — SOLO LECTURA
 *
 * Antes de mandar el tramo 7a a producción: ¿existen en la base las columnas
 * que el código nuevo pide?
 *
 *   node scripts/verificar-columnas-7a.mjs            (las dos bases)
 *
 * POR QUÉ EXISTE
 * El tramo no trae migración, así que es fácil darlo por seguro. Pero
 * `lib/campanas-de.ts` agregó `modalidad` y `visitas_por_semana` a su SELECT, y
 * de `campanasDe` cuelgan el panel, el mapa y las alertas de la distri.
 *
 * Si una columna del select no existe, PostgREST **no devuelve la fila sin esa
 * columna: no devuelve nada**, y el síntoma no es "falta un dato" sino "no hay
 * campañas". Es lo que pasó el 18/9 con `profiles.nivel`, donde el perfil entero
 * se leyó como inexistente durante 24 horas.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

/** Lo que el código del tramo 7a le pide a la base. */
const NECESARIAS = [
  ['campanas', 'modalidad'],            // lib/campanas-de.ts, lib/cobertura-mapa.ts
  ['campanas', 'visitas_por_semana'],   // ídem
  ['campanas', 'fecha_inicio'],         // el prorrateo de la semana
  ['misiones', 'capturada_at'],         // el ancla, nunca created_at
  ['misiones', 'comercio_id'],
  ['misiones', 'gondolero_id'],
  ['misiones', 'estado'],
]

let fallos = 0

for (const ref of ['mqeymmprvpclpyjpujvf', 'xzznzustgsacmfwsupux']) {
  const nombre = nombreDeRef(ref)
  const { vars } = credencialesDeRef(ref)
  const pgurl = vars.PGURL
  const c = new Client({ connectionString: pgurl })
  await c.connect()

  const { rows } = await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND (table_name, column_name) IN (
        ${NECESARIAS.map((_, k) => `($${k * 2 + 1}, $${k * 2 + 2})`).join(', ')})`,
    NECESARIAS.flat()
  )
  const hay = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))

  console.log(`\n▸ ${nombre} (${ref})`)
  for (const [t, col] of NECESARIAS) {
    const ok = hay.has(`${t}.${col}`)
    if (!ok) fallos++
    console.log(`   ${ok ? '✓' : '✗'}  ${t}.${col}`)
  }

  // Y que la función que el mapa usa siga existiendo: el tramo anterior dropeó
  // las tres `panel_marca_*`, así que conviene no suponer cuál quedó.
  const { rows: fn } = await c.query(
    `SELECT proname FROM pg_proc WHERE proname IN ('panel_pdv','panel_series','panel_visitas')`)
  const nombres = new Set(fn.map(r => r.proname))
  for (const f of ['panel_pdv', 'panel_series', 'panel_visitas']) {
    const ok = nombres.has(f)
    if (!ok) fallos++
    console.log(`   ${ok ? '✓' : '✗'}  ${f}()`)
  }

  await c.end()
}

console.log(fallos ? `\n✗ faltan ${fallos}. NO mergear.\n` : '\n✓ Están todas en las dos bases.\n')
process.exit(fallos ? 1 : 0)
