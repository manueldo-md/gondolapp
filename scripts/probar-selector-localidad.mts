/**
 * probar-selector-localidad.mts — SIN BASE. Rinde el selector y mira qué sale.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-selector-localidad.mts
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Los cuatro estados de la sugerencia tienen que verse DISTINTO, y la
 * diferencia no es cosmética:
 *
 *   exacto    un clic para confirmar — es el camino dominante
 *   ambiguo   varias posibles, y el usuario elige. NUNCA un botón de confirmar
 *   fuera     lo que dijo el proveedor, que el padrón no tiene
 *   sin_dato  nada que ofrecer
 *   error     no se pudo preguntar, que NO es lo mismo que sin_dato
 *
 * El control que importa es que **`ambiguo` y `fuera` no ofrezcan Confirmar**:
 * si lo ofrecieran, la máquina estaría eligiendo entre dos localidades con un
 * clic de disfraz, que es lo que todo el tramo evita. El CHECK de la base lo
 * impide del lado del dato; esto lo impide del lado de la pantalla.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SelectorLocalidad, type SugerenciaLocalidad } from '../components/shared/selector-localidad'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const noop = async () => ({})
function pintar(s: SugerenciaLocalidad): string {
  return renderToStaticMarkup(React.createElement(SelectorLocalidad, {
    comercioId: 'c1', sugerencia: s, onAsignar: noop,
  }))
}

const EXACTO: SugerenciaLocalidad = { estado: 'exacto', id: 1, texto: 'Colón', etiqueta: 'Colón — Colón, Entre Ríos' }

console.log('\n▸ exacto — el camino de un clic')
{
  const h = pintar(EXACTO)
  caso('muestra la cadena entera, no solo el pueblo', h.includes('Colón — Colón, Entre Ríos'), true)
  caso('ofrece Confirmar', h.includes('Confirmar'), true)
  caso('y una salida para corregir', h.includes('Otra'), true)
  // La cadena entera importa: "Colón" a secas no deja ver que la sugerencia
  // apunta al departamento equivocado. Con la cadena, se ve sin abrir nada.
  caso('CONTROL — sin cascader abierto', h.includes('Provincia…'), false)
}

console.log('\n▸ ambiguo — NUNCA un botón de confirmar')
{
  const h = pintar({ estado: 'ambiguo', id: null, texto: 'Caseros', etiqueta: null })
  caso('dice cuál fue el nombre', h.includes('Caseros'), true)
  caso('y que existe en más de un lugar', h.includes('más de un lugar'), true)
  caso('LO QUE IMPORTA — no ofrece Confirmar', h.includes('Confirmar'), false)
  caso('ofrece el cascader para elegir', h.includes('Provincia…'), true)
  caso('con el botón de asignar deshabilitado hasta elegir', h.includes('disabled'), true)
}

console.log('\n▸ fuera — el pedido de alta de localidad tiene que leerse')
{
  const h = pintar({ estado: 'fuera', id: null, texto: 'Paraje El Ceibo', etiqueta: null })
  caso('dice qué contestó el GPS', h.includes('Paraje El Ceibo'), true)
  caso('y que no está en el padrón', h.includes('no está') && h.includes('padrón'), true)
  caso('no ofrece Confirmar', h.includes('Confirmar'), false)
  caso('ofrece el cascader', h.includes('Provincia…'), true)
}

console.log('\n▸ sin_dato y error se distinguen')
{
  const sd = pintar({ estado: 'sin_dato', id: null, texto: null, etiqueta: null })
  const er = pintar({ estado: 'error', id: null, texto: null, etiqueta: null })
  caso('sin_dato dice que no hay dato de ubicación', sd.includes('Sin dato de ubicación'), true)
  caso('error dice que no se pudo consultar', er.includes('No se pudo consultar'), true)
  caso('y NO dicen lo mismo', sd === er, false)
  caso('los dos ofrecen el cascader',
    sd.includes('Provincia…') && er.includes('Provincia…'), true)
}

console.log('\n▸ Sin sugerencia todavía (estado null)')
{
  const h = pintar({ estado: null, id: null, texto: null, etiqueta: null })
  caso('no rompe', h.length > 0, true)
  caso('y ofrece el cascader', h.includes('Provincia…'), true)
  caso('sin ofrecer Confirmar', h.includes('Confirmar'), false)
}

console.log('\n▸ CONTROL — un id de sugerencia sin estado exacto no se confirma')
{
  // La base ya lo impide con un CHECK, pero si una fila vieja o un bug lo
  // produjera, la pantalla tampoco puede ofrecer el clic.
  const h = pintar({ estado: 'ambiguo', id: 99, texto: 'Caseros', etiqueta: 'Caseros — Colón, Entre Ríos' })
  caso('con estado ambiguo no hay Confirmar aunque venga un id', h.includes('Confirmar'), false)
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
