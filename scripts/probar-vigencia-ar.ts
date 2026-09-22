/**
 * probar-vigencia-ar.ts — SOLO LÓGICA, sin base.
 *
 * ESTE ARCHIVO EXISTE PARA QUE FALLE SI ALGUIEN VUELVE A COMPARAR CONTRA EL DÍA
 * DEL SERVIDOR.
 *
 * Vercel corre en UTC y Argentina es UTC−3. Entre las 21:00 y la medianoche
 * argentina el servidor ya está en el día siguiente, así que cualquier
 * comparación hecha con `getFullYear/getMonth/getDate`, con `toISOString()` o
 * con `new Date('YYYY-MM-DD')` adelanta un día y le rechaza trabajo en plazo a
 * un gondolero que está laburando de noche.
 *
 * El caso que manda es el primero: **una campaña que vence HOY, evaluada a las
 * 22:00 hora argentina, tiene que seguir aceptando misiones.** Con el cálculo
 * viejo ese caso daba "vencida".
 *
 * ── TIENE QUE CORRER CON TZ=UTC, Y POR ESO SE EXIGE ─────────────────────────
 * El cálculo viejo usaba `getFullYear/getMonth/getDate`, o sea la hora local
 * DEL PROCESO. En una máquina argentina eso da el día argentino y el bug NO SE
 * VE: la primera versión de esta prueba pasaba en verde contra el código roto.
 *
 * Solo tres de los veintiún casos se ponían rojos sin TZ=UTC, y ninguno era el
 * del vencimiento. Un test que no falla contra el bug que vino a cubrir no es un
 * test, así que acá se corta si la zona no es UTC en vez de dar un falso verde.
 *
 * La prueba se pone en UTC sola, así que corre igual en cualquier máquina:
 *
 *   npx tsx scripts/probar-vigencia-ar.ts
 */
import {
  estaVencida,
  puedeRegistrarMision,
  inscripcionCerrada,
  diasHastaFin,
  etiquetaVigencia,
} from '../lib/campana-vigencia'
import { diaAR, medianocheAR } from '../lib/fecha-ar'
import { inicioDelMes } from '../lib/nivel-mensual'

// Se fuerza UTC para reproducir Vercel. Va acá y no en el comando porque en
// Windows `TZ=UTC npm run …` no funciona, y una prueba que hay que acordarse de
// invocar de una forma especial es una prueba que algún día corre mal.
//
// Los imports de arriba solo definen funciones —ninguna evalúa una fecha al
// cargarse— así que esto llega a tiempo.
process.env.TZ = 'UTC'

const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
if (zona !== 'UTC') {
  console.error(`
✗ No se pudo poner el proceso en UTC (quedó en "${zona}").
` +
    `  Sin eso esta prueba da un FALSO VERDE: en una máquina argentina el
` +
    `  cálculo viejo devuelve el día argentino por casualidad.
` +
    `  Correla con: TZ=UTC npx tsx scripts/probar-vigencia-ar.ts
`)
  process.exit(1)
}

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

// 22:00 del 30/9 hora argentina. En UTC ya es el 1/10 a la 01:00: es el
// instante donde el cálculo viejo y el nuevo dan resultados OPUESTOS.
const NOCHE_DEL_30 = new Date('2026-10-01T01:00:00.000Z')
const MEDIODIA_30  = new Date('2026-09-30T15:00:00.000Z')   // 12:00 AR del 30
const NOCHE_DEL_1  = new Date('2026-10-02T01:00:00.000Z')   // 22:00 AR del 1/10

console.log('\n▸ El caso que no puede volver a romperse')
caso('CONTROL — a las 22:00 AR del 30, el servidor cree que es 1/10',
  NOCHE_DEL_30.toISOString().slice(0, 10), '2026-10-01')
caso('CONTROL — pero el día argentino es el 30',
  diaAR(NOCHE_DEL_30), '2026-09-30')

caso('una campaña que vence el 30 NO está vencida a las 22:00 AR del 30',
  estaVencida('2026-09-30', NOCHE_DEL_30), false)
caso('y acepta misiones a esa hora',
  puedeRegistrarMision({ fechaFin: '2026-09-30', capturadoAt: NOCHE_DEL_30.getTime(), ahora: NOCHE_DEL_30 }),
  { ok: true })
caso('a las 22:00 AR del 1/10 sí está vencida',
  estaVencida('2026-09-30', NOCHE_DEL_1), true)
caso('y ahí sí rechaza',
  puedeRegistrarMision({ fechaFin: '2026-09-30', capturadoAt: NOCHE_DEL_1.getTime(), ahora: NOCHE_DEL_1 }),
  { ok: false, motivo: 'vencida' })

console.log('\n▸ La inscripción — el mismo día de corrimiento, pero eran 27 horas')
caso('la inscripción sigue abierta a las 22:00 AR del último día',
  inscripcionCerrada('2026-09-30', NOCHE_DEL_30), false)
caso('sigue abierta al mediodía del último día',
  inscripcionCerrada('2026-09-30', MEDIODIA_30), false)
caso('cierra recién al día siguiente',
  inscripcionCerrada('2026-09-30', NOCHE_DEL_1), true)
caso('sin fecha límite nunca cierra', inscripcionCerrada(null, NOCHE_DEL_1), false)

console.log('\n▸ diasHastaFin')
caso('el último día es 0 a las 22:00 AR', diasHastaFin('2026-09-30', NOCHE_DEL_30), 0)
caso('el último día es 0 al mediodía', diasHastaFin('2026-09-30', MEDIODIA_30), 0)
caso('el día siguiente es -1', diasHastaFin('2026-09-30', NOCHE_DEL_1), -1)
caso('dentro de una semana', diasHastaFin('2026-10-07', MEDIODIA_30), 7)
caso('la etiqueta dice "Último día" a las 22:00 AR',
  etiquetaVigencia('2026-09-30', { ahora: NOCHE_DEL_30 })?.texto, 'Último día')

console.log('\n▸ Lo que NO cambia')
// Seguimiento no vence, y el tope anti-falseo de la cola sigue en pie.
caso('sin fecha_fin nunca vence', estaVencida(null, NOCHE_DEL_1), false)
caso('una captura más vieja que el TTL de la cola se rechaza igual',
  puedeRegistrarMision({
    fechaFin: '2026-12-31',
    capturadoAt: NOCHE_DEL_30.getTime() - 8 * 86_400_000,
    ahora: NOCHE_DEL_30,
  }),
  { ok: false, motivo: 'captura_muy_vieja' })
caso('un capturadoAt en el futuro no da ventaja',
  puedeRegistrarMision({
    fechaFin: '2026-09-30',
    capturadoAt: NOCHE_DEL_1.getTime() + 86_400_000,
    ahora: NOCHE_DEL_1,
  }),
  { ok: false, motivo: 'vencida' })

console.log('\n▸ El corte del mes, en hora argentina')
// A las 22:00 AR del 30/9 el servidor está en octubre. El mes argentino no.
caso('a las 22:00 AR del 30/9 el mes argentino sigue siendo septiembre',
  diaAR(NOCHE_DEL_30).slice(0, 7), '2026-09')
caso('la medianoche AR del 1/10 es la 03:00 UTC, no la 00:00',
  medianocheAR('2026-10-01').toISOString(), '2026-10-01T03:00:00.000Z')

// El corte del mes lo usan el nivel, el ranking y el logro "podio". Con el
// cálculo viejo arrancaba el 1° a las 00:00 UTC = 21:00 del 30 hora argentina,
// así que tres horas del mes anterior contaban para éste.
caso('inicioDelMes a las 22:00 AR del 30/9 sigue siendo el 1 de SEPTIEMBRE',
  inicioDelMes(NOCHE_DEL_30).toISOString(), '2026-09-01T03:00:00.000Z')
caso('inicioDelMes a las 22:00 AR del 1/10 ya es el 1 de octubre',
  inicioDelMes(NOCHE_DEL_1).toISOString(), '2026-10-01T03:00:00.000Z')

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
