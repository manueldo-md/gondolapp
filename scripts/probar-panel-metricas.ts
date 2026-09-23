/**
 * probar-panel-metricas.ts — SOLO LÓGICA, sin base.
 *
 * ESTE ARCHIVO EXISTE PARA QUE FALLE SI UN NÚMERO DEL PANEL ES UNA MENTIRA
 * PLAUSIBLE.
 *
 * Todo lo que este archivo protege tiene la misma forma: un número equivocado
 * que se ve perfectamente razonable en el gráfico. Nadie lo va a descubrir
 * mirando.
 *
 *   1. EL PROMEDIO PONDERADO. Dos campañas del mismo mes, una de 23 PDV y otra
 *      de 2. Promediar sus promedios le da a la de 2 el mismo peso que a la de
 *      23. Sale un precio que no es el de ninguna de las dos y que igual se
 *      dibuja lindo.
 *
 *   2. base_pdv NO SE SUMA. Es un COUNT(DISTINCT comercio): un comercio medido
 *      por dos campañas el mismo mes cuenta una vez en el total y una vez en
 *      cada desglose. Sumar los desgloses infla la base de cálculo — que es
 *      justo el número que este panel existe para no falsear.
 *
 *   3. EL EJE CONTINUO. Si el eje tuviera solo los meses con datos, abril y
 *      septiembre quedarían pegados y el hueco de cuatro meses desaparecería.
 *      Es la misma mentira que interpolar, contada de otra forma.
 *
 *   4. LOS STRINGS. `count(*)` es bigint y los promedios son numeric: los dos
 *      pueden llegar como string. `'23' + '2'` da `'232'`, un número plausible.
 *
 * ── TIENE QUE CORRER CON TZ=UTC, Y POR ESO SE EXIGE ─────────────────────────
 * Igual que probar-formato-ar.ts: la etiqueta del mes pasa por Intl, y en una
 * máquina argentina un formateo roto devuelve el mes correcto por casualidad.
 *
 *   npx tsx scripts/probar-panel-metricas.ts
 */
import {
  armarPanel, rangoDeMeses, etiquetaMes, valorDeFila, unidadDe,
  textoBase, formatearValor, huecosDe, resumenDe, textoPeriodo,
  tramosContinuos, comerciosCompartidos, agruparCobertura, textoBaseCobertura,
  type FilaPdv,
  type FilaSerie, type FilaVisitas, type PuntoSerie,
} from '../lib/panel-metricas'

process.env.TZ = 'UTC'

const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
if (zona !== 'UTC') {
  console.error(`\n✗ No se pudo poner el proceso en UTC (quedó en "${zona}").\n` +
    `  Sin eso esta prueba da un FALSO VERDE.\n` +
    `  Correla con: TZ=UTC npx tsx scripts/probar-panel-metricas.ts\n`)
  process.exit(1)
}

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

/** Una fila del RPC con lo mínimo escrito a mano. */
function fila(p: Partial<FilaSerie> & Pick<FilaSerie, 'mes' | 'metrica_slug'>): FilaSerie {
  return {
    metrica_nombre: p.metrica_slug,
    tipo_respuesta: 'numero',
    orden: 1,
    campana_id: null,
    campana_nombre: null,
    fuente: null,
    observaciones: 0,
    base_pdv: 0,
    obs_con_valor: 0,
    suma_numerica: null,
    verdaderos: 0,
    ...p,
  }
}

const punto = (s: ReturnType<typeof armarPanel>, slug: string, mes: string) =>
  s.series.find(x => x.slug === slug)?.puntos.find(p => p.mes === mes)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL PROMEDIO PONDERADO — el número que se ve bien y está mal')
// Georgalos, abril: una campaña de 23 PDV a $3.779 promedio y otra de 2 a
// $500. Promediar los dos promedios daría $2.140. El promedio real es $3.516.
{
  const GRANDE = { obs: 23, suma: 86920 }   // 3779,13 de promedio
  const CHICA  = { obs: 2,  suma: 1000  }   // 500 de promedio
  const p = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 25, base_pdv: 25,
           obs_con_valor: 25, suma_numerica: GRANDE.suma + CHICA.suma }),
    fila({ mes: '2026-04', metrica_slug: 'precio', campana_id: 'c1', campana_nombre: 'Auditoría',
           fuente: 'respuestas', observaciones: GRANDE.obs, base_pdv: GRANDE.obs,
           obs_con_valor: GRANDE.obs, suma_numerica: GRANDE.suma }),
    fila({ mes: '2026-04', metrica_slug: 'precio', campana_id: 'c2', campana_nombre: 'Piloto chico',
           fuente: 'respuestas', observaciones: CHICA.obs, base_pdv: CHICA.obs,
           obs_con_valor: CHICA.obs, suma_numerica: CHICA.suma }),
  ] })

  const real = punto(p, 'precio', '2026-04')!.valor!
  const promedioDePromedios = (GRANDE.suma / GRANDE.obs + CHICA.suma / CHICA.obs) / 2

  caso('el punto es suma/observaciones', Math.round(real), Math.round(87920 / 25))
  caso('CONTROL — y NO es el promedio de los dos promedios',
    Math.round(real) === Math.round(promedioDePromedios), false)
  caso('la diferencia entre las dos cuentas es enorme, no un redondeo',
    Math.abs(real - promedioDePromedios) > 1000, true)
  caso('cada campaña del desglose conserva SU promedio',
    punto(p, 'precio', '2026-04')!.desglose.map(d => Math.round(d.valor!)), [3779, 500])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ base_pdv NO se suma')
// Dos campañas midieron 8 y 6 PDV el mismo mes, pero 4 comercios los visitaron
// las dos: son 10 PDV, no 14. Solo SQL lo sabe, y por eso manda la fila de total.
{
  const p = armarPanel({ series: [
    fila({ mes: '2026-05', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
           observaciones: 14, base_pdv: 10, obs_con_valor: 14, verdaderos: 7 }),
    fila({ mes: '2026-05', metrica_slug: 'presencia', tipo_respuesta: 'binaria', campana_id: 'a',
           campana_nombre: 'A', fuente: 'respuestas', observaciones: 8, base_pdv: 8,
           obs_con_valor: 8, verdaderos: 4 }),
    fila({ mes: '2026-05', metrica_slug: 'presencia', tipo_respuesta: 'binaria', campana_id: 'b',
           campana_nombre: 'B', fuente: 'respuestas', observaciones: 6, base_pdv: 6,
           obs_con_valor: 6, verdaderos: 3 }),
  ] })
  const pt = punto(p, 'presencia', '2026-05')!
  caso('la base es la del total: 10', pt.basePdv, 10)
  caso('CONTROL — sumar el desglose daría 14',
    pt.desglose.reduce((s, d) => s + d.basePdv, 0), 14)
  caso('el texto dice la base verdadera', textoBase(pt), '14 observaciones en 10 PDV')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Un mes SIN su fila de total se ignora, no se reconstruye')
// Rearmarlo desde el desglose daría la base inflada de arriba. Es preferible
// que el mes no exista a que exista con un número que nadie puede defender.
{
  const p = armarPanel({ series: [
    fila({ mes: '2026-06', metrica_slug: 'presencia', tipo_respuesta: 'binaria', campana_id: 'a',
           campana_nombre: 'A', fuente: 'respuestas', observaciones: 8, base_pdv: 8,
           obs_con_valor: 8, verdaderos: 4 }),
  ] })
  caso('la serie no aparece', p.series.length, 0)
  caso('y el panel se declara vacío', p.vacio, true)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Regla 1 — una métrica sin observaciones no se dibuja')
{
  const p = armarPanel({
    series: [
      fila({ mes: '2026-04', metrica_slug: 'presencia', tipo_respuesta: 'binaria', orden: 1,
             observaciones: 8, base_pdv: 8, obs_con_valor: 8, verdaderos: 4 }),
      // Cero observaciones: existe la fila pero no hay nada medido.
      fila({ mes: '2026-04', metrica_slug: 'frentes', orden: 3, observaciones: 0 }),
    ],
    metricas: [
      { slug: 'presencia', nombre: 'Presencia' },
      { slug: 'quiebre_stock', nombre: 'Quiebre de stock' },
      { slug: 'frentes', nombre: 'Frentes' },
    ],
  })
  caso('solo entra la que tiene datos', p.series.map(s => s.slug), ['presencia'])
  caso('y las otras se pueden nombrar al pie',
    p.noMedidas.map(m => m.nombre), ['Quiebre de stock', 'Frentes'])
  caso('sin catálogo, noMedidas queda vacío y nada se rompe',
    armarPanel({ series: [fila({ mes: '2026-04', metrica_slug: 'presencia', observaciones: 1,
                                 obs_con_valor: 1, base_pdv: 1 })] }).noMedidas, [])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Regla 2 — el mes sin datos corta la línea, pero sigue en el eje')
// El caso real de Georgalos: precio en abril y en septiembre, nada en el medio.
{
  const p = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 23, base_pdv: 23,
           obs_con_valor: 23, suma_numerica: 86920 }),
    fila({ mes: '2026-09', metrica_slug: 'precio', observaciones: 2, base_pdv: 2,
           obs_con_valor: 2, suma_numerica: 5380 }),
  ] })
  caso('el eje va de abril a septiembre, sin saltearse nada',
    p.meses, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  caso('CONTROL — pero la serie tiene DOS puntos, no seis',
    p.series[0].puntos.map(x => x.mes), ['2026-04', '2026-09'])
  caso('los meses del medio no existen como punto en cero',
    punto(p, 'precio', '2026-06'), undefined)
  caso('y el hueco se puede nombrar',
    huecosDe(p.series[0], p.meses), ['2026-05', '2026-06', '2026-07', '2026-08'])
}

console.log('\n▸ DÓNDE SE CORTA LA LÍNEA')
// La regla que el gráfico aplica. Un bug acá dibuja una recta entre abril y
// septiembre: cinco mediciones que nadie hizo, y NADA en pantalla delata que
// son inventadas. Es el error más caro del tramo y el más difícil de ver.
//
// Con los datos de prod del 23/9 este código no se ejercita: ninguna serie
// tiene dos meses consecutivos, así que el render real no dibuja ni una sola
// polyline. Estos casos son lo único que lo cubre.
{
  const serieCon = (mesesConDatos: string[], eje: string[]) => {
    const p = armarPanel({ series: mesesConDatos.map(mes =>
      fila({ mes, metrica_slug: 'precio', observaciones: 1, base_pdv: 1,
             obs_con_valor: 1, suma_numerica: 100 })) })
    return { serie: p.series[0], eje }
  }
  const EJE = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']

  const { serie: seguidos } = serieCon(['2026-01', '2026-02', '2026-03'], EJE)
  caso('tres meses seguidos: UN solo tramo',
    tramosContinuos(seguidos, EJE), [[0, 1, 2]])

  const { serie: conHueco } = serieCon(['2026-01', '2026-04'], EJE)
  caso('con un hueco en el medio: DOS tramos, y no se cruza',
    tramosContinuos(conHueco, EJE), [[0], [3]])

  const { serie: dosYdos } = serieCon(['2026-01', '2026-02', '2026-04', '2026-05'], EJE)
  caso('dos rachas de a dos: dos tramos',
    tramosContinuos(dosYdos, EJE), [[0, 1], [3, 4]])

  caso('CONTROL — los índices son del EJE, no de los puntos',
    tramosContinuos(conHueco, EJE).flat(), [0, 3])

  const { serie: uno } = serieCon(['2026-03'], EJE)
  caso('un solo mes: un tramo de un punto (el que dibuja pone un círculo)',
    tramosContinuos(uno, EJE), [[2]])
}

console.log('\n▸ Un punto sin valor corta igual que un mes ausente')
// Tiene observaciones pero no tiene altura: no se puede dibujar. Si se colara,
// el gráfico lo pondría en el cero del eje — "medimos y dio cero", que es lo
// contrario de lo que pasó.
{
  const EJE = ['2026-01', '2026-02', '2026-03']
  const p = armarPanel({ series: [
    fila({ mes: '2026-01', metrica_slug: 'precio', observaciones: 1, base_pdv: 1,
           obs_con_valor: 1, suma_numerica: 100 }),
    // Observaciones sí, valor usable no.
    fila({ mes: '2026-02', metrica_slug: 'precio', observaciones: 3, base_pdv: 3,
           obs_con_valor: 0 }),
    fila({ mes: '2026-03', metrica_slug: 'precio', observaciones: 1, base_pdv: 1,
           obs_con_valor: 1, suma_numerica: 200 }),
  ] })
  caso('el mes sin valor no entra en ningún tramo',
    tramosContinuos(p.series[0], EJE), [[0], [2]])
  caso('CONTROL — pero el punto existe y conserva sus observaciones',
    punto(p, 'precio', '2026-02')!.observaciones, 3)
  caso('y su valor es null, no 0', punto(p, 'precio', '2026-02')!.valor, null)
}

console.log('\n▸ Un mes de solo visitas también estira el eje')
// 15 PDV visitados en marzo sin medir ninguna métrica es parte de la historia:
// si marzo no estuviera en el eje, abril y el punto anterior se acercarían.
{
  const p = armarPanel({
    series: [fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 8, base_pdv: 8,
                    obs_con_valor: 8, suma_numerica: 800 })],
    visitas: [{ mes: '2026-03', pdv_visitados: 15, misiones: 15 },
              { mes: '2026-04', pdv_visitados: 8,  misiones: 8  }],
  })
  caso('marzo entra al eje aunque no tenga ninguna medición',
    p.meses, ['2026-03', '2026-04'])
  caso('pero no produce ningún punto', p.series[0].puntos.length, 1)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ La base de cálculo, en sus tres formas')
{
  const base = (o: Partial<PuntoSerie>): PuntoSerie => ({
    mes: '2026-04', etiqueta: 'abr 2026', valor: 50,
    observaciones: 56, basePdv: 56, pdvVisitados: null, desglose: [], ...o,
  })
  caso('sin brecha y sin revisitas',
    textoBase(base({})), 'sobre 56 PDV')
  caso('con revisitas',
    textoBase(base({ observaciones: 12, basePdv: 9 })), '12 observaciones en 9 PDV')
  caso('con brecha: 7 visitas no midieron esta métrica',
    textoBase(base({ observaciones: 8, basePdv: 8, pdvVisitados: 15 })),
    'sobre 8 de 15 PDV visitados')
  caso('con las dos cosas a la vez',
    textoBase(base({ observaciones: 12, basePdv: 9, pdvVisitados: 15 })),
    '12 observaciones en 9 de 15 PDV visitados')
  caso('una sola observación no dice "1 observaciones"',
    textoBase(base({ observaciones: 1, basePdv: 2 })), '1 observacion en 2 PDV')
  caso('visitados igual a la base no es una brecha',
    textoBase(base({ pdvVisitados: 56 })), 'sobre 56 PDV')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ El valor de un punto')
caso('binaria da porcentaje',
  valorDeFila(fila({ mes: '2026-04', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
                     observaciones: 12, obs_con_valor: 12, verdaderos: 8 })), (8 / 12) * 100)
caso('numero da promedio',
  valorDeFila(fila({ mes: '2026-04', metrica_slug: 'frentes', observaciones: 8,
                     obs_con_valor: 8, suma_numerica: 26 })), 26 / 8)
caso('una métrica que el código no conoce no se agrega sola',
  unidadDe('seleccion_multiple'), 'crudo')
caso('y su valor es null, no un cero',
  valorDeFila(fila({ mes: '2026-04', metrica_slug: 'rara', tipo_respuesta: 'texto',
                     observaciones: 5, obs_con_valor: 5 })), null)

console.log('\n▸ Cero observaciones con valor: null, NUNCA 0%')
// Es el caso de Suprante al revés. Un 0% dibujado dice "medimos y no había";
// un hueco dice "no medimos". No son lo mismo y el gráfico no puede confundirlos.
caso('binaria sin valores usables',
  valorDeFila(fila({ mes: '2026-04', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
                     observaciones: 3, obs_con_valor: 0, verdaderos: 0 })), null)
caso('numero sin valores usables',
  valorDeFila(fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 3,
                     obs_con_valor: 0, suma_numerica: null })), null)
caso('la observación igual cuenta, aunque no tenga valor',
  punto(armarPanel({ series: [fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 3,
                                     base_pdv: 3, obs_con_valor: 0 })] }), 'precio', '2026-04')!
    .observaciones, 3)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ LOS STRINGS — bigint y numeric pueden llegar así')
{
  // Las mismas dos filas, una con números y otra con strings.
  const conNumeros = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 23, base_pdv: 23,
           obs_con_valor: 23, suma_numerica: 86920, orden: 4 }),
  ] })
  const conStrings = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: '23', base_pdv: '23',
           obs_con_valor: '23', suma_numerica: '86920.0000000000000000', orden: '4' }),
  ] })
  caso('dan exactamente lo mismo', conStrings, conNumeros)
  caso('CONTROL — y si se concatenaran, esto sería otra cosa',
    punto(conStrings, 'precio', '2026-04')!.observaciones, 23)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ El eje, sin pasar por Date')
caso('un solo mes', rangoDeMeses(['2026-03']), ['2026-03'])
caso('cruza el año', rangoDeMeses(['2025-11', '2026-02']),
  ['2025-11', '2025-12', '2026-01', '2026-02'])
caso('desordenado da lo mismo', rangoDeMeses(['2026-02', '2025-11']),
  rangoDeMeses(['2025-11', '2026-02']))
caso('vacío da vacío', rangoDeMeses([]), [])
caso('basura no entra al eje', rangoDeMeses(['no-es-un-mes', '2026-03']), ['2026-03'])
caso('un mes 13 tampoco', rangoDeMeses(['2026-13', '2026-03']), ['2026-03'])

console.log('\n▸ La etiqueta del mes no se corre — el bug del tramo C\'')
// Enero y diciembre son los que se caen de año si alguien mete un Date crudo.
caso('marzo', etiquetaMes('2026-03'), 'mar 2026')
caso('enero NO dice diciembre del año anterior', etiquetaMes('2026-01'), 'ene 2026')
caso('diciembre NO dice noviembre', etiquetaMes('2026-12'), 'dic 2026')
caso('un mes inválido no inventa nada', etiquetaMes('2026-00'), '—')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ El formato del valor')
caso('porcentaje redondeado', formatearValor((8 / 12) * 100, 'porcentaje'), '67%')
caso('precio grande sin decimales', formatearValor(3779.13, 'promedio'), '3.779')
caso('frentes con un decimal', formatearValor(3.25, 'promedio'), '3,3')
caso('sin valor, una raya y no un cero', formatearValor(null, 'porcentaje'), '—')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Orden y forma de la salida')
{
  const p = armarPanel({ series: [
    fila({ mes: '2026-09', metrica_slug: 'precio', orden: 4, observaciones: 2, base_pdv: 2,
           obs_con_valor: 2, suma_numerica: 5380 }),
    fila({ mes: '2026-04', metrica_slug: 'precio', orden: 4, observaciones: 23, base_pdv: 23,
           obs_con_valor: 23, suma_numerica: 86920 }),
    fila({ mes: '2026-04', metrica_slug: 'presencia', tipo_respuesta: 'binaria', orden: 1,
           observaciones: 8, base_pdv: 8, obs_con_valor: 8, verdaderos: 4 }),
  ] })
  caso('las métricas salen en el orden del catálogo, no el de llegada',
    p.series.map(s => s.slug), ['presencia', 'precio'])
  caso('los puntos salen cronológicos aunque lleguen al revés',
    p.series.find(s => s.slug === 'precio')!.puntos.map(x => x.mes), ['2026-04', '2026-09'])
  caso('las etiquetas del eje acompañan a los meses',
    p.etiquetas.length, p.meses.length)
  caso('el total de observaciones suma los puntos',
    p.series.find(s => s.slug === 'precio')!.totalObservaciones, 25)
}

console.log('\n▸ El desglose viene ordenado por peso')
{
  const p = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 25, base_pdv: 25,
           obs_con_valor: 25, suma_numerica: 87920 }),
    fila({ mes: '2026-04', metrica_slug: 'precio', campana_id: 'chica', campana_nombre: 'Chica',
           fuente: 'respuestas', observaciones: 2, base_pdv: 2, obs_con_valor: 2, suma_numerica: 1000 }),
    fila({ mes: '2026-04', metrica_slug: 'precio', campana_id: 'grande', campana_nombre: 'Grande',
           fuente: 'respuestas', observaciones: 23, base_pdv: 23, obs_con_valor: 23, suma_numerica: 86920 }),
  ] })
  caso('la campaña que más aporta va primero',
    punto(p, 'precio', '2026-04')!.desglose.map(d => d.campanaNombre), ['Grande', 'Chica'])
  caso('y cada una dice de qué fuente sale',
    punto(p, 'precio', '2026-04')!.desglose.every(d => d.fuente === 'respuestas'), true)
}

console.log('\n▸ LOS PDV DEL DESGLOSE PUEDEN SUMAR MÁS QUE LOS DEL MES')
// Al abrir un punto, el lector hace la resta. Si no cierra y nadie lo explica,
// el número de arriba pasa a ser sospechoso — y es el correcto. Un comercio
// relevado por dos campañas cuenta una vez en el total y una vez en cada fila.
//
// Con los datos del 24/9/2026 NINGÚN punto tiene dos campañas, así que esto no
// se ejercita ni una vez en el render real. Mismo hueco que la polyline.
{
  const conSolape = armarPanel({ series: [
    fila({ mes: '2026-05', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
           observaciones: 14, base_pdv: 10, obs_con_valor: 14, verdaderos: 7 }),
    fila({ mes: '2026-05', metrica_slug: 'presencia', tipo_respuesta: 'binaria', campana_id: 'a',
           campana_nombre: 'A', fuente: 'respuestas', observaciones: 8, base_pdv: 8,
           obs_con_valor: 8, verdaderos: 4 }),
    fila({ mes: '2026-05', metrica_slug: 'presencia', tipo_respuesta: 'binaria', campana_id: 'b',
           campana_nombre: 'B', fuente: 'respuestas', observaciones: 6, base_pdv: 6,
           obs_con_valor: 6, verdaderos: 3 }),
  ] })
  caso('8 + 6 sobre un mes de 10: hay 4 comercios compartidos',
    comerciosCompartidos(punto(conSolape, 'presencia', '2026-05')!), 4)

  const sinSolape = armarPanel({ series: [
    fila({ mes: '2026-05', metrica_slug: 'precio', observaciones: 25, base_pdv: 25,
           obs_con_valor: 25, suma_numerica: 1000 }),
    fila({ mes: '2026-05', metrica_slug: 'precio', campana_id: 'a', campana_nombre: 'A',
           fuente: 'respuestas', observaciones: 23, base_pdv: 23, obs_con_valor: 23, suma_numerica: 900 }),
    fila({ mes: '2026-05', metrica_slug: 'precio', campana_id: 'b', campana_nombre: 'B',
           fuente: 'respuestas', observaciones: 2, base_pdv: 2, obs_con_valor: 2, suma_numerica: 100 }),
  ] })
  caso('CONTROL — sin solape da 0 y no se dice nada',
    comerciosCompartidos(punto(sinSolape, 'precio', '2026-05')!), 0)

  // El caso de prod: un solo desglose, que no puede solapar con nada.
  const unaSola = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 23, base_pdv: 23,
           obs_con_valor: 23, suma_numerica: 86920 }),
    fila({ mes: '2026-04', metrica_slug: 'precio', campana_id: 'a', campana_nombre: 'Auditoría',
           fuente: 'respuestas', observaciones: 23, base_pdv: 23, obs_con_valor: 23, suma_numerica: 86920 }),
  ] })
  caso('una sola campaña: 0', comerciosCompartidos(punto(unaSola, 'precio', '2026-04')!), 0)

  // Nunca negativo: un desglose incompleto no puede producir una frase al revés.
  const incompleto = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 25, base_pdv: 25,
           obs_con_valor: 25, suma_numerica: 1000 }),
    fila({ mes: '2026-04', metrica_slug: 'precio', campana_id: 'a', campana_nombre: 'A',
           fuente: 'respuestas', observaciones: 2, base_pdv: 2, obs_con_valor: 2, suma_numerica: 100 }),
  ] })
  caso('desglose incompleto: 0, nunca negativo',
    comerciosCompartidos(punto(incompleto, 'precio', '2026-04')!), 0)
}

console.log('\n▸ Las dos fuentes de Presencia conviven en el mismo punto')
// Hoy no se pisan —la declaración es marzo, las respuestas abril y septiembre—
// pero el panel no puede asumirlo. El total suma las dos; el desglose las separa.
{
  const p = armarPanel({ series: [
    fila({ mes: '2026-03', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
           observaciones: 64, base_pdv: 64, obs_con_valor: 64, verdaderos: 49 }),
    fila({ mes: '2026-03', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
           campana_id: 'piloto', campana_nombre: 'Piloto', fuente: 'declaracion_foto',
           observaciones: 56, base_pdv: 56, obs_con_valor: 56, verdaderos: 45 }),
    fila({ mes: '2026-03', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
           campana_id: 'nueva', campana_nombre: 'Nueva', fuente: 'respuestas',
           observaciones: 8, base_pdv: 8, obs_con_valor: 8, verdaderos: 4 }),
  ] })
  const pt = punto(p, 'presencia', '2026-03')!
  caso('un solo punto para las dos fuentes', formatearValor(pt.valor, 'porcentaje'), '77%')
  caso('y el desglose las distingue',
    pt.desglose.map(d => d.fuente), ['declaracion_foto', 'respuestas'])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ LOS NÚMEROS DE PRODUCCIÓN, tal como los devuelve el RPC')
// Copiados de la salida real medida el 23/9/2026. Si el rollup se desvía, acá
// se ve con los números que el usuario ya vio en pantalla.
{
  const georgalos: FilaSerie[] = [
    fila({ mes: '2026-03', metrica_slug: 'presencia', metrica_nombre: 'Presencia',
           tipo_respuesta: 'binaria', orden: 1, observaciones: 56, base_pdv: 56,
           obs_con_valor: 56, verdaderos: 45 }),
    fila({ mes: '2026-04', metrica_slug: 'precio', metrica_nombre: 'Precio', orden: 4,
           observaciones: 23, base_pdv: 23, obs_con_valor: 23, suma_numerica: 86920 }),
    fila({ mes: '2026-09', metrica_slug: 'precio', metrica_nombre: 'Precio', orden: 4,
           observaciones: 2, base_pdv: 2, obs_con_valor: 2, suma_numerica: 5380 }),
  ]
  const visitas: FilaVisitas[] = [
    { mes: '2026-03', pdv_visitados: 56, misiones: 56 },
    { mes: '2026-04', pdv_visitados: 23, misiones: 23 },
    { mes: '2026-09', pdv_visitados: 2,  misiones: 2  },
  ]
  const p = armarPanel({ series: georgalos, visitas })

  caso('presencia de marzo: 80%',
    formatearValor(punto(p, 'presencia', '2026-03')!.valor, 'porcentaje'), '80%')
  caso('y su base son los 56 PDV del piloto',
    textoBase(punto(p, 'presencia', '2026-03')!), 'sobre 56 PDV')
  caso('precio de abril',
    formatearValor(punto(p, 'precio', '2026-04')!.valor, 'promedio'), '3.779')
  caso('precio de septiembre',
    formatearValor(punto(p, 'precio', '2026-09')!.valor, 'promedio'), '2.690')
  // Esto es lo que el tramo vino a hacer visible: el "salto" de precio de
  // abril a septiembre se apoya en 23 PDV contra 2.
  caso('y la caída de la base queda dicha',
    [textoBase(punto(p, 'precio', '2026-04')!), textoBase(punto(p, 'precio', '2026-09')!)],
    ['sobre 23 PDV', 'sobre 2 PDV'])
  caso('el eje muestra los siete meses, no tres',
    p.meses.length, 7)
}

console.log('\n▸ Suprante: el caso que hoy la pantalla muestra como 0%')
{
  const p = armarPanel({
    series: [
      fila({ mes: '2026-04', metrica_slug: 'presencia', metrica_nombre: 'Presencia',
             tipo_respuesta: 'binaria', orden: 1, observaciones: 8, base_pdv: 8,
             obs_con_valor: 8, verdaderos: 4 }),
      fila({ mes: '2026-09', metrica_slug: 'presencia', metrica_nombre: 'Presencia',
             tipo_respuesta: 'binaria', orden: 1, observaciones: 3, base_pdv: 3,
             obs_con_valor: 3, verdaderos: 3 }),
      fila({ mes: '2026-04', metrica_slug: 'frentes', metrica_nombre: 'Frentes', orden: 3,
             observaciones: 8, base_pdv: 8, obs_con_valor: 8, suma_numerica: 26 }),
      fila({ mes: '2026-09', metrica_slug: 'frentes', metrica_nombre: 'Frentes', orden: 3,
             observaciones: 3, base_pdv: 3, obs_con_valor: 3, suma_numerica: 22 }),
    ],
    visitas: [
      { mes: '2026-03', pdv_visitados: 15, misiones: 15 },
      { mes: '2026-04', pdv_visitados: 8,  misiones: 8  },
      { mes: '2026-09', pdv_visitados: 3,  misiones: 3  },
    ],
    metricas: [
      { slug: 'presencia', nombre: 'Presencia' }, { slug: 'quiebre_stock', nombre: 'Quiebre de stock' },
      { slug: 'frentes', nombre: 'Frentes' }, { slug: 'precio', nombre: 'Precio' },
      { slug: 'exhibicion_pop', nombre: 'Exhibición / POP' },
    ],
  })
  caso('presencia NO es 0%: es 50% en abril y 100% en septiembre',
    p.series.find(s => s.slug === 'presencia')!.puntos
      .map(x => formatearValor(x.valor, 'porcentaje')), ['50%', '100%'])
  caso('frentes: 3,3 y 7,3',
    p.series.find(s => s.slug === 'frentes')!.puntos
      .map(x => formatearValor(x.valor, 'promedio')), ['3,3', '7,3'])
  caso('precio y las otras dos no se dibujan',
    p.noMedidas.map(m => m.slug), ['quiebre_stock', 'precio', 'exhibicion_pop'])
  caso('marzo entra al eje: 15 PDV visitados sin medir nada',
    p.meses[0], '2026-03')
  // En abril midieron los 8 que se visitaron: no hay brecha que contar, y el
  // texto no la inventa. La brecha de marzo no aparece porque marzo no tiene
  // punto — es un hueco, no un punto con base cero.
  caso('abril no inventa una brecha que no existe',
    textoBase(punto(p, 'presencia', '2026-04')!), 'sobre 8 PDV')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL RESUMEN GLOBAL — el número de la tarjeta')
// Es el mismo error que el del punto, un nivel más arriba: promediar los
// porcentajes de los meses le da a un mes de 3 observaciones el mismo peso que
// a uno de 8. Lo que se suma son las observaciones, no los porcentajes.
{
  // Suprante en prod: 4 de 8 en abril, 3 de 3 en septiembre.
  const p = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'presencia', metrica_nombre: 'Presencia',
           tipo_respuesta: 'binaria', orden: 1, observaciones: 8, base_pdv: 8,
           obs_con_valor: 8, verdaderos: 4 }),
    fila({ mes: '2026-09', metrica_slug: 'presencia', metrica_nombre: 'Presencia',
           tipo_respuesta: 'binaria', orden: 1, observaciones: 3, base_pdv: 3,
           obs_con_valor: 3, verdaderos: 3 }),
  ] })
  const r = resumenDe(p.series[0])!

  caso('la tarjeta dice 64%', formatearValor(r.valor, 'porcentaje'), '64%')
  caso('CONTROL — promediar los dos meses daría 75%, que no es el de nadie',
    formatearValor((50 + 100) / 2, 'porcentaje'), '75%')
  caso('el denominador son las observaciones, no los meses',
    { verdaderos: r.verdaderos, conValor: r.conValor }, { verdaderos: 7, conValor: 11 })
  caso('y dice de qué período habla', textoPeriodo(r), 'abr – sept 2026')
  caso('con dos meses medidos', r.mesesConDatos, 2)
}

console.log('\n▸ El promedio global también se repondera')
{
  // Georgalos: precio de abril sobre 23 PDV y de septiembre sobre 2.
  const p = armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', metrica_nombre: 'Precio', orden: 4,
           observaciones: 23, base_pdv: 23, obs_con_valor: 23, suma_numerica: 86920 }),
    fila({ mes: '2026-09', metrica_slug: 'precio', metrica_nombre: 'Precio', orden: 4,
           observaciones: 2, base_pdv: 2, obs_con_valor: 2, suma_numerica: 5380 }),
  ] })
  const r = resumenDe(p.series[0])!
  caso('es (86920 + 5380) / 25', Math.round(r.valor!), Math.round(92300 / 25))
  caso('CONTROL — y NO el promedio de los dos promedios',
    Math.round(r.valor!) === Math.round((86920 / 23 + 5380 / 2) / 2), false)
}

console.log('\n▸ El resumen no suma lo que no se puede sumar')
// basePdv no está en ResumenMetrica a propósito: un comercio relevado en marzo
// y en septiembre es UN PDV, y sumar los meses lo contaría dos veces. Si
// alguien agrega el campo algún día, este control lo obliga a pensarlo.
caso('ResumenMetrica no expone ningún basePdv',
  Object.keys(resumenDe(armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'precio', observaciones: 1, base_pdv: 99,
           obs_con_valor: 1, suma_numerica: 10 }),
  ] }).series[0])!).some(k => /pdv/i.test(k)), false)

console.log('\n▸ El resumen sin datos')
caso('serie inexistente', resumenDe(undefined), null)
caso('serie nula', resumenDe(null), null)
caso('observaciones sin ningún valor usable: valor null, pero el conteo queda',
  (() => { const r = resumenDe(armarPanel({ series: [
    fila({ mes: '2026-04', metrica_slug: 'presencia', tipo_respuesta: 'binaria',
           observaciones: 5, base_pdv: 5, obs_con_valor: 0, verdaderos: 0 }),
  ] }).series[0])!
    return { valor: r.valor, observaciones: r.observaciones } })(),
  { valor: null, observaciones: 5 })

console.log('\n▸ El período, en palabras')
{
  const r = (desde: string, hasta: string) => textoPeriodo(
    resumenDe(armarPanel({ series: [desde, hasta].map(mes =>
      fila({ mes, metrica_slug: 'presencia', tipo_respuesta: 'binaria',
             observaciones: 1, base_pdv: 1, obs_con_valor: 1, verdaderos: 1 })) }).series[0])!)
  caso('un solo mes no dice un rango', r('2026-03', '2026-03'), 'mar 2026')
  caso('mismo año no repite el año', r('2026-04', '2026-09'), 'abr – sept 2026')
  caso('años distintos los dice los dos', r('2025-11', '2026-02'), 'nov 2025 – feb 2026')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Nada de entrada no rompe nada')
{
  const p = armarPanel({ series: [] })
  caso('panel vacío', { meses: p.meses, series: p.series.length, vacio: p.vacio },
    { meses: [], series: 0, vacio: true })
  caso('solo visitas, sin métricas: sigue vacío pero el eje existe',
    (() => { const q = armarPanel({ series: [], visitas: [{ mes: '2026-04', pdv_visitados: 8, misiones: 8 }] })
             return { vacio: q.vacio, meses: q.meses } })(),
    { vacio: true, meses: ['2026-04'] })
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ COBERTURA — UN PDV QUE NO MIDIÓ NO ES UN PDV SIN PRESENCIA')
// Es el bug de la etapa 6, y es el mismo de la etapa 3 un nivel más abajo:
// "Cobertura por ciudad" y "Presencia por tipo" contaban solo
// fotos.declaracion, así que después de arreglar el KPI, Suprante leía 64%
// arriba y 0% en cada ciudad. La misma pantalla contradiciéndose.
//
// Un 0% dice "el producto no está". "Sin medir" dice "no preguntamos". La
// marca actúa distinto en cada caso, y el primero la manda a resolver un
// problema que no sabemos si existe.
{
  const pdv = (p: Partial<FilaPdv>): FilaPdv => ({
    comercio_id: Math.random().toString(36).slice(2),
    comercio_nombre: 'Comercio', comercio_tipo: 'kiosco',
    localidad_id: 1, localidad_nombre: 'Concordia',
    misiones: 1, con_valor: 1, verdaderos: 0, ultima_medicion: null, ...p,
  })

  const ciudades = agruparCobertura([
    pdv({ localidad_id: 1, localidad_nombre: 'Concordia', con_valor: 1, verdaderos: 1 }),
    pdv({ localidad_id: 1, localidad_nombre: 'Concordia', con_valor: 1, verdaderos: 0 }),
    // Visitado y sin medir: cuenta como PDV, NO como ausencia.
    pdv({ localidad_id: 1, localidad_nombre: 'Concordia', con_valor: 0, verdaderos: 0 }),
    pdv({ localidad_id: 2, localidad_nombre: 'Colón', con_valor: 0, verdaderos: 0 }),
  ], 'localidad')

  const concordia = ciudades.find(c => c.nombre === 'Concordia')!
  const colon     = ciudades.find(c => c.nombre === 'Colón')!

  caso('Concordia: 3 PDV visitados, 2 midieron, 1 con presencia',
    { pdv: concordia.pdv, midieron: concordia.pdvMidieron, con: concordia.conPresencia },
    { pdv: 3, midieron: 2, con: 1 })
  caso('el % se calcula sobre los que MIDIERON, no sobre los visitados',
    concordia.presenciaPct, 50)
  caso('CONTROL — sobre los visitados habría dado 33%',
    Math.round((concordia.conPresencia / concordia.pdv) * 100), 33)
  caso('y el texto dice la brecha',
    textoBaseCobertura(concordia), 'sobre 2 de 3 PDV visitados')

  caso('LO QUE IMPORTA: una ciudad sin medir da null, NO 0',
    colon.presenciaPct, null)
  caso('y su texto no promete un porcentaje',
    textoBaseCobertura(colon), '1 PDV visitados · presencia sin medir')
}

console.log('\n▸ Un PDV cuenta una vez, lo visiten las veces que lo visiten')
// La unidad del bloque de cobertura es el PDV y no la observación: contar
// observaciones le daría a un comercio visitado tres veces el peso de tres.
{
  const pdv = (con: number, ver: number, mis: number): FilaPdv => ({
    comercio_id: Math.random().toString(36).slice(2),
    comercio_nombre: 'C', comercio_tipo: 'almacen',
    localidad_id: 1, localidad_nombre: 'Rosario',
    misiones: mis, con_valor: con, verdaderos: ver, ultima_medicion: null,
  })
  const g = agruparCobertura([pdv(3, 3, 3), pdv(1, 0, 1)], 'localidad')[0]
  caso('2 PDV, no 4 observaciones', g.pdv, 2)
  caso('50% y no 75%', g.presenciaPct, 50)
}

console.log('\n▸ Sin localidad y sin tipo se agrupan aparte, no se esconden')
// Esconderlos haría que los PDV del panel no sumen los que hay, y el que haga
// la resta va a desconfiar del resto de los números.
{
  const base: FilaPdv = {
    comercio_id: 'x', comercio_nombre: 'X', comercio_tipo: null,
    localidad_id: null, localidad_nombre: null,
    misiones: 1, con_valor: 1, verdaderos: 1, ultima_medicion: null,
  }
  const porCiudad = agruparCobertura([base], 'localidad')
  const porTipo   = agruparCobertura([base], 'tipo')
  caso('sin localidad tiene su grupo',
    { clave: porCiudad[0].clave, nombre: porCiudad[0].nombre },
    { clave: 'sin-localidad', nombre: 'Sin ciudad asignada' })
  caso('sin tipo también',
    { clave: porTipo[0].clave, nombre: porTipo[0].nombre },
    { clave: 'sin-tipo', nombre: 'Sin clasificar' })
}

console.log('\n▸ La última visita es la más reciente del grupo')
{
  const pdv = (id: string, ultima: string | null): FilaPdv => ({
    comercio_id: id, comercio_nombre: id, comercio_tipo: 'kiosco',
    localidad_id: 1, localidad_nombre: 'Paraná',
    misiones: 1, con_valor: 1, verdaderos: 1, ultima_medicion: ultima,
  })
  const g = agruparCobertura([
    pdv('a', '2026-03-11T12:00:00.000Z'),
    pdv('b', '2026-09-21T12:00:00.000Z'),
    pdv('c', null),
  ], 'localidad')[0]
  caso('gana la más nueva', g.ultimaVisita, '2026-09-21T12:00:00.000Z')
  caso('y el null no la pisa', g.pdv, 3)
}

console.log('\n▸ Orden y vacío')
caso('sin filas, sin grupos', agruparCobertura([], 'localidad'), [])
{
  const mk = (loc: number, nom: string): FilaPdv => ({
    comercio_id: Math.random().toString(36).slice(2), comercio_nombre: 'C',
    comercio_tipo: 'kiosco', localidad_id: loc, localidad_nombre: nom,
    misiones: 1, con_valor: 1, verdaderos: 1, ultima_medicion: null,
  })
  const g = agruparCobertura([mk(1, 'Chica'), mk(2, 'Grande'), mk(2, 'Grande'), mk(2, 'Grande')], 'localidad')
  caso('ordena por PDV, de mayor a menor', g.map(x => x.nombre), ['Grande', 'Chica'])
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
