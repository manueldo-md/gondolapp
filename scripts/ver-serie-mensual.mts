/**
 * ver-serie-mensual.mts — rinde el bloque de Evolución mensual a un HTML.
 *
 * SOLO LECTURA. Sirve para mirar la geometría del SVG —escalas, cortes,
 * etiquetas del eje— con los datos REALES de una base, sin tener que loguearse
 * como marca en el deploy. Es lo que un typecheck no puede agarrar.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/ver-serie-mensual.mts [--prod]
 *
 * ── --simular-linea ─────────────────────────────────────────────────────────
 * Ninguna serie real tiene dos meses CONSECUTIVOS —al 24/9/2026, ni en dev ni
 * en prod— así que el render normal no dibuja una sola `<polyline>`: el código
 * que traza la línea no se ejercita nunca. Y es justo donde un bug inventa
 * mediciones, porque una recta entre abril y septiembre se ve normal.
 *
 * Con este flag, el UPDATE que reparte el piloto en tres meses se aplica
 * DENTRO de una transacción que termina en ROLLBACK. Sirve para VER el trazo;
 * no escribe nada.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import pg from 'pg'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { armarPanel } from '../lib/panel-metricas'
import { SerieMensual, type Seleccion } from '../components/panel/serie-mensual'

const ref = process.argv.includes('--prod') ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const cred = credencialesDeRef(ref) as { vars: Record<string, string> }
const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

/**
 * El mismo UPDATE que se corre a mano en dev para poder ver la línea. Reparte
 * las 56 misiones del piloto en marzo / abril / mayo, desplazando el
 * `capturada_at` de cada una por un intervalo fijo — así conserva el día y la
 * hora original de cada misión, y el revert es exactamente el mismo con signo
 * contrario.
 *
 * El corte es por `row_number() OVER (ORDER BY id)`, que es estable: el id no
 * cambia, así que el revert selecciona exactamente las mismas filas.
 */
const SQL_SIMULAR = `
WITH orden AS (
  SELECT mi.id, row_number() OVER (ORDER BY mi.id) AS n
    FROM misiones mi
    JOIN campanas c ON c.id = mi.campana_id
   WHERE c.nombre = 'Relevamiento snacks · Entre Ríos Q1 2026'
)
UPDATE misiones mi
   SET capturada_at = mi.capturada_at + (CASE WHEN o.n <= 20 THEN interval '1 month'
                                              ELSE interval '2 months' END)
  FROM orden o
 WHERE o.id = mi.id AND o.n <= 35`

const simular = process.argv.includes('--simular-linea')

/**
 * --abrir <metrica>:<mes> — rinde con el desglose de ese punto ABIERTO, que es
 * el estado que la URL produce al tocarlo. Sin esto habría que navegar en el
 * deploy para ver si el bloque sale bien.
 */
const abrirArg = process.argv[process.argv.indexOf('--abrir') + 1]
const abrir: Seleccion | undefined =
  process.argv.includes('--abrir') && abrirArg?.includes(':')
    ? { metrica: abrirArg.split(':')[0], mes: abrirArg.split(':')[1] }
    : undefined
if (simular) {
  await c.query('BEGIN')
  const r = await c.query(SQL_SIMULAR)
  console.log(`⚠  SIMULACIÓN: ${r.rowCount} misiones movidas dentro de una transacción que se revierte.`)
}

const { rows: metricas } = await c.query(`SELECT slug, nombre FROM metricas WHERE activa ORDER BY orden`)
const { rows: marcas }   = await c.query(`SELECT id, razon_social FROM marcas ORDER BY razon_social`)

const bloques: string[] = []
for (const m of marcas) {
  const { rows: series }  = await c.query(`SELECT * FROM public.panel_marca_series($1)`, [m.id])
  const { rows: visitas } = await c.query(`SELECT * FROM public.panel_marca_visitas($1)`, [m.id])
  if (series.length === 0 && visitas.length === 0) continue
  const panel = armarPanel({ series, visitas, metricas })
  const marcado = renderToStaticMarkup(React.createElement(SerieMensual, { panel, seleccion: abrir, rutaBase: '/marca/dashboard' }))

  // Lo que el render normal no puede mostrar: cuántos trazos de línea salieron
  // y con qué puntos. Es la parte que ningún dato real ejercita.
  const trazos = [...marcado.matchAll(/<polyline[^>]*points="([^"]+)"/g)].map(x => x[1])
  console.log(`  ${m.razon_social.padEnd(20)} ${panel.series.length} serie(s), ${trazos.length} trazo(s)`)
  for (const t of trazos) console.log(`     trazo: ${t}`)

  bloques.push(
    `<h2 class="text-lg font-bold text-gray-800 mt-10 mb-3">${m.razon_social}</h2>` + marcado
  )
}

if (simular) {
  await c.query('ROLLBACK')
  console.log('⚠  ROLLBACK — la base quedó exactamente como estaba.')
}
await c.end()

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Evolución mensual — ${nombreDeRef(ref)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-gray-50 p-8">
<p class="text-xs text-gray-400 mb-6">Render estático del componente con datos de <b>${nombreDeRef(ref)}</b>. No es la app.</p>
${bloques.join('\n')}
</body></html>`

const salida = `serie-mensual-${nombreDeRef(ref)}${simular ? "-simulada" : ""}.html`
writeFileSync(salida, html)
console.log(`OK — ${salida} (${marcas.length} marcas consultadas, ${bloques.length} con datos)`)
