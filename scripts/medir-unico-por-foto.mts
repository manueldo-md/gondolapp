/**
 * medir-unico-por-foto.mts — ¿se puede poner UNIQUE sobre movimientos_puntos(foto_id)?
 *
 *   npx tsx scripts/medir-unico-por-foto.mts            (dev)
 *   npx tsx scripts/medir-unico-por-foto.mts --prod
 *
 * SOLO LECTURA.
 *
 * Un índice único es una afirmación sobre TODOS los datos, presentes y
 * futuros. Antes de proponerlo hay que saber si los datos de hoy ya lo
 * violan, y si hay un caso legítimo de dos movimientos por la misma foto.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const { vars } = credencialesDeRef(ref)
const pg = new Client({ connectionString: vars.PGURL })
await pg.connect()

console.log(`\n▸ ${nombreDeRef(ref)}`)

const { rows: r } = await pg.query(`
  SELECT count(*) total,
         count(*) FILTER (WHERE foto_id IS NOT NULL) con_foto,
         count(*) FILTER (WHERE foto_id IS NULL)     sin_foto,
         count(*) FILTER (WHERE foto_id IS NOT NULL AND tipo = 'debito') debitos_con_foto,
         (SELECT string_agg(DISTINCT tipo, ', ') FROM movimientos_puntos WHERE foto_id IS NOT NULL) tipos
    FROM movimientos_puntos`)
const m = r[0]
console.log(`  movimientos: ${m.total} · con foto_id: ${m.con_foto} · sin foto_id: ${m.sin_foto}`)
console.log(`  tipos que usan foto_id: ${m.tipos ?? '(ninguno)'} · débitos con foto_id: ${m.debitos_con_foto}`)

// ── Lo que decide: ¿hay HOY dos movimientos con la misma foto? ──────────────
const { rows: dup } = await pg.query(`
  SELECT foto_id, count(*) n, string_agg(DISTINCT tipo, '+') tipos, sum(monto) total
    FROM movimientos_puntos WHERE foto_id IS NOT NULL
   GROUP BY foto_id HAVING count(*) > 1 ORDER BY 2 DESC`)
console.log(`\n  foto_id con MÁS DE UN movimiento: ${dup.length}`)
for (const d of dup) console.log(`    ${d.foto_id} → ${d.n} movs (${d.tipos}), ${d.total} pts`)

// ── El otro camino de pago no usa foto_id, así que el índice no lo toca ─────
const { rows: c } = await pg.query(`
  SELECT concepto, count(*) n, count(*) FILTER (WHERE foto_id IS NOT NULL) con_foto
    FROM movimientos_puntos GROUP BY concepto ORDER BY 2 DESC LIMIT 12`)
console.log('\n  por concepto (para ver quién escribe foto_id y quién no):')
for (const x of c) {
  console.log(`    ${String(x.concepto).slice(0, 46).padEnd(46)} ${String(x.n).padStart(3)} · con foto_id: ${x.con_foto}`)
}

await pg.end()
console.log('\n(solo lectura)\n')
