/**
 * probar-mapa-pdv.ts — SOLO LÓGICA, sin base y sin browser.
 *
 * ESTE ARCHIVO EXISTE PARA QUE FALLE SI EL MAPA ESCONDE UN PDV.
 *
 * Hay dos formas de esconderlo y las dos se ven bien en pantalla:
 *
 *   1. TAPARLO. Sin agrupar, a la vista por defecto de Georgalos se ven 10
 *      pines de 58. No hay nada roto: hay diez pines nítidos que parecen ser
 *      todos. Es el bug que este módulo viene a cerrar.
 *   2. PERDERLO EN EL AGRUPAMIENTO. Un bucket mal armado se come puntos y
 *      tampoco se nota, porque lo que queda sigue siendo un mapa plausible.
 *
 * Y una tercera, más sutil: **esconder la minoría adentro del grupo**. Un grupo
 * de 6 con 4 presentes y 2 ausentes pintado de verde dice que ahí está todo
 * bien. Por eso el anillo va partido en tres.
 *
 *   npx tsx scripts/probar-mapa-pdv.ts
 */
import {
  proyectar, agruparEnMapa, encuadrar, anilloGrupo, colorPunto, textoGrupo,
  SEPARACION_PX, COLOR_PRESENCIA, decidirFallo, mensajeFallo, urlTile, MINIMO_FALLOS, hrefMapa,
  type PuntoMapa,
} from '../lib/mapa-pdv'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const pdv = (id: string, lat: number, lng: number, presente: boolean | null = true): PuntoMapa =>
  ({ id, nombre: id, lat, lng, presente, tipo: 'kiosco' })

/**
 * Coordenadas REALES de dev: los seis comercios de prueba que alguien cargó
 * parado en el mismo lugar, más dos de otro punto. Es el peor caso que existe
 * en la base y el que hace falta que funcione.
 */
const REALES: PuntoMapa[] = [
  pdv('LBK',               -32.24363820, -58.13516170, true),
  pdv('Almacen LB',        -32.24360940, -58.13520690, false),
  pdv('Nuevo Kiosco EN',   -32.22761350, -58.15141860, true),
  pdv('Alta Kiosco EN',    -32.22760180, -58.15142740, true),
  pdv('AutoSEN',           -32.22759350, -58.15139780, null),
  pdv('Nuevo almacen EN',  -32.22758060, -58.15139040, false),
  pdv('Kiosco ventana EN', -32.22757130, -58.15135290, true),
  pdv('Kiosco EN',         -32.22755680, -58.15136960, true),
]

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ NINGÚN PDV SE PIERDE — el invariante que sostiene todo')
// Se prueba a TODOS los zooms, porque el bucket cambia en cada uno y un error
// de redondeo podría comerse un punto solo en alguno.
{
  let mal = 0
  for (let z = 1; z <= 18; z++) {
    const grupos = agruparEnMapa(REALES, z)
    const total = grupos.reduce((s, g) => s + g.puntos.length, 0)
    const ids = new Set(grupos.flatMap(g => g.puntos.map(p => p.id)))
    if (total !== REALES.length || ids.size !== REALES.length) mal++
  }
  caso('del zoom 1 al 18, siempre salen los 8 puntos, sin repetir', mal, 0)

  caso('y los conteos de cada grupo suman sus puntos',
    agruparEnMapa(REALES, 10).every(g => g.presentes + g.ausentes + g.sinMedir === g.puntos.length),
    true)
}

console.log('\n▸ EL CASO REAL: seis comercios a menos de 11 metros')
{
  // A zoom de provincia los ocho son un solo pin.
  caso('a z8 los 8 son UN grupo', agruparEnMapa(REALES, 8).length, 1)
  caso('y ese grupo dice que son 8', agruparEnMapa(REALES, 8)[0].puntos.length, 8)

  // A zoom de ciudad se separan los dos racimos, pero no los de adentro.
  const z14 = agruparEnMapa(REALES, 14)
  caso('a z14 son DOS grupos: los 2 de un lado y los 6 del otro',
    z14.map(g => g.puntos.length), [6, 2])

  // Recién muy cerca se abren del todo.
  let zTodos = 0
  for (let z = 10; z <= 22; z++) {
    if (agruparEnMapa(REALES, z).length === REALES.length) { zTodos = z; break }
  }
  // Había puesto 19 a ojo y son 21. La corrección va en el test, no en el
  // código — y el número real es MÁS fuerte que el que había supuesto:
  // los proveedores de tiles llegan hasta z19 o z20, así que esos seis
  // comercios NO SE PUEDEN separar en ningún mapa. Sin agrupar no hay zoom al
  // que se vean: hay uno solo, para siempre.
  caso('se ven los 8 por separado recién a z21', zTodos, 21)
  caso('CONTROL — y eso está más allá del zoom máximo de los tiles (19-20)',
    zTodos > 20, true)
}

console.log('\n▸ LA MINORÍA NO SE ESCONDE')
{
  const mixto = agruparEnMapa(REALES, 14).find(g => g.puntos.length === 6)!
  caso('el grupo de 6: 4 presentes, 1 ausente, 1 sin medir',
    { p: mixto.presentes, a: mixto.ausentes, s: mixto.sinMedir }, { p: 4, a: 1, s: 1 })

  const anillo = anilloGrupo(mixto)
  caso('el anillo tiene los TRES colores', [
    anillo.includes(COLOR_PRESENCIA.presente),
    anillo.includes(COLOR_PRESENCIA.ausente),
    anillo.includes(COLOR_PRESENCIA.sinMedir),
  ], [true, true, true])
  caso('y cierra los 360 grados exactos',
    Number(anillo.match(/([\d.]+)deg\)$/)![1]), 360)
  caso('el texto los nombra a los tres',
    textoGrupo(mixto), '6 PDV · 4 con presencia · 1 sin presencia · 1 sin medir')

  // El control que importa: un grupo de un solo color NO puede salir tricolor.
  const puros = agruparEnMapa([pdv('a', -32, -58), pdv('b', -32.00001, -58.00001)], 12)[0]
  caso('CONTROL — un grupo todo presente es de un solo color',
    (anilloGrupo(puros).match(/deg/g) ?? []).length, 2)
}

console.log('\n▸ Un PDV solo no es un grupo disfrazado')
{
  const solo = agruparEnMapa([pdv('x', -32, -58, null)], 12)[0]
  caso('texto de uno sin medir', textoGrupo(solo), 'x — presencia sin medir')
  caso('texto de uno presente', textoGrupo(agruparEnMapa([pdv('y', -32, -58, true)], 12)[0]), 'y — con presencia')
  caso('texto de uno ausente', textoGrupo(agruparEnMapa([pdv('z', -32, -58, false)], 12)[0]), 'z — sin presencia')
  caso('color de uno sin medir', colorPunto(pdv('x', -32, -58, null)), COLOR_PRESENCIA.sinMedir)
}

console.log('\n▸ LA GRILLA ES DEL MUNDO, NO DE LA PANTALLA')
// Si la celda se calculara sobre coordenadas del viewport, arrastrar el mapa
// partiría grupos al azar y el mapa parpadearía mientras se panea. Acá el
// agrupamiento depende SOLO del zoom.
{
  const a = agruparEnMapa(REALES, 13).map(g => g.puntos.length)
  const b = agruparEnMapa([...REALES].reverse(), 13).map(g => g.puntos.length)
  caso('el orden de entrada no cambia los grupos', a, b)
  caso('dos llamadas al mismo zoom dan lo mismo',
    agruparEnMapa(REALES, 13).map(g => g.clave),
    agruparEnMapa(REALES, 13).map(g => g.clave))
}

console.log('\n▸ La proyección es Web Mercator, la misma de los tiles')
{
  // Puntos de control conocidos: el origen del mundo y el centro.
  const [x0, y0] = proyectar(0, -180, 0)
  caso('(0, -180) a z0 es la esquina', [Math.round(x0), Math.round(y0)], [0, 128])
  const [xc, yc] = proyectar(0, 0, 0)
  caso('(0, 0) a z0 es el centro', [Math.round(xc), Math.round(yc)], [128, 128])
  // Duplicar el zoom duplica las coordenadas.
  const [x1] = proyectar(-32, -58, 10)
  const [x2] = proyectar(-32, -58, 11)
  caso('un zoom más duplica la escala', Math.round(x2 / x1), 2)
}

console.log('\n▸ El encuadre')
{
  const { zoom, centro } = encuadrar(REALES, 900, 520)
  caso('los 8 entran en 900×520', agruparEnMapa(REALES, zoom).length <= REALES.length, true)
  caso('el centro está entre los puntos',
    centro[0] > Math.min(...REALES.map(p => p.lat)) && centro[0] < Math.max(...REALES.map(p => p.lat)),
    true)
  caso('un zoom más y ya no entran',
    (() => {
      const [x1, y1] = proyectar(Math.max(...REALES.map(p => p.lat)), Math.min(...REALES.map(p => p.lng)), zoom + 1)
      const [x2, y2] = proyectar(Math.min(...REALES.map(p => p.lat)), Math.max(...REALES.map(p => p.lng)), zoom + 1)
      return x2 - x1 > 900 || y2 - y1 > 520
    })(), true)
  caso('sin puntos, un encuadre de Argentina y no NaN',
    encuadrar([], 900, 520), { centro: [-32, -58.5], zoom: 6 })
  caso('un solo punto no pide zoom infinito', encuadrar([pdv('u', -32, -58)], 900, 520).zoom, 16)
}

console.log('\n▸ CONTROL — la separación es el ancho del marker')
caso('22 px', SEPARACION_PX, 22)
{
  // Dos puntos separados por exactamente una celda no se agrupan; por media, sí.
  const base = pdv('a', -32, -58)
  const [bx, by] = proyectar(base.lat, base.lng, 14)
  const grados = (dx: number) => (dx / (256 * 2 ** 14)) * 360
  caso('a 30 px de distancia son dos grupos',
    agruparEnMapa([base, pdv('b', -32, -58 + grados(30))], 14).length, 2)
  caso('a 5 px son uno solo',
    agruparEnMapa([base, pdv('b', -32, -58 + grados(5))], 14).length, 1)
  caso('CONTROL — la proyección devolvió algo usable', Number.isFinite(bx) && Number.isFinite(by), true)
}


// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL CARTEL — y el falso positivo que costó el primer uso real')
// La primera versión usaba una SONDA: pedía un tile aparte al montar y miraba
// su onerror. En dev, con la key real, los tiles cargaban, los puntos se veían
// y el cartel decía igual "el proveedor rechazó el pedido".
//
// La causa fue de método: una sonda prueba una request DISTINTA de la que hace
// el mapa. Y el control que yo había dado por bueno corrió contra una URL
// escrita a mano en un HTML de prueba, no contra la del componente — o sea que
// verificaba `new Image()`, no la sonda.
//
// Un aviso que aparece cuando no pasa nada es peor que no tener aviso.
{
  caso('EL CASO QUE FALLÓ: tiles cargando + alguno que falló → SIN cartel',
    decidirFallo({ hayKey: true, cargados: 12, fallidos: 4 }), null)
  caso('un solo tile cargado ya alcanza para no avisar',
    decidirFallo({ hayKey: true, cargados: 1, fallidos: 40 }), null)

  caso('nada carga y fallan varios → cartel',
    decidirFallo({ hayKey: true, cargados: 0, fallidos: MINIMO_FALLOS }), 'tiles_no_cargan')
  caso('un fallo suelto no alcanza: puede ser el borde del mundo',
    decidirFallo({ hayKey: true, cargados: 0, fallidos: 1 }), null)
  caso('dos tampoco', decidirFallo({ hayKey: true, cargados: 0, fallidos: 2 }), null)

  caso('recién montado, sin nada todavía: no parpadea',
    decidirFallo({ hayKey: true, cargados: 0, fallidos: 0 }), null)

  caso('sin key es OTRO problema y otro mensaje',
    decidirFallo({ hayKey: false, cargados: 0, fallidos: 0 }), 'sin_key')
  caso('y sin key manda aunque los tiles anduvieran',
    decidirFallo({ hayKey: false, cargados: 50, fallidos: 0 }), 'sin_key')
}

console.log('\n▸ Los dos mensajes mandan a lugares distintos')
{
  const sinKey = mensajeFallo('sin_key')
  const caidos = mensajeFallo('tiles_no_cargan')
  caso('el de sin key nombra la variable', sinKey.detalle.includes('NEXT_PUBLIC_GEOAPIFY_KEY'), true)
  caso('el de tiles caídos NO la nombra: se arregla en otro lado',
    caidos.detalle.includes('NEXT_PUBLIC_GEOAPIFY_KEY'), false)
  caso('y nombra las tres causas reales',
    ['clave', 'dominio', 'cuota'].every(t => caidos.detalle.includes(t)), true)
  caso('los dos aclaran que los DATOS están bien',
    [sinKey.detalle, caidos.detalle].every(d => d.includes('datos')), true)
}

console.log('\n▸ La URL del tile')
{
  const u = urlTile(1372, 2401, 12, 'K')
  caso('lleva la key', u.includes('apiKey=K'), true)
  caso('sin dpr no pide @2x', u.includes('@2x'), false)
  caso('con dpr 2 sí', urlTile(1372, 2401, 12, 'K', 2).includes('@2x'), true)
  caso('con dpr 1 no', urlTile(1372, 2401, 12, 'K', 1).includes('@2x'), false)
  caso('una key con caracteres raros se escapa',
    urlTile(1, 1, 1, 'a b&c').includes('a%20b%26c'), true)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Los links de los controles conservan lo que la ruta ya trae')
// El bug que esto previene ya pasó una vez, en `hrefPunto` de la serie: un `?`
// fijo se comía el `?alcance=` del panel de la distribuidora y la pantalla
// volvía al estado sin elegir. El mapa de la distri tiene la misma forma y
// encima dos controles que se combinan, así que acá la superficie es mayor.
{
  caso('ruta pelada, un parámetro',
    hrefMapa('/marca/mapa', { campana: 'c1' }), '/marca/mapa?campana=c1')
  caso('ruta pelada, dos',
    hrefMapa('/marca/mapa', { campana: 'c1', pintar: 'tipo' }),
    '/marca/mapa?campana=c1&pintar=tipo')

  // EL CONTROL QUE IMPORTA.
  caso('la ruta con alcance NO lo pierde',
    hrefMapa('/distribuidora/mapa?alcance=m1', { campana: 'c1' }),
    '/distribuidora/mapa?alcance=m1&campana=c1')
  caso('ni cambiando el otro control',
    hrefMapa('/distribuidora/mapa?alcance=m1', { pintar: 'tipo' }),
    '/distribuidora/mapa?alcance=m1&pintar=tipo')
  caso('ni con los dos a la vez',
    hrefMapa('/distribuidora/mapa?alcance=m1', { campana: 'c1', pintar: 'tipo' }),
    '/distribuidora/mapa?alcance=m1&campana=c1&pintar=tipo')

  console.log('\n▸ Y el valor por default BORRA el parámetro')
  // "Todos mis PDV" y "Presencia" no son valores: son la ausencia del filtro.
  // Dejarlos como `?campana=` haría que la URL diga que hay un filtro puesto.
  caso('null borra',
    hrefMapa('/distribuidora/mapa?alcance=m1&campana=c1', { campana: null }),
    '/distribuidora/mapa?alcance=m1')
  caso('cadena vacía también',
    hrefMapa('/distribuidora/mapa?alcance=m1&campana=c1', { campana: '' }),
    '/distribuidora/mapa?alcance=m1')
  caso('undefined también',
    hrefMapa('/marca/mapa?pintar=tipo', { pintar: undefined }), '/marca/mapa')
  caso('borrar el último deja la ruta pelada, sin "?"',
    hrefMapa('/marca/mapa?campana=c1', { campana: null }), '/marca/mapa')

  console.log('\n▸ Reemplaza, no acumula')
  caso('un parámetro que ya estaba se pisa',
    hrefMapa('/marca/mapa?campana=vieja', { campana: 'nueva' }), '/marca/mapa?campana=nueva')
  caso('y no queda repetido',
    hrefMapa('/marca/mapa?campana=vieja', { campana: 'nueva' }).split('campana=').length - 1, 1)

  console.log('\n▸ Escapado')
  caso('un valor con caracteres raros se escapa',
    hrefMapa('/marca/mapa', { campana: 'a b&c=d' }), '/marca/mapa?campana=a+b%26c%3Dd')
  caso('y un alcance ya escapado en la base no se rompe',
    hrefMapa('/distribuidora/mapa?alcance=a%2Bb', { pintar: 'tipo' }),
    '/distribuidora/mapa?alcance=a%2Bb&pintar=tipo')
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
