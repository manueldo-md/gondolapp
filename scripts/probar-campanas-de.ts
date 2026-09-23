/**
 * probar-campanas-de.ts — SOLO LÓGICA, sin base.
 *
 *   npx tsx scripts/probar-campanas-de.ts
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 * Que el filtro por una campaña no se convierta en una fuga.
 *
 * Las funciones del panel pasaron a recibir una lista de campañas en vez de un
 * `marca_id`. Con eso **la lista ES el permiso**: ya no hay un dueño contra el
 * cual contrastar del lado de la base. `panel_marca_pdv(_marca_id, _campana_id)`
 * filtraba por los dos, así que un id ajeno llegado por la URL no devolvía nada
 * y nadie tenía que acordarse de validarlo.
 *
 * Ahora sí hay que acordarse, y el lugar donde se hace es `idsDe`. El modo de
 * falla que estos controles vigilan no es un error: es **devolver de más**, en
 * silencio, ante una entrada que no se entendió.
 */
import { idsDe } from '../lib/campanas-de'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const MIAS  = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const AJENA = 'z'

console.log('\n▸ Sin filtro: todas las del actor')
caso('las tres',            idsDe(MIAS),              ['a', 'b', 'c'])
caso('undefined no filtra', idsDe(MIAS, undefined),   ['a', 'b', 'c'])
caso('null no filtra',      idsDe(MIAS, null),        ['a', 'b', 'c'])
caso('cadena vacía tampoco', idsDe(MIAS, ''),         ['a', 'b', 'c'])

console.log('\n▸ Con filtro propio: solo esa')
caso('la primera', idsDe(MIAS, 'a'), ['a'])
caso('la del medio', idsDe(MIAS, 'b'), ['b'])
caso('la última', idsDe(MIAS, 'c'), ['c'])

console.log('\n▸ EL CONTROL QUE IMPORTA: una campaña ajena no devuelve nada')
// Si esto devolviera MIAS, el filtro se habría convertido en un "no entendí,
// te muestro todo". Si devolviera ['z'], sería una fuga directa: el panel
// consultaría las métricas de la campaña de otro.
caso('una campaña que no es suya → vacío',        idsDe(MIAS, AJENA), [])
caso('y NO devuelve la lista entera',             idsDe(MIAS, AJENA).length, 0)
caso('y NO devuelve la ajena',                    idsDe(MIAS, AJENA).includes(AJENA), false)
caso('un uuid inventado tampoco',                 idsDe(MIAS, '00000000-0000-0000-0000-000000000000'), [])

console.log('\n▸ El actor sin campañas no ve nada, con filtro o sin él')
// El arreglo vacío tiene que llegar vacío hasta la base: la migración verifica
// que `panel_series(ARRAY[]::uuid[])` devuelva cero filas. Las dos mitades
// tienen que fallar cerradas, no una sola.
caso('sin campañas, sin filtro', idsDe([]), [])
caso('sin campañas, con filtro', idsDe([], 'a'), [])

console.log('\n▸ Casos de borde que no deberían sorprender')
caso('una sola campaña', idsDe([{ id: 'a' }]), ['a'])
caso('el filtro distingue mayúsculas', idsDe([{ id: 'A' }], 'a'), [])
// Ids repetidos no se deduplican: la lista sale de la base con PK única, así
// que un duplicado sería un síntoma y esconderlo no ayudaría a nadie.
caso('no inventa deduplicación', idsDe([{ id: 'a' }, { id: 'a' }]), ['a', 'a'])

console.log('\n▸ No muta lo que recibe')
{
  const original = [{ id: 'a' }, { id: 'b' }]
  idsDe(original, 'a')
  caso('la lista del llamador queda igual', original, [{ id: 'a' }, { id: 'b' }])
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
