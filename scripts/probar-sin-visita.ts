/**
 * probar-sin-visita.ts — SOLO LÓGICA, sin base.
 *
 *   TZ=UTC npx tsx scripts/probar-sin-visita.ts
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 * Que el comercio más abandonado no vuelva a esconderse por estar demasiado
 * abandonado.
 *
 * La versión vieja partía de las fotos de los últimos 60 días y después
 * filtraba "hace más de 30". La banda visible era 30–60, y todo lo que pasara
 * de 60 desaparecía. Medido el 23/9/2026: 23 comercios en cada base. El modo de
 * falla no era un número mal calculado sino una LISTA CORTA que se lee como
 * "está todo bien".
 *
 * Por eso el control central de este archivo es un comercio de 400 días: con el
 * techo puesto no aparecería, y con el techo sacado tiene que encabezar.
 */
import { comerciosSinVisita, type PdvVisitado } from '../lib/alertas-distri'

process.env.TZ = 'UTC'
const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
if (zona !== 'UTC') {
  console.error(`\n✗ No se pudo poner el proceso en UTC (quedó en "${zona}").\n` +
    `  Correlo con: TZ=UTC npx tsx scripts/probar-sin-visita.ts\n`)
  process.exit(1)
}

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const AHORA = new Date('2026-09-23T12:00:00Z')
const haceDias = (d: number) =>
  new Date(AHORA.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

const pdv = (id: string, dias: number | null, nombre?: string): PdvVisitado => ({
  comercio_id: id,
  comercio_nombre: nombre ?? `Comercio ${id}`,
  ultima_medicion: dias === null ? null : haceDias(dias),
})

console.log('\n▸ EL CONTROL QUE IMPORTA: el techo de 60 días no existe más')
{
  const { lista, total } = comerciosSinVisita(
    [pdv('reciente', 5), pdv('justo', 31), pdv('viejo', 90), pdv('antiquisimo', 400)],
    { ahora: AHORA })
  caso('entran los tres que pasaron los 30 días', total, 3)
  caso('el de 400 días NO se esconde', lista.map(c => c.id).includes('antiquisimo'), true)
  caso('el de 90 tampoco',             lista.map(c => c.id).includes('viejo'), true)
  caso('y el de 5 días no entra',      lista.map(c => c.id).includes('reciente'), false)
  caso('el más abandonado va primero', lista[0].id, 'antiquisimo')
  caso('y el orden sigue por antigüedad', lista.map(c => c.id), ['antiquisimo', 'viejo', 'justo'])
}

console.log('\n▸ El borde de los 30 días')
caso('29 días no entra',
  comerciosSinVisita([pdv('a', 29)], { ahora: AHORA }).total, 0)
caso('31 días entra',
  comerciosSinVisita([pdv('a', 31)], { ahora: AHORA }).total, 1)
caso('y el corte se puede mover',
  comerciosSinVisita([pdv('a', 10)], { ahora: AHORA, diasCorte: 7 }).total, 1)

console.log('\n▸ Los días se cuentan bien')
caso('90 días es 90', comerciosSinVisita([pdv('a', 90)], { ahora: AHORA }).lista[0].dias, 90)
caso('400 es 400',    comerciosSinVisita([pdv('a', 400)], { ahora: AHORA }).lista[0].dias, 400)

console.log('\n▸ El total NO es lo que entra en pantalla')
{
  const muchos = Array.from({ length: 63 }, (_, i) => pdv(`c${i}`, 40 + i))
  const { lista, total } = comerciosSinVisita(muchos, { ahora: AHORA })
  // El badge cuenta el total. Si contara la lista diría 50 habiendo 63, que es
  // el mismo defecto de siempre: un número que tranquiliza sin ser cierto.
  caso('el total dice 63',        total, 63)
  caso('la lista trae 50',        lista.length, 50)
  caso('y son los 50 MÁS viejos', lista[0].dias, 102)
  caso('el tope se puede mover',  comerciosSinVisita(muchos, { ahora: AHORA, tope: 5 }).lista.length, 5)
}

console.log('\n▸ Sin fecha no se inventa un número')
{
  // `ultima_medicion` en null significa que no sabemos, no "hace 19.000 días".
  // Antes del cambio esto no podía pasar; ahora la fila viene de panel_pdv y
  // conviene que el caso esté escrito.
  const { lista, total } = comerciosSinVisita([pdv('a', null), pdv('b', 90)], { ahora: AHORA })
  caso('el null no entra', total, 1)
  caso('y el que sí tiene fecha queda', lista[0].id, 'b')
}
caso('una fecha basura tampoco entra',
  comerciosSinVisita(
    [{ comercio_id: 'x', comercio_nombre: 'X', ultima_medicion: 'no-es-una-fecha' }],
    { ahora: AHORA }).total, 0)

console.log('\n▸ Las alertas en pausa se respetan')
{
  const { lista, total } = comerciosSinVisita(
    [pdv('pausado', 200), pdv('activo', 100)],
    { ahora: AHORA, ignorar: id => id === 'pausado' })
  caso('el pausado no cuenta en el total', total, 1)
  caso('ni aparece en la lista', lista.map(c => c.id), ['activo'])
}

console.log('\n▸ Nombre ausente y lista vacía')
caso('sin nombre, un texto y no undefined',
  comerciosSinVisita(
    [{ comercio_id: 'x', comercio_nombre: null, ultima_medicion: haceDias(90) }],
    { ahora: AHORA }).lista[0].nombre, 'Comercio')
caso('sin filas, sin alerta', comerciosSinVisita([], { ahora: AHORA }), { lista: [], total: 0 })

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
