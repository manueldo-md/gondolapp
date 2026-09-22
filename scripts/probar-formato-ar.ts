/**
 * probar-formato-ar.ts — SOLO LÓGICA, sin base.
 *
 * ESTE ARCHIVO EXISTE PARA QUE FALLE SI UNA FECHA SE MUESTRA UN DÍA CORRIDO.
 *
 * Hay dos bugs opuestos, y un arreglo que cura uno provoca el otro:
 *
 *   1. Un `timestamptz` formateado SIN zona sale en UTC. Una misión capturada a
 *      las 22:30 hora argentina del 20 se le muestra al revisor como del 21.
 *   2. Una columna `date` formateada CON la zona argentina RETROCEDE un día:
 *      `new Date('2026-09-30')` es medianoche UTC, y en Buenos Aires eso es el
 *      29 a las 21:00. Una campaña que vence el 30 diría "vence el 29".
 *
 * El caso que manda es el segundo, porque es el que un arreglo apurado
 * introduce: es fácil "ponerle la zona a todo" y romper las tres columnas
 * `date` del schema mientras se arreglan las otras ochenta.
 *
 * ── TIENE QUE CORRER CON TZ=UTC, Y POR ESO SE EXIGE ─────────────────────────
 * Igual que probar-vigencia-ar.ts: `Intl` sin `timeZone` usa la zona DEL
 * PROCESO, así que en una máquina argentina el código roto devuelve el día
 * argentino por casualidad y la prueba da un falso verde. Acá se corta si la
 * zona no es UTC.
 *
 *   npx tsx scripts/probar-formato-ar.ts
 */
import { formatearDia, formatearInstante, formatearInstanteHora } from '../lib/fecha-ar'
import { tiempoRelativo } from '../lib/utils'
import { inicioDelMes } from '../lib/nivel-mensual'

// Va debajo de los imports igual que en probar-vigencia-ar.ts: los imports se
// izan, pero ninguno de esos módulos evalúa una fecha al cargarse, así que esto
// llega a tiempo.
process.env.TZ = 'UTC'

const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
if (zona !== 'UTC') {
  console.error(`\n✗ No se pudo poner el proceso en UTC (quedó en "${zona}").\n` +
    `  Sin eso esta prueba da un FALSO VERDE.\n` +
    `  Correla con: TZ=UTC npx tsx scripts/probar-formato-ar.ts\n`)
  process.exit(1)
}

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

// 22:00 del 30/9 hora argentina = 1/10 a la 01:00 UTC.
const NOCHE_DEL_30 = new Date('2026-10-01T01:00:00.000Z')
// 22:30 del 20/9 hora argentina: el caso del revisor que ve la misión del día
// siguiente.
const NOCHE_DEL_20 = new Date('2026-09-21T01:30:00.000Z')
const MEDIODIA_30  = new Date('2026-09-30T15:00:00.000Z')

console.log('\n▸ Una columna `date` NO puede retroceder un día')
// El bug que introduce un arreglo apurado: aplicarle la zona argentina a un
// `date` lo manda al día anterior.
caso('CONTROL — con la zona AR aplicada a mano, el 30 se ve como 29',
  new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date('2026-09-30')), '29/09/2026')
caso('formatearDia del 30 dice 30', formatearDia('2026-09-30'), '30/09/2026')
caso('el 1 de mes no se va al mes anterior', formatearDia('2026-10-01'), '01/10/2026')
caso('el 1 de enero no se va al año anterior', formatearDia('2026-01-01'), '01/01/2026')
caso('con mes largo', formatearDia('2026-09-30', { day: '2-digit', month: 'long', year: 'numeric' }),
  '30 de septiembre de 2026')
caso('un date con basura al final se tolera', formatearDia('2026-09-30T00:00:00+00:00'), '30/09/2026')
caso('null da raya', formatearDia(null), '—')
caso('un string cualquiera da raya', formatearDia('mañana'), '—')

console.log('\n▸ Un `timestamptz` SÍ tiene que ir a hora argentina')
caso('CONTROL — a las 22:00 AR del 30 el servidor cree que es 1/10',
  NOCHE_DEL_30.toISOString().slice(0, 10), '2026-10-01')
caso('formatearInstante dice 30/09', formatearInstante(NOCHE_DEL_30), '30/09/2026')
caso('la misión de las 22:30 del 20 se ve del 20, no del 21',
  formatearInstante(NOCHE_DEL_20), '20/09/2026')
caso('con hora, dice las 22:30 y no la 01:30',
  formatearInstanteHora(NOCHE_DEL_20), '20/09/2026, 22:30')
caso('al mediodía no hay corrimiento que valga',
  formatearInstanteHora(MEDIODIA_30), '30/09/2026, 12:00')
caso('acepta el string ISO que devuelve postgrest',
  formatearInstante('2026-10-01T01:00:00+00:00'), '30/09/2026')
caso('null da raya', formatearInstante(null), '—')

console.log('\n▸ El mismo día, contado por los dos lados')
// Una campaña que vence el 30 y una misión capturada a las 22:00 AR del 30:
// las dos tienen que decir 30. Con UN solo formateador para los dos casos,
// alguna de las dos miente.
caso('la campaña vence el 30', formatearDia('2026-09-30'), '30/09/2026')
caso('y la misión de esa noche es del 30', formatearInstante(NOCHE_DEL_30), '30/09/2026')

console.log('\n▸ tiempoRelativo cae en hora argentina cuando pasa la semana')
// Lo relativo ("hace 2 h") no depende de la zona, pero el fallback de más de
// una semana formatea una fecha y sí dependía.
const HACE_10_DIAS = new Date(NOCHE_DEL_30.getTime() - 10 * 86_400_000)  // 20/9 22:00 AR
caso('hace 10 días muestra el día argentino',
  tiempoRelativo(HACE_10_DIAS, NOCHE_DEL_30), '20/09/2026')
caso('hace 2 horas sigue siendo relativo',
  tiempoRelativo(new Date(NOCHE_DEL_30.getTime() - 2 * 3600_000), NOCHE_DEL_30), 'hace 2 h')

console.log('\n▸ Los cortes de mes de los tableros')
// admin/tablero, distribuidora/dashboard y repositora/dashboard calculaban el
// mesInicio con `new Date(y, m, 1)` — hora local del proceso. En Vercel eso es
// el 1° a las 00:00 UTC = 21:00 del último día del mes anterior.
caso('CONTROL — el cálculo viejo arranca tres horas antes',
  new Date(Date.UTC(2026, 9, 1)).toISOString(), '2026-10-01T00:00:00.000Z')
caso('inicioDelMes a las 22:00 AR del 30/9 sigue en septiembre',
  inicioDelMes(NOCHE_DEL_30).toISOString(), '2026-09-01T03:00:00.000Z')

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
