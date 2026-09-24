/**
 * ver-linea-comercio.mts — rinde la LÍNEA DE VISITAS de un comercio a un HTML.
 *
 * SOLO LECTURA. Sirve para MIRAR la pantalla con datos reales sin loguearse
 * como marca o como distribuidora en el deploy. Es lo mismo que
 * `ver-serie-mensual.mts`, y por el mismo motivo: en ese tramo mirar el
 * artefacto servido encontró tres bugs que `tsc` no puede ver.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/ver-linea-comercio.mts
 *   … --prod
 *   … --comercio <uuid>     un comercio en particular
 *   … --tope 3              para ver el aviso de recorte, que no se dispara solo
 *
 * Las URLs de las fotos salen firmadas de verdad, así que el HTML muestra las
 * imágenes mientras el token viva (una hora). Pasado eso, se vuelve a correr.
 */
import { writeFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { cabeceraSiPertenece, filasDeLaLinea } from '../lib/visitas-comercio'
import { armarLinea } from '../lib/linea-comercio'
import { firmarFotosEnLote } from '../lib/storage-fotos'
import { PantallaLineaComercio } from '../components/panel/linea-comercio'

const arg = (n: string) => {
  const i = process.argv.indexOf(n)
  return i >= 0 ? process.argv[i + 1] : null
}

const ref = process.argv.includes('--prod') ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const cred = credencialesDeRef(ref) as { vars: Record<string, string> }

const admin = createClient(cred.vars.NEXT_PUBLIC_SUPABASE_URL, cred.vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

/** El alcance con el que se entra: una distri ejecutando para una marca. */
const { rows: [alc] } = await c.query(`
  SELECT ca.distri_id, ca.marca_id, ma.razon_social AS marca, di.razon_social AS distri,
         array_agg(ca.id) AS campanas
    FROM campanas ca
    JOIN marcas ma ON ma.id = ca.marca_id
    JOIN distribuidoras di ON di.id = ca.distri_id
   WHERE ca.distri_id IS NOT NULL AND ca.marca_id IS NOT NULL
   GROUP BY 1, 2, 3, 4
   ORDER BY count(*) DESC LIMIT 1`)
if (!alc) throw new Error('No hay ninguna campaña de una distri para una marca en esta base.')

/** El comercio con más visitas dentro de ese alcance, o el que se pida. */
const comercioId = arg('--comercio') ?? (await c.query(`
  SELECT mi.comercio_id FROM misiones mi
   WHERE mi.campana_id = ANY($1) AND mi.estado IS DISTINCT FROM 'descartada'
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`, [alc.campanas])).rows[0]?.comercio_id

if (!comercioId) throw new Error('No hay ningún comercio con visitas en ese alcance.')

const comercio = await cabeceraSiPertenece(comercioId, alc.campanas, admin)
if (!comercio) throw new Error('El comercio no pertenece al alcance. No debería pasar acá.')

const filas = await filasDeLaLinea(comercioId, alc.campanas, admin)
const tope = arg('--tope') ? Number(arg('--tope')) : undefined
const linea = armarLinea(filas, tope)

const urls = await firmarFotosEnLote(
  linea.visitas.flatMap(v => v.fotos).map(f => ({ id: f.id, storage_path: f.storagePath, url: f.url })),
  admin,
)
await c.end()

const cuerpo = renderToStaticMarkup(
  React.createElement(PantallaLineaComercio, {
    comercio, linea, urls,
    volverA: '#', volverTexto: 'Volver al mapa',
  }),
)

// Tailwind por CDN no conoce los colores de la marca, que viven en
// tailwind.config.js. Sin esto el chip del filtro y los avisos salen sin color
// y uno concluye que el componente está mal cuando el que no sabe es el CDN.
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Línea de visitas — ${nombreDeRef(ref)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { theme: { extend: { colors: {
  'gondo-amber': { 50:'#FAEEDA', 100:'#FAC775', 400:'#BA7517', 600:'#854F0B', 900:'#412402' },
  'gondo-indigo': { 50:'#EEF0FC', 600:'#4F46E5' }
} } } }</script>
</head><body class="bg-gray-50 p-8">
<p class="text-xs text-gray-400 mb-6">
  Render estático del componente con datos de <b>${nombreDeRef(ref)}</b>. No es la app.<br>
  Alcance: <b>${alc.distri}</b> ejecutando para <b>${alc.marca}</b> · ${alc.campanas.length} campañas.
</p>
${cuerpo}
</body></html>`

const salida = `linea-comercio-${nombreDeRef(ref)}.html`
writeFileSync(salida, html)
console.log(`\nOK — ${salida}`)
console.log(`   ${comercio.nombre} · ${linea.total} visitas · ${linea.recortadas} recortadas`)
console.log(`   ${Object.keys(urls).length} fotos firmadas\n`)
