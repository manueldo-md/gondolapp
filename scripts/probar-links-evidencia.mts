/**
 * probar-links-evidencia.mts — SIN BASE. Rinde el componente y mira el HTML.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-links-evidencia.mts
 *
 * QUE PROTEGE: que la tabla de cobertura linkee a la evidencia SOLO donde esa
 * pantalla existe. Los CUATRO paneles montan esa tabla y solo marca y
 * distribuidora tienen /comercio/[id]; un link a un 404 es peor que ninguno.
 *
 * Y que el nombre del comercio siga estando cuando NO hay link: que no se pueda
 * linkear no puede significar que el comercio desaparezca de la tabla.
 *
 * No alcanza con probar rutaEvidencia sola —eso ya lo hace
 * probar-linea-comercio.ts—: lo que se rompe acá es el CABLEADO, que el panel
 * llegue hasta la funcion. El bug real fue ese: el Panel de este repo se llama
 * 'distri' y su ruta es /distribuidora/, y escribir el nombre de la ruta
 * compila igual y deja el link en null sin que nada falle.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CoberturaSeguimiento } from '../components/campanas/CoberturaSeguimiento'
import type { VisitaMision } from '../lib/cobertura-seguimiento'

const hoy = new Date().toISOString()
const misiones: VisitaMision[] = [
  { comercio_id: 'c1', gondolero_id: 'g1', estado: 'aprobada', capturada_at: hoy },
  { comercio_id: 'c2', gondolero_id: 'g1', estado: 'aprobada', capturada_at: hoy },
]
const base = {
  misiones,
  nombresComercio: new Map([['c1', 'Kiosco El Cid'], ['c2', 'Almacén Norte']]),
  aliasGondolero: new Map([['g1', 'CondorVeloz']]),
  visitasPorSemana: 2,
  fechaInicio: null,
  verAgente: true,
  colorBarra: 'bg-gondo-amber-400',
}

const render = (evidencia: unknown) =>
  renderToStaticMarkup(React.createElement(CoberturaSeguimiento, { ...base, evidencia } as never))

const casos: [string, unknown, boolean, string][] = [
  ['distri con alcance', { panel: 'distri', alcance: 'm7', campanaId: 'k9' }, true,
   'href="/distribuidora/comercio/c1?alcance=m7&amp;campana=k9"'],
  ['marca', { panel: 'marca', alcance: 'm7', campanaId: 'k9' }, true,
   'href="/marca/comercio/c1?campana=k9"'],
  ['distri SIN alcance', { panel: 'distri', alcance: null, campanaId: 'k9' }, false, ''],
  ['admin', { panel: 'admin', campanaId: 'k9' }, false, ''],
  ['repositora', { panel: 'repositora', campanaId: 'k9' }, false, ''],
  ['sin evidencia', null, false, ''],
]

let fallos = 0
console.log('\n▸ La tabla de cobertura linkea solo donde la pantalla existe\n')
for (const [nombre, evidencia, esperaLink, href] of casos) {
  const html = render(evidencia)
  const tieneLink = html.includes('/comercio/c1')
  const ok = tieneLink === esperaLink && (!esperaLink || html.includes(href))
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre.padEnd(22)} ${tieneLink ? 'linkea' : 'texto plano'}`)
  if (!ok && esperaLink) {
    console.log(`       esperaba ${href}`)
    console.log(`       y el html tiene: ${(html.match(/href="[^"]*comercio[^"]*"/) ?? ['(nada)'])[0]}`)
  }
  // El nombre tiene que estar SIEMPRE, linkeado o no: que no haya link no puede
  // significar que el comercio desaparezca de la tabla.
  if (!html.includes('Kiosco El Cid')) { fallos++; console.log('   ✗  …y el nombre desapareció') }
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
