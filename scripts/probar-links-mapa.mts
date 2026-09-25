/**
 * probar-links-mapa.mts — SIN BASE. Rinde PantallaMapa y mira los href de verdad.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-links-mapa.mts
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
 * El 25/9/2026 se reportó un bug: tocar "Cobertura semanal" volvía a Presencia.
 * Eran DOS bugs apilados y **los dos eran de CABLEADO**, no de lógica:
 *
 *   1. la página pasaba una "ruta base" con el alcance y sin la campaña, así que
 *      el control de pintado borraba el `?campana=` al mergear;
 *   2. las dos páginas parseaban `?pintar=` con un ternario a mano que no
 *      conocía `cobertura`, así que el valor caía al default en silencio.
 *
 * `probar-mapa-pdv.ts` cubre las dos funciones sueltas —`hrefDelMapa` y
 * `modoDesde`— y **habría seguido en verde con el bug puesto**, porque el error
 * estaba en quién las llama y con qué. Lo mismo pasó con `rutaEvidencia` y el
 * panel `'distri'`: la función andaba y el llamador le pasaba otra cosa.
 *
 * Así que acá se rinde el componente y se leen los `href` que salen, que es lo
 * único que prueba que la cadena entera esté conectada.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PantallaMapa, type FilaPdvMapa } from '../components/panel/pantalla-mapa'
import { modoDesde, type ModoPintado } from '../lib/mapa-pdv'
import type { CoberturaDePdv } from '../lib/cobertura-mapa'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const FILAS: FilaPdvMapa[] = [
  { comercio_id: 'c1', comercio_nombre: 'Kiosco El Cid', comercio_tipo: 'kiosco',
    lat: -32.24, lng: -58.13, localidad_id: 1, localidad_nombre: 'Concordia',
    misiones: 3, con_valor: 3, verdaderos: 2, ultima_medicion: '2026-09-20T12:00:00Z' },
  { comercio_id: 'c2', comercio_nombre: 'Almacén Norte', comercio_tipo: 'almacen',
    lat: -32.2401, lng: -58.1301, localidad_id: 1, localidad_nombre: 'Concordia',
    misiones: 2, con_valor: 0, verdaderos: 0, ultima_medicion: null },
]

const CAMPANAS = [{ id: 'k9', nombre: 'Reposición diaria' }]

/** Rinde la pantalla como la monta la página de distri, y devuelve sus href. */
function hrefsDe(searchParams: { alcance?: string; campana?: string; pintar?: string },
                 cobertura?: Map<string, CoberturaDePdv>) {
  const html = renderToStaticMarkup(React.createElement(PantallaMapa, {
    filas: FILAS,
    campanas: CAMPANAS,
    campanaId: searchParams.campana ?? null,
    // EL PARSEO QUE FALLÓ: se llama igual que en la página.
    pintar: modoDesde(searchParams.pintar),
    ruta: '/distribuidora/mapa',
    alcanceClave: searchParams.alcance,
    panel: 'distri',
    apiKey: 'x',
    cobertura,
    visitasPorSemana: 7,
  }))
  return {
    html,
    hrefs: [...html.matchAll(/href="(\/distribuidora\/mapa[^"]*)"/g)]
      .map(m => m[1].replace(/&amp;/g, '&')),
  }
}

const COB = new Map<string, CoberturaDePdv>([
  ['c1', { estado: 'al_dia', visitas: 7 }],
  ['c2', { estado: 'atrasado', visitas: 1 }],
])

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL BUG: con una campaña elegida, el control de pintado la conservaba?')
{
  const { hrefs } = hrefsDe({ alcance: 'm7', campana: 'k9' }, COB)

  // Todos los links de los controles tienen que llevar la campaña puesta, menos
  // el de "Todos los PDV", que justamente la saca.
  const pierdenLaCampana = hrefs.filter(h => !h.includes('campana=k9') && !h.endsWith('alcance=m7'))
  caso('ningún link del control pierde la campaña', pierdenLaCampana, [])

  caso('el link de cobertura la lleva',
    hrefs.some(h => h.includes('pintar=cobertura') && h.includes('campana=k9')), true)
  caso('y el de tipo también',
    hrefs.some(h => h.includes('pintar=tipo') && h.includes('campana=k9')), true)
  caso('"Todos los PDV" sí la saca, que es lo suyo',
    hrefs.some(h => h === '/distribuidora/mapa?alcance=m7'), true)
  caso('y ninguno pierde el alcance', hrefs.every(h => h.includes('alcance=m7')), true)
}

console.log('\n▸ Y la opción de cobertura, ¿aparece y queda activa?')
{
  const conCampana = hrefsDe({ alcance: 'm7', campana: 'k9' }, COB)
  caso('con campaña de seguimiento, la opción existe',
    conCampana.html.includes('Cobertura semanal'), true)

  // EL SEGUNDO BUG: con `?pintar=cobertura` la pantalla tiene que QUEDARSE ahí.
  const activa = hrefsDe({ alcance: 'm7', campana: 'k9', pintar: 'cobertura' }, COB)
  caso('con ?pintar=cobertura el modo se aplica',
    activa.html.includes('cómo viene la frecuencia de esta semana'), true)
  caso('y la referencia muestra los estados de cobertura',
    ['Al día', 'Atrasado'].every(t => activa.html.includes(t)), true)
  // CONTROL: si el parseo cayera al default, la referencia diría presencia.
  caso('CONTROL — y NO la de presencia',
    activa.html.includes('Con presencia'), false)
  caso('la lista del grupo diría las visitas de la semana',
    activa.html.includes('7') && activa.html.includes('Cobertura semanal'), true)
}

console.log('\n▸ Sin campaña de seguimiento, la opción no está y el modo cae')
{
  const sinCob = hrefsDe({ alcance: 'm7', campana: 'k9' }, new Map())
  caso('la opción no se ofrece', sinCob.html.includes('Cobertura semanal'), false)

  // `?pintar=cobertura` forzado por un link viejo: cae a presencia en vez de
  // pintar los PDV de gris "sin dato", que se leería como medición perdida.
  const forzado = hrefsDe({ alcance: 'm7', campana: 'k9', pintar: 'cobertura' }, new Map())
  caso('y el modo forzado cae a presencia',
    forzado.html.includes('Con presencia'), true)
  caso('sin decir que está mostrando cobertura',
    forzado.html.includes('cómo viene la frecuencia'), false)
}

console.log('\n▸ En marca no hay alcance, y los links no lo inventan')
{
  const html = renderToStaticMarkup(React.createElement(PantallaMapa, {
    filas: FILAS, campanas: CAMPANAS, campanaId: 'k9',
    pintar: 'tipo' as ModoPintado, ruta: '/marca/mapa', panel: 'marca', apiKey: 'x',
  }))
  const hrefs = [...html.matchAll(/href="(\/marca\/mapa[^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&'))
  caso('ningún link trae alcance', hrefs.every(h => !h.includes('alcance')), true)
  caso('y la campaña se conserva igual',
    hrefs.some(h => h.includes('pintar=cobertura') === false && h.includes('campana=k9')), true)
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
