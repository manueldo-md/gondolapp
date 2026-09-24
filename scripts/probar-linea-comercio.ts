/**
 * probar-linea-comercio.ts — SOLO LÓGICA, sin base.
 *
 *   npx tsx scripts/probar-linea-comercio.ts
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 * La línea de tiempo de un comercio es lo que la distribuidora le muestra al
 * cliente. Todos los errores que puede tener se ven perfectamente normales:
 *
 *   · una visita en el lugar equivocado de la línea, porque se ordenó por
 *     `created_at` — una foto de góndola no lleva la fecha escrita;
 *   · una visita que desaparece, porque su foto estaba en revisión o porque el
 *     tope se la comió en silencio — se lee como una visita que no se hizo;
 *   · dos fotos de la MISMA visita presentadas como dos momentos;
 *   · un antes y después dado vuelta, que cuenta la historia opuesta.
 *
 * Ninguno rompe nada ni tira un error. Por eso cada bloque de abajo se verificó
 * rompiendo el código a propósito, y lo que se rompió está anotado al final.
 */
import {
  armarLinea, parDeComparacion, siguienteSeleccion, rutaEvidencia, entradaDesdeElPadron,
  instanteDeVisita, TOPE_VISITAS,
  type FilaMisionLinea, type FilaFotoLinea, type FilaRespuestaLinea, type Visita,
} from '../lib/linea-comercio'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const mision = (p: Partial<FilaMisionLinea> & Pick<FilaMisionLinea, 'id'>): FilaMisionLinea => ({
  estado: 'aprobada',
  capturada_at: '2026-09-01T13:00:00Z',
  created_at: '2026-09-01T13:00:00Z',
  campana_id: 'cam1',
  campana_nombre: 'Reposición góndola',
  gondolero_nombre: 'Gabriel',
  gondolero_alias: 'CondorVeloz',
  ...p,
})

const foto = (p: Partial<FilaFotoLinea> & Pick<FilaFotoLinea, 'id' | 'mision_id'>): FilaFotoLinea => ({
  estado: 'aprobada',
  storage_path: `campanas/x/${p.id}.png`,
  url: '',
  created_at: '2026-09-01T13:00:00Z',
  ...p,
})

const linea = (
  misiones: FilaMisionLinea[],
  fotos: FilaFotoLinea[] = [],
  respuestas: FilaRespuestaLinea[] = [],
  tope?: number,
) => armarLinea({ misiones, fotos, respuestas }, tope)

const ids = (vs: Visita[]) => vs.map(v => v.misionId)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL ANCLA ES capturada_at, no created_at')
// El caso real, y está sembrado en dev: la visita del 19/8 entró a la base el
// 29/8 porque el gondolero trabajó sin señal. Por `created_at` se iría al final
// de la línea, o sea al lugar de la foto más nueva.
{
  // Las fechas son las del caso sembrado en dev, y la distancia entre las dos
  // importa: con la siguiente visita MUY lejos, el `created_at` demorado sigue
  // cayendo antes y el control no distinguiría nada. Acá la demora de 10 días
  // pasa por encima de la visita del 26.
  const offline = mision({
    id: 'agosto19', capturada_at: '2026-08-19T13:00:00Z', created_at: '2026-08-29T21:00:00Z',
  })
  const alDia = mision({
    id: 'agosto26', capturada_at: '2026-08-26T13:00:00Z', created_at: '2026-08-26T13:00:00Z',
  })

  caso('la del 19 va primera', ids(linea([alDia, offline]).visitas), ['agosto19', 'agosto26'])
  // CONTROL: si el orden saliera de `created_at`, la del 19 sería la última.
  caso('CONTROL — por created_at la del 19 quedaría última',
    [alDia, offline].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')).map(m => m.id),
    ['agosto26', 'agosto19'])
  caso('instanteDeVisita usa la captura', instanteDeVisita(offline), '2026-08-19T13:00:00Z')
}

console.log('\n▸ Sin capturada_at cae a created_at, y sin ninguna de las dos no se ubica')
caso('cae a created_at',
  instanteDeVisita(mision({ id: 'a', capturada_at: null, created_at: '2026-07-01T00:00:00Z' })),
  '2026-07-01T00:00:00Z')
caso('sin ninguna, null', instanteDeVisita(mision({ id: 'a', capturada_at: null, created_at: null })), null)
{
  // No se puede ubicar en una línea de tiempo, así que queda afuera — pero
  // CONTADA, para que la pantalla lo pueda decir. Hoy este camino no lo
  // ejercita ningún dato real: cero nulos en las dos bases.
  const l = linea([mision({ id: 'a' }), mision({ id: 'huerfana', capturada_at: null, created_at: null })])
  caso('la que no se puede ubicar queda afuera', ids(l.visitas), ['a'])
  caso('y se cuenta, no se pierde', l.sinFecha, 1)
}

console.log('\n▸ La descartada NO es una visita; el estado en null SÍ')
{
  const l = linea([
    mision({ id: 'ok' }),
    mision({ id: 'descartada', estado: 'descartada', capturada_at: '2026-09-05T13:00:00Z' }),
    // `misiones.estado` es nullable. Excluirla sería el mismo error de lógica
    // de tres valores que el `.neq()` que este proyecto ya evitó dos veces.
    mision({ id: 'sinEstado', estado: null, capturada_at: '2026-09-06T13:00:00Z' }),
  ])
  caso('la descartada no entra', ids(l.visitas), ['ok', 'sinEstado'])
  caso('y no cuenta como sin fecha', l.sinFecha, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ UNA VISITA CON DOS FOTOS ES UN PUNTO, NO DOS')
// El 42% de las misiones con foto de producción dejan dos. Si cada foto fuera
// un punto, la misma fecha aparecería dos veces y la comparación "última contra
// anterior" enfrentaría dos tomas de la misma visita.
{
  const l = linea(
    [mision({ id: 'm1' })],
    [foto({ id: 'f2', mision_id: 'm1', created_at: '2026-09-01T13:05:00Z' }),
     foto({ id: 'f1', mision_id: 'm1', created_at: '2026-09-01T13:00:00Z' })],
  )
  caso('un solo punto', l.visitas.length, 1)
  caso('con las dos fotos adentro', l.visitas[0]?.fotos.map(f => f.id), ['f1', 'f2'])
  // Sin desempate, dos renders del mismo dato podrían darlas al revés.
  const alReves = linea([mision({ id: 'm1' })], [
    foto({ id: 'f1', mision_id: 'm1', created_at: '2026-09-01T13:00:00Z' }),
    foto({ id: 'f2', mision_id: 'm1', created_at: '2026-09-01T13:05:00Z' }),
  ])
  caso('y en el mismo orden con la entrada dada vuelta',
    alReves.visitas[0]?.fotos.map(f => f.id), ['f1', 'f2'])
}

console.log('\n▸ Solo la aprobada es evidencia — pero LA VISITA APARECE IGUAL')
{
  const l = linea([mision({ id: 'm1' })], [
    foto({ id: 'ok',   mision_id: 'm1', estado: 'aprobada' }),
    foto({ id: 'pend', mision_id: 'm1', estado: 'pendiente' }),
    foto({ id: 'rev',  mision_id: 'm1', estado: 'en_revision' }),
    foto({ id: 'rech', mision_id: 'm1', estado: 'rechazada' }),
    foto({ id: 'arch', mision_id: 'm1', estado: 'archivada' }),
  ])
  caso('solo la aprobada se muestra', l.visitas[0]?.fotos.map(f => f.id), ['ok'])
  caso('pendiente y en_revision se cuentan juntas', l.visitas[0]?.enRevision, 2)
  caso('la rechazada se cuenta aparte', l.visitas[0]?.rechazadas, 1)
  caso('la archivada no es ninguna de las dos cosas',
    (l.visitas[0]?.enRevision ?? 0) + (l.visitas[0]?.rechazadas ?? 0), 3)
}

console.log('\n▸ Una visita con SOLO fotos pendientes entra en la línea')
// Es el caso que el usuario pidió explícitamente: si desapareciera, una visita
// que se hizo dejaría un hueco, y un hueco se lee como que nadie fue.
{
  const l = linea(
    [mision({ id: 'ayer', capturada_at: '2026-09-01T13:00:00Z' }),
     mision({ id: 'hoy', estado: 'pendiente', capturada_at: '2026-09-23T13:00:00Z' })],
    [foto({ id: 'f1', mision_id: 'ayer' }),
     foto({ id: 'f2', mision_id: 'hoy', estado: 'pendiente' })],
  )
  caso('aparece', ids(l.visitas), ['ayer', 'hoy'])
  caso('sin foto mostrable', l.visitas[1]?.fotos.length, 0)
  caso('y diciendo que está en revisión', l.visitas[1]?.enRevision, 1)
}

console.log('\n▸ Una visita sin ninguna foto también es una visita')
// Una campaña de solo preguntas no produce fotos. La unidad es la visita.
{
  const l = linea([mision({ id: 'encuesta' })], [], [
    { mision_id: 'encuesta', pregunta: '¿Está el producto?', tipo: 'binaria', valor: true },
  ])
  caso('entra', ids(l.visitas), ['encuesta'])
  caso('con sus respuestas', l.visitas[0]?.respuestas.map(r => r.pregunta), ['¿Está el producto?'])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL TOPE RECORTA LO VIEJO, Y LO DICE')
{
  const muchas = Array.from({ length: 8 }, (_, i) =>
    mision({ id: `v${i}`, capturada_at: `2026-0${i + 1}-01T13:00:00Z` }))

  const l = linea(muchas, [], [], 3)
  caso('quedan las tres MÁS RECIENTES', ids(l.visitas), ['v5', 'v6', 'v7'])
  caso('y dice cuántas recortó', l.recortadas, 5)
  caso('y cuántas había', l.total, 8)

  // CONTROL: sin tope no recorta nada, así que el 5 de arriba es del tope y no
  // de que se hayan perdido filas por otro lado.
  const entera = linea(muchas)
  caso('CONTROL — sin tope entran las ocho', entera.visitas.length, 8)
  caso('y recortadas queda en cero', entera.recortadas, 0)
  caso('el tope por default es el de la lib', TOPE_VISITAS, 60)
}

console.log('\n▸ El empate de instante se resuelve IGUAL siempre')
// La auditoría de precios y la reposición pueden caer el mismo día a la misma
// hora. Sin un orden total, dos renders podrían darlas al revés.
{
  const a = mision({ id: 'aaa', campana_nombre: 'Reposición' })
  const z = mision({ id: 'zzz', campana_nombre: 'Auditoría' })
  caso('en un orden', ids(linea([a, z]).visitas), ['aaa', 'zzz'])
  caso('y en el otro', ids(linea([z, a]).visitas), ['aaa', 'zzz'])
}

console.log('\n▸ Cada visita lleva SU campaña — la mezcla se ve')
{
  const l = linea([
    mision({ id: 'rep', capturada_at: '2026-09-02T13:00:00Z', campana_nombre: 'Reposición góndola' }),
    mision({ id: 'aud', capturada_at: '2026-09-02T18:00:00Z', campana_id: 'cam2', campana_nombre: 'Auditoría de precios' }),
  ])
  caso('las dos campañas, en orden', l.visitas.map(v => v.campanaNombre),
    ['Reposición góndola', 'Auditoría de precios'])
}

console.log('\n▸ El gondolero va por nombre, con el alias de respaldo')
caso('nombre', linea([mision({ id: 'a' })]).visitas[0]?.gondolero, 'Gabriel')
caso('sin nombre, el alias',
  linea([mision({ id: 'a', gondolero_nombre: null })]).visitas[0]?.gondolero, 'CondorVeloz')
caso('sin ninguno, null',
  linea([mision({ id: 'a', gondolero_nombre: null, gondolero_alias: null })]).visitas[0]?.gondolero, null)

console.log('\n▸ Las respuestas van con su visita, no mezcladas')
{
  const l = linea([mision({ id: 'm1' }), mision({ id: 'm2', capturada_at: '2026-09-09T13:00:00Z' })], [], [
    { mision_id: 'm1', pregunta: 'Frentes', tipo: 'numero', valor: 22 },
    { mision_id: 'm2', pregunta: 'Frentes', tipo: 'numero', valor: 5 },
    { mision_id: 'm1', pregunta: '¿Está?', tipo: 'binaria', valor: true },
    // Una respuesta sin pregunta resuelta no se muestra: un renglón vacío al
    // lado de una foto es ruido.
    { mision_id: 'm1', pregunta: null, tipo: 'texto', valor: 'x' },
    { mision_id: 'huerfana', pregunta: 'Otra', tipo: 'texto', valor: 'y' },
  ])
  caso('las de m1', l.visitas[0]?.respuestas.map(r => r.pregunta), ['Frentes', '¿Está?'])
  caso('las de m2', l.visitas[1]?.respuestas.map(r => r.valor), [5])
  caso('el valor conserva su tipo nativo', l.visitas[0]?.respuestas[1]?.valor, true)
}

console.log('\n▸ Bordes')
caso('sin misiones', linea([]).visitas.length, 0)
caso('una foto de una misión que no está no rompe nada',
  linea([mision({ id: 'm1' })], [foto({ id: 'f', mision_id: 'otra' })]).visitas[0]?.fotos.length, 0)
caso('una foto sin mision_id tampoco (es la fachada del alta)',
  linea([mision({ id: 'm1' })], [foto({ id: 'f', mision_id: null })]).visitas[0]?.fotos.length, 0)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL PAR: LA ÚLTIMA CONTRA LA ANTERIOR')
{
  const ms = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'].map((d, i) =>
    mision({ id: `v${i}`, capturada_at: `${d}T13:00:00Z` }))
  const fs = ms.map(m => foto({ id: `f-${m.id}`, mision_id: m.id }))
  const { visitas } = linea(ms, fs)

  const par = parDeComparacion(visitas)
  caso('anterior es la anteúltima', par?.anterior.misionId, 'v2')
  caso('última es la última', par?.ultima.misionId, 'v3')
  caso('no está ajustado', par?.ajustado, false)
  // CONTROL: el default NO es primera contra última. Lo que se detecta es la
  // caída reciente, no la diferencia contra hace tres meses.
  caso('CONTROL — no es la primera contra la última', par?.anterior.misionId === 'v0', false)
}

console.log('\n▸ El par salta las visitas sin foto mostrable')
{
  const ms = [
    mision({ id: 'vieja', capturada_at: '2026-07-01T13:00:00Z' }),
    mision({ id: 'media', capturada_at: '2026-08-01T13:00:00Z' }),
    mision({ id: 'pend',  capturada_at: '2026-09-01T13:00:00Z' }),
    mision({ id: 'vacia', capturada_at: '2026-09-15T13:00:00Z' }),
  ]
  const { visitas } = linea(ms, [
    foto({ id: 'f1', mision_id: 'vieja' }),
    foto({ id: 'f2', mision_id: 'media' }),
    foto({ id: 'f3', mision_id: 'pend', estado: 'pendiente' }),
  ])
  caso('las cuatro están en la línea', visitas.length, 4)
  const par = parDeComparacion(visitas)
  caso('pero se comparan las dos que tienen foto',
    [par?.anterior.misionId, par?.ultima.misionId], ['vieja', 'media'])
}

console.log('\n▸ El par elegido se respeta, y SIEMPRE sale en orden')
{
  const ms = ['2026-06-01', '2026-07-01', '2026-08-01'].map((d, i) =>
    mision({ id: `v${i}`, capturada_at: `${d}T13:00:00Z` }))
  const { visitas } = linea(ms, ms.map(m => foto({ id: `f-${m.id}`, mision_id: m.id })))

  const elegido = parDeComparacion(visitas, { a: 'v0', b: 'v1' })
  caso('respeta lo pedido', [elegido?.anterior.misionId, elegido?.ultima.misionId], ['v0', 'v1'])
  caso('y no dice que lo ajustó', elegido?.ajustado, false)

  // Un antes y después dado vuelta cuenta la historia opuesta —una góndola que
  // se llena en vez de vaciarse— y nada en pantalla lo delataría.
  const alReves = parDeComparacion(visitas, { a: 'v1', b: 'v0' })
  caso('pedido al revés, sale igual',
    [alReves?.anterior.misionId, alReves?.ultima.misionId], ['v0', 'v1'])
}

console.log('\n▸ Una selección que no sirve cae al default, y lo dice')
{
  const ms = ['2026-06-01', '2026-07-01', '2026-08-01'].map((d, i) =>
    mision({ id: `v${i}`, capturada_at: `${d}T13:00:00Z` }))
  const { visitas } = linea(ms, ms.map(m => foto({ id: `f-${m.id}`, mision_id: m.id })))

  for (const [nombre, sel] of [
    ['un id de otra pantalla', { a: 'ajeno', b: 'v0' }],
    ['la misma visita dos veces', { a: 'v0', b: 'v0' }],
    ['solo una', { a: 'v0' }],
  ] as const) {
    const p = parDeComparacion(visitas, sel)
    caso(`${nombre}: cae al default`, [p?.anterior.misionId, p?.ultima.misionId], ['v1', 'v2'])
    caso(`${nombre}: y lo declara`, p?.ajustado, true)
  }
  caso('sin selección no está ajustado', parDeComparacion(visitas)?.ajustado, false)
}

console.log('\n▸ Elegir otra visita: la MÁS RECIENTE de las dos se queda')
{
  const ms = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'].map((d, i) =>
    mision({ id: `v${i}`, capturada_at: `${d}T13:00:00Z` }))
  const { visitas } = linea(ms, ms.map(m => foto({ id: `f-${m.id}`, mision_id: m.id })))
  const par = parDeComparacion(visitas)!   // por default, v2 contra v3

  // La reciente es el ANCLA: lo que se pregunta es contra cuándo comparar cómo
  // está HOY. Si se reemplazara la reciente, cada click movería la referencia.
  caso('elegir la más vieja la enfrenta a la reciente',
    siguienteSeleccion(par, 'v0'), { a: 'v0', b: 'v3' })
  // CONTROL: la regla al revés habría dejado la vieja puesta.
  caso('CONTROL — no se queda la anteúltima',
    siguienteSeleccion(par, 'v0')?.b === par.anterior.misionId, false)

  // Y el par resultante se puede volver a mover, sin perder el ancla.
  const par2 = parDeComparacion(visitas, siguienteSeleccion(par, 'v0')!)!
  caso('el par nuevo es el elegido', [par2.anterior.misionId, par2.ultima.misionId], ['v0', 'v3'])
  caso('y moverlo otra vez conserva la reciente',
    siguienteSeleccion(par2, 'v1'), { a: 'v1', b: 'v3' })

  // Sin link donde no hay nada que hacer: una tarjeta que ya está comparando no
  // muestra un botón que no cambia nada.
  caso('la que ya es el lado viejo no ofrece link', siguienteSeleccion(par, 'v2'), null)
  caso('la que ya es el lado nuevo tampoco', siguienteSeleccion(par, 'v3'), null)
  caso('sin par no hay link', siguienteSeleccion(null, 'v0'), null)
}

console.log('\n▸ El link a la evidencia sale bien, o no sale')
{
  caso('marca, sin campaña',
    rutaEvidencia({ panel: 'marca', comercioId: 'c1' }), '/marca/comercio/c1')
  caso('marca, con campaña',
    rutaEvidencia({ panel: 'marca', comercioId: 'c1', campanaId: 'k9' }),
    '/marca/comercio/c1?campana=k9')

  caso('distri, con alcance',
    rutaEvidencia({ panel: 'distri', comercioId: 'c1', alcance: 'm7' }),
    '/distribuidora/comercio/c1?alcance=m7')
  caso('distri, con alcance y campaña',
    rutaEvidencia({ panel: 'distri', comercioId: 'c1', alcance: 'm7', campanaId: 'k9' }),
    '/distribuidora/comercio/c1?alcance=m7&campana=k9')
  caso('distri, con las campañas propias',
    rutaEvidencia({ panel: 'distri', comercioId: 'c1', alcance: 'propias' }),
    '/distribuidora/comercio/c1?alcance=propias')

  // Sin alcance la pantalla abriría pidiendo que elijan, y mandar ahí desde un
  // link que debería saber cuál es sería hacer elegir dos veces.
  caso('distri sin alcance no linkea',
    rutaEvidencia({ panel: 'distri', comercioId: 'c1' }), null)

  // La tabla de cobertura la montan los cuatro paneles y solo dos tienen la
  // pantalla. Un link a un 404 es peor que ninguno.
  caso('admin no linkea', rutaEvidencia({ panel: 'admin', comercioId: 'c1' }), null)
  caso('repositora tampoco', rutaEvidencia({ panel: 'repositora', comercioId: 'c1' }), null)
  caso('sin comercio tampoco', rutaEvidencia({ panel: 'marca', comercioId: '' }), null)

  // EL CASO QUE YA MORDIÓ, y por eso está acá: el panel se llama 'distri' y su
  // ruta es '/distribuidora/'. Escribir el nombre de la ruta como panel compila
  // igual —es un `string`— y devuelve null en silencio: un nombre de comercio
  // que deja de ser un link sin que nada falle.
  caso("CONTROL — 'distribuidora' NO es un panel válido",
    rutaEvidencia({ panel: 'distribuidora', comercioId: 'c1', alcance: 'm7' }), null)
}

console.log('\n▸ Las tres ramas con que el padrón ofrece —o no— la evidencia')
{
  // Un tercio del padrón no está en ningún alcance: 35 de 104 en dev y 37 de 97
  // en prod. Para ésos el link de antes era una promesa imposible.
  const sin = entradaDesdeElPadron('c1', [])
  caso('sin alcance no hay link', sin.href, null)
  caso('y se declara el estado', sin.estado, 'sin_alcance')

  // El camino principal: 50 de 69 en dev y 51 de 60 en prod.
  const uno = entradaDesdeElPadron('c1', ['m7'])
  caso('con uno solo, el link lo lleva puesto',
    uno.href, '/distribuidora/comercio/c1?alcance=m7')
  caso('y dice cuál es', uno.estado === 'uno' ? uno.alcance : null, 'm7')

  // La excepción: 19 y 9. Acá el padrón GENUINAMENTE no sabe cuál, así que
  // mandar sin alcance es lo correcto y no un olvido.
  const varios = entradaDesdeElPadron('c1', ['m7', 'propias'])
  caso('con varios, el link va sin alcance', varios.href, '/distribuidora/comercio/c1')
  caso('y lo declara', varios.estado, 'varios')

  // CONTROL: `rutaEvidencia` sigue negándose a armar el link sin alcance. Las
  // dos reglas conviven porque son dos situaciones distintas, y si esta se
  // relajara, cualquier link olvidadizo empezaría a pasar.
  caso("CONTROL — rutaEvidencia sin alcance sigue dando null",
    rutaEvidencia({ panel: 'distri', comercioId: 'c1' }), null)

  caso('las propias solas también llevan el link puesto',
    entradaDesdeElPadron('c1', ['propias']).href,
    '/distribuidora/comercio/c1?alcance=propias')
}

console.log('\n▸ Con menos de dos visitas con foto no hay comparación')
{
  const sola = linea([mision({ id: 'm1' })], [foto({ id: 'f', mision_id: 'm1' })])
  caso('una sola', parDeComparacion(sola.visitas), null)
  const ninguna = linea([mision({ id: 'm1' }), mision({ id: 'm2', capturada_at: '2026-09-09T13:00:00Z' })])
  caso('ninguna con foto', parDeComparacion(ninguna.visitas), null)
  caso('lista vacía', parDeComparacion([]), null)
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTURAS VERIFICADAS — los números están MEDIDOS, no estimados
//
// Cada una se aplicó al código y se contó cuántos controles se pusieron rojos.
// Sin esto, un test que pasa no prueba que cubra lo que dice cubrir: en este
// proyecto ya hubo dos que daban verde contra el código roto.
//
//   ordenar por `created_at` en vez de `capturada_at`         →  4 en rojo
//   sacar las visitas cuyas fotos están todas pendientes      →  4
//   recortar con slice(0, tope) — deja las VIEJAS             →  1
//   recortar sin informar `recortadas`                        →  1
//   un punto por FOTO en vez de por visita                    →  3
//   el default primera-contra-última                          →  5
//   no ordenar el par elegido                                 →  1
//   sacar el desempate por id                                 →  1
//   descartar la visita sin fecha sin contarla                →  1
//   dejar entrar la misión descartada                         →  1
//
// ── POR QUÉ LOS ACCESOS POR ÍNDICE VAN CON `?.` ─────────────────────────────
// La primera medición dio "1 en rojo" en varias roturas, y no era que el test
// fuera flojo: una rotura que acorta la lista hace que `l.visitas[1].fotos`
// TIRE, la excepción corta el proceso y los bloques de abajo **no llegan a
// medirse**. Un control que no se ejecuta no dice nada, y el número resultante
// invitaba a creer que la cobertura era más fina de lo que es. Con `?.` el
// control falla y el suite sigue: la rotura del pendiente pasó de 1 a 4.
// ─────────────────────────────────────────────────────────────────────────────

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
