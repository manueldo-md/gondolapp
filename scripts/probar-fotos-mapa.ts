/**
 * probar-fotos-mapa.ts — SOLO LÓGICA, sin base.
 *
 *   npx tsx scripts/probar-fotos-mapa.ts
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 * Que la foto que acompaña a un punto del mapa sea la del estado que el punto
 * está pintando.
 *
 * El punto muestra el ÚLTIMO estado conocido. Si el thumb fuera de otra visita
 * —la primera, o una cualquiera— el mapa estaría diciendo "así está hoy" al
 * lado de una foto de marzo, y nadie tendría cómo notarlo: una foto de góndola
 * no lleva la fecha escrita.
 *
 * Y "última" es por `capturada_at`, no por `created_at`. Es la misma distinción
 * que en el tramo del panel, donde `created_at` decía 2026-09 en el 100% de las
 * filas y colapsaba toda la historia en un punto.
 */
import { ultimaFotoPorComercio, instanteDeFoto, type FilaFotoMapa } from '../lib/fotos-mapa'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const foto = (p: Partial<FilaFotoMapa> & Pick<FilaFotoMapa, 'id'>): FilaFotoMapa => ({
  comercio_id: 'com1',
  storage_path: `fotos/${p.id}.jpg`,
  url: null,
  created_at: '2026-09-01T12:00:00Z',
  ...p,
})

console.log('\n▸ EL ANCLA ES capturada_at, no created_at')
// El caso que importa: la foto vieja de campo entró a la base DESPUÉS que la
// nueva. Por `created_at` ganaría la equivocada.
{
  const deMarzo = foto({
    id: 'marzo', created_at: '2026-09-20T10:00:00Z',
    misiones: { capturada_at: '2026-03-12T14:00:00Z' },
  })
  const deSeptiembre = foto({
    id: 'sept', created_at: '2026-09-02T10:00:00Z',
    misiones: { capturada_at: '2026-09-18T09:00:00Z' },
  })

  caso('instanteDeFoto usa la captura', instanteDeFoto(deMarzo), '2026-03-12T14:00:00Z')
  caso('y no el created_at',
    instanteDeFoto(deMarzo) === deMarzo.created_at, false)

  const m = ultimaFotoPorComercio([deMarzo, deSeptiembre])
  caso('gana la de septiembre', m.get('com1')?.fotoId, 'sept')
  // CONTROL: por created_at ganaría la de marzo, que entró última.
  caso('CONTROL — por created_at habría ganado la de marzo',
    [deMarzo, deSeptiembre].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].id, 'marzo')
}

console.log('\n▸ Sin capturada_at cae a created_at, no se descarta')
// Una foto sin misión no tiene captura. Mejor una fecha aproximada que perder
// la única foto que hay.
caso('sin embed', instanteDeFoto(foto({ id: 'a', misiones: null })), '2026-09-01T12:00:00Z')
caso('embed con capturada_at en null',
  instanteDeFoto(foto({ id: 'a', misiones: { capturada_at: null } })), '2026-09-01T12:00:00Z')
caso('y la foto igual entra',
  ultimaFotoPorComercio([foto({ id: 'a', misiones: null })]).get('com1')?.fotoId, 'a')

console.log('\n▸ El embed de PostgREST viene como objeto O como arreglo')
// La misma trampa que en opcionesDeDistri: la forma depende de la cardinalidad
// que PostgREST infiera, y leerla de una sola manera rompe en la otra.
caso('como objeto',
  instanteDeFoto(foto({ id: 'a', misiones: { capturada_at: '2026-04-01T00:00:00Z' } })),
  '2026-04-01T00:00:00Z')
caso('como arreglo',
  instanteDeFoto(foto({ id: 'a', misiones: [{ capturada_at: '2026-04-01T00:00:00Z' }] })),
  '2026-04-01T00:00:00Z')
caso('arreglo vacío cae a created_at',
  instanteDeFoto(foto({ id: 'a', misiones: [] })), '2026-09-01T12:00:00Z')

console.log('\n▸ Una por comercio, no todas')
{
  const m = ultimaFotoPorComercio([
    foto({ id: 'a1', comercio_id: 'A', misiones: { capturada_at: '2026-03-01T00:00:00Z' } }),
    foto({ id: 'a2', comercio_id: 'A', misiones: { capturada_at: '2026-05-01T00:00:00Z' } }),
    foto({ id: 'b1', comercio_id: 'B', misiones: { capturada_at: '2026-04-01T00:00:00Z' } }),
  ])
  caso('dos comercios, dos entradas', m.size, 2)
  caso('la última de A', m.get('A')?.fotoId, 'a2')
  caso('la única de B',  m.get('B')?.fotoId, 'b1')
  caso('y guarda el instante para poder fechar el thumb',
    m.get('A')?.instante, '2026-05-01T00:00:00Z')
}

console.log('\n▸ El empate se resuelve IGUAL siempre')
// Sin desempate, dos renders del mismo dato podrían mostrar fotos distintas, y
// eso se lee como un bug del sistema.
{
  const mismas = [
    foto({ id: 'zzz', misiones: { capturada_at: '2026-05-01T00:00:00Z' } }),
    foto({ id: 'aaa', misiones: { capturada_at: '2026-05-01T00:00:00Z' } }),
  ]
  caso('en un orden', ultimaFotoPorComercio(mismas).get('com1')?.fotoId, 'zzz')
  caso('y en el otro', ultimaFotoPorComercio([...mismas].reverse()).get('com1')?.fotoId, 'zzz')
}

console.log('\n▸ Bordes')
caso('sin filas, mapa vacío', ultimaFotoPorComercio([]).size, 0)
caso('una foto sin comercio_id no entra',
  ultimaFotoPorComercio([foto({ id: 'a', comercio_id: null })]).size, 0)

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
