/**
 * ver-serie-mensual.mts — rinde el bloque de Evolución mensual a un HTML.
 *
 * SOLO LECTURA. Sirve para mirar la geometría del SVG —escalas, cortes,
 * etiquetas del eje— con los datos REALES de una base, sin tener que loguearse
 * como marca en el deploy. Es lo que un typecheck no puede agarrar.
 *
 *   npx tsx scripts/ver-serie-mensual.mts [--prod]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import pg from 'pg'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { armarPanel } from '../lib/panel-marca'
import { SerieMensual } from '../app/(marca)/marca/dashboard/serie-mensual'

const ref = process.argv.includes('--prod') ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const cred = credencialesDeRef(ref) as { vars: Record<string, string> }
const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: metricas } = await c.query(`SELECT slug, nombre FROM metricas WHERE activa ORDER BY orden`)
const { rows: marcas }   = await c.query(`SELECT id, razon_social FROM marcas ORDER BY razon_social`)

const bloques: string[] = []
for (const m of marcas) {
  const { rows: series }  = await c.query(`SELECT * FROM public.panel_marca_series($1)`, [m.id])
  const { rows: visitas } = await c.query(`SELECT * FROM public.panel_marca_visitas($1)`, [m.id])
  if (series.length === 0 && visitas.length === 0) continue
  const panel = armarPanel({ series, visitas, metricas })
  bloques.push(
    `<h2 class="text-lg font-bold text-gray-800 mt-10 mb-3">${m.razon_social}</h2>` +
    renderToStaticMarkup(React.createElement(SerieMensual, { panel }))
  )
}
await c.end()

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Evolución mensual — ${nombreDeRef(ref)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-gray-50 p-8">
<p class="text-xs text-gray-400 mb-6">Render estático del componente con datos de <b>${nombreDeRef(ref)}</b>. No es la app.</p>
${bloques.join('\n')}
</body></html>`

const salida = `serie-mensual-${nombreDeRef(ref)}.html`
writeFileSync(salida, html)
console.log(`OK — ${salida} (${marcas.length} marcas consultadas, ${bloques.length} con datos)`)
