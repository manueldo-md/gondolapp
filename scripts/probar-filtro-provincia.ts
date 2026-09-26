/**
 * probar-filtro-provincia.ts — SOLO LÓGICA, sin base.
 *
 *   npx tsx scripts/probar-filtro-provincia.ts
 *
 * Cubre las dos mitades del tramo que se pueden probar sin request:
 *
 *   A. El filtro y el KPI (`lib/filtro-provincia.ts`).
 *   B. **Que `hrefDelMapa` no pierda ninguna clave**, recorriendo el tipo.
 *
 * ── LA PARTE B ES LA QUE JUSTIFICA EL ARCHIVO ───────────────────────────────
 * Es la tercera vez que un href que no conserva lo que ya estaba nos muerde, y
 * el modo de falla es el peor que hay: **no rompe nada visible**. El mapa se
 * ensancha y parece una decisión. Por eso el control no chequea las claves que
 * se me ocurran hoy: arma un estado con TODAS las claves de `EstadoDelMapa` y
 * verifica que sobrevivan un ida y vuelta. Una clave nueva que alguien agregue
 * sin propagarla pone esto en rojo sin que nadie toque este archivo.
 *
 * El tipo ya impide olvidarla en `SERIALIZAR` —no compila— pero NO impide
 * olvidarla al CONSTRUIR el estado, que es lo que hace `pantalla-mapa.tsx`.
 */
import {
  provinciasDesde, serializarProvincias, alternarProvincia,
  provinciasDisponibles, aplicarFiltroProvincia, resumenProvincias,
  type FilaConProvincia,
} from '../lib/filtro-provincia'
import { hrefDelMapa, hrefMapa, type EstadoDelMapa } from '../lib/mapa-pdv'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const fila = (prov: number | null, verdaderos = 0, nombre = `P${prov}`): FilaConProvincia =>
  ({ provincia_id: prov, provincia_nombre: prov === null ? null : nombre, verdaderos })

console.log('\n▸ 1. Parseo tolerante, y canónico')
caso('vacío es "todas"',            provinciasDesde(undefined), [])
caso('string vacío también',        provinciasDesde(''), [])
caso('una',                         provinciasDesde('6'), [6])
caso('varias, ordenadas',           provinciasDesde('6,2'), [2, 6])
caso('sin repetidos',               provinciasDesde('2,6,2'), [2, 6])
caso('con espacios',                provinciasDesde(' 2 , 6 '), [2, 6])
// Lo que viene mal se descarta y el resto SIGUE valiendo: un link mal pegado
// no tiene que dar una pantalla rota ni vaciar el filtro entero.
caso('la basura se descarta y el resto vale', provinciasDesde('2,abc,6'), [2, 6])
caso('negativos y cero afuera',     provinciasDesde('0,-3,4'), [4])
// Next entrega string[] si alguna vez llegan claves repetidas.
caso('claves repetidas se aplanan', provinciasDesde(['2', '6']), [2, 6])

console.log('\n▸ 2. Serialización — y el invariante de "ninguna"')
caso('lista vacía → null (hrefMapa borra la clave)', serializarProvincias([]), null)
caso('null → null',                 serializarProvincias(null), null)
caso('una',                         serializarProvincias([6]), '6')
caso('canónica, ordenada y sin repetidos', serializarProvincias([6, 2, 6]), '2,6')
// El invariante completo: deseleccionar todo tiene que dejar la URL SIN la
// clave, no con una vacía. Es lo que hace imposible escribir "ninguna".
caso('ida y vuelta: deseleccionar todo borra la clave de la URL',
  hrefMapa('/x?prov=2,6', { prov: serializarProvincias([]) }), '/x')
caso('CONTROL — con selección, la clave está',
  hrefMapa('/x', { prov: serializarProvincias([2, 6]) }), '/x?prov=2%2C6')

console.log('\n▸ 3. Alternar (los chips del selector)')
caso('agrega y ordena',  alternarProvincia([6], 2), [2, 6])
caso('saca',             alternarProvincia([2, 6], 6), [2])
caso('sacar la última deja vacío = todas', alternarProvincia([2], 2), [])

console.log('\n▸ 4. Las provincias disponibles salen de los DATOS')
{
  const filas = [fila(2, 1, 'Entre Ríos'), fila(2, 0, 'Entre Ríos'), fila(6, 0, 'Córdoba'), fila(null)]
  caso('solo las que tienen PDV, alfabéticas, con su conteo',
    provinciasDisponibles(filas).map(p => [p.nombre, p.pdv]),
    [['Córdoba', 1], ['Entre Ríos', 2]])
  caso('las filas sin provincia no inventan una opción',
    provinciasDisponibles(filas).length, 2)
}

console.log('\n▸ 5. El filtro')
{
  const filas = [fila(2), fila(2), fila(6), fila(null)]
  const todas = aplicarFiltroProvincia(filas, [])
  caso('sin selección no filtra nada, ni siquiera los sin provincia',
    [todas.filas.length, todas.hayFiltro], [4, false])

  const una = aplicarFiltroProvincia(filas, [2])
  caso('con una provincia deja solo las suyas', una.filas.length, 2)
  caso('y cuenta los que quedaron afuera POR NO TENER provincia', una.sinProvincia, 1)
  caso('hayFiltro', una.hayFiltro, true)

  // Un link viejo o una provincia donde se dejó de relevar.
  const mixta = aplicarFiltroProvincia(filas, [2, 99])
  caso('lo pedido que no existe se reporta', mixta.desconocidas, [99])
  caso('y lo que sí existe igual filtra', mixta.filas.length, 2)

  // ── EL CASO QUE EVITA LA CONCLUSIÓN ERRÓNEA ──────────────────────────────
  // Si TODO lo pedido está fuera de los datos, filtrar daría una pantalla en
  // blanco, y una pantalla en blanco se lee como "no hay datos". Se devuelve
  // el universo y `desconocidas` explica por qué no se filtró.
  const nada = aplicarFiltroProvincia(filas, [98, 99])
  caso('todo desconocido NO vacía la pantalla', nada.filas.length, 4)
  caso('y lo dice', [nada.hayFiltro, nada.desconocidas], [false, [98, 99]])
}

console.log('\n▸ 6. Los dos números del KPI')
{
  const filas = [
    fila(2, 3), fila(2, 0),   // Entre Ríos: releva y tiene producto
    fila(6, 0), fila(6, 0),   // Córdoba: releva y NO tiene
    fila(null, 5),            // sin provincia: no cuenta en ninguno
  ]
  caso('relevás en 2, producto en 1', resumenProvincias(filas), { relevando: 2, conProducto: 1 })
  caso('un PDV sin provincia no inventa una provincia con producto',
    resumenProvincias([fila(null, 9)]), { relevando: 0, conProducto: 0 })
  // `count(*)` de Postgres viaja como string por varios caminos.
  caso('verdaderos como STRING cuenta igual',
    resumenProvincias([{ provincia_id: 2, verdaderos: '4' }]), { relevando: 1, conProducto: 1 })
  caso('con cero provincias el KPI no tiene nada que mostrar',
    resumenProvincias([]), { relevando: 0, conProducto: 0 })
  // El invariante que la pantalla asume para escribir "N de M".
  caso('conProducto nunca supera a relevando',
    resumenProvincias(filas).conProducto <= resumenProvincias(filas).relevando, true)
}

console.log('\n▸ 7. hrefDelMapa NO pierde ninguna clave — recorriendo el TIPO')
{
  // Un valor no-default por cada clave de `EstadoDelMapa`. El `satisfies`
  // obliga a que estén todas: una clave nueva sin valor acá no compila, así
  // que el control no puede quedarse viejo en silencio.
  const COMPLETO = {
    alcance: 'marca:abc',
    campana: 'camp-1',
    pintar:  'tipo',
    prov:    [2, 6],
  } satisfies Required<{ [K in keyof EstadoDelMapa]: NonNullable<EstadoDelMapa[K]> }>

  const claves = Object.keys(COMPLETO) as (keyof EstadoDelMapa)[]
  console.log(`       claves del estado: ${claves.join(', ')}`)

  // Cada control del mapa cambia UNA cosa. Las otras tienen que sobrevivir.
  for (const queCambia of claves) {
    const url = hrefDelMapa('/mapa', COMPLETO, {})
    const q = new URLSearchParams(url.split('?')[1] ?? '')
    caso(`${String(queCambia).padEnd(8)} sobrevive un href sin cambios`, q.has(queCambia), true)
  }

  // Y el ida y vuelta completo: cambiar el pintado no puede comerse el resto.
  const url = hrefDelMapa('/mapa', COMPLETO, { pintar: 'presencia' })
  const q = new URLSearchParams(url.split('?')[1] ?? '')
  caso('cambiar el pintado conserva alcance, campana y prov',
    [q.get('alcance'), q.get('campana'), q.get('prov')], ['marca:abc', 'camp-1', '2,6'])
  caso('y el default de pintado no se escribe', q.has('pintar'), false)

  // Cambiar las provincias conserva lo demás.
  const url2 = hrefDelMapa('/mapa', COMPLETO, { prov: [6] })
  const q2 = new URLSearchParams(url2.split('?')[1] ?? '')
  caso('cambiar provincias conserva alcance, campana y pintado',
    [q2.get('alcance'), q2.get('campana'), q2.get('pintar'), q2.get('prov')],
    ['marca:abc', 'camp-1', 'tipo', '6'])

  // Y deseleccionar todas borra la clave, no la deja vacía.
  const url3 = hrefDelMapa('/mapa', COMPLETO, { prov: [] })
  caso('deseleccionar todas saca prov de la URL',
    new URLSearchParams(url3.split('?')[1] ?? '').has('prov'), false)
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exit(fallos ? 1 : 0)
