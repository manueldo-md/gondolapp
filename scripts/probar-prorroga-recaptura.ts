/**
 * probar-prorroga-recaptura.ts — SOLO LÓGICA, sin base.
 *
 *   TZ=UTC npx tsx scripts/probar-prorroga-recaptura.ts
 *
 * El plazo para rehacer una foto de una misión ya abierta, después de que la
 * campaña venció.
 *
 * ── LOS DOS BORDES SON EL ARCHIVO ───────────────────────────────────────────
 * Uno de cada lado, y los dos duelen distinto:
 *
 *   · el último día de prórroga TIENE que aceptar. Si el corte se adelanta un
 *     día, un gondolero que volvió al comercio en plazo se queda sin cobrar un
 *     trabajo que hizo.
 *   · el día siguiente NO tiene que aceptar. Si se atrasa, la campaña nunca
 *     termina de cerrar y el que paga no sabe cuándo terminó de pagar.
 *
 * ── Y LA ZONA HORARIA, QUE YA MORDIÓ EN ESTE MISMO ARCHIVO ──────────────────
 * `puedeRecapturar` se apoya en `estaVencida` y `diasHastaFin`, que comparan
 * DÍAS ARGENTINOS. Vercel corre en UTC: entre las 21:00 y la medianoche
 * argentina el servidor ya está en el día siguiente. Sin TZ=UTC el bug no se
 * ve —la máquina de desarrollo está en AR— así que acá se corta, igual que en
 * `probar-vigencia-ar.ts`.
 */
import { puedeRecapturar, DIAS_GRACIA_RECAPTURA, estaVencida } from '../lib/campana-vigencia'

if (process.env.TZ !== 'UTC' && Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC') {
  console.error('\n✗ Correr con TZ=UTC. Sin eso los casos de borde nocturno dan falso verde.\n')
  process.exit(1)
}

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

/** Mediodía UTC del día D — sin ambigüedad de zona. */
const dia = (s: string) => new Date(`${s}T12:00:00.000Z`)
const FIN = '2026-09-10'

console.log(`\n▸ Plazo de ${DIAS_GRACIA_RECAPTURA} días desde fecha_fin = ${FIN}`)

console.log('\n▸ 1. Con la campaña vigente no hay prórroga corriendo')
caso('el día antes', puedeRecapturar(FIN, dia('2026-09-09')),
  { ok: true, enProrroga: false, diasRestantes: null })
// fecha_fin es INCLUSIVA: el último día vale entero.
caso('el propio último día', puedeRecapturar(FIN, dia('2026-09-10')),
  { ok: true, enProrroga: false, diasRestantes: null })
caso('CONTROL — ese día estaVencida dice que no', estaVencida(FIN, dia('2026-09-10')), false)

console.log('\n▸ 2. Vencida: la prórroga corre y se puede decir cuánto queda')
caso('venció ayer → quedan los 7 enteros', puedeRecapturar(FIN, dia('2026-09-11')),
  { ok: true, enProrroga: true, diasRestantes: 7 })
caso('venció hace 3 → quedan 5', puedeRecapturar(FIN, dia('2026-09-13')),
  { ok: true, enProrroga: true, diasRestantes: 5 })

console.log('\n▸ 3. LOS DOS BORDES')
caso('el ÚLTIMO día de prórroga acepta, y avisa que es el último',
  puedeRecapturar(FIN, dia('2026-09-17')),
  { ok: true, enProrroga: true, diasRestantes: 1 })
caso('el día SIGUIENTE ya no acepta',
  puedeRecapturar(FIN, dia('2026-09-18')),
  { ok: false, enProrroga: true, diasRestantes: 0 })
caso('y mucho después tampoco, sin números negativos',
  puedeRecapturar(FIN, dia('2027-03-01')),
  { ok: false, enProrroga: true, diasRestantes: 0 })

console.log('\n▸ 4. La noche argentina, que es donde se corre el día')
// 22:00 AR del 17/9 = 01:00 UTC del 18/9. El servidor ya está en el día
// siguiente; el gondolero todavía está en su último día de prórroga.
const NOCHE_DEL_17 = new Date('2026-09-18T01:00:00.000Z')
caso('a las 22:00 AR del último día TODAVÍA acepta',
  puedeRecapturar(FIN, NOCHE_DEL_17), { ok: true, enProrroga: true, diasRestantes: 1 })
// Y el control que prueba que el caso de arriba no es trivial: una hora antes
// en UTC es el mismo día allá y acá, así que no distingue nada.
caso('CONTROL — a las 18:00 AR del mismo día también',
  puedeRecapturar(FIN, new Date('2026-09-17T21:00:00.000Z')),
  { ok: true, enProrroga: true, diasRestantes: 1 })

console.log('\n▸ 5. Sin fecha_fin nunca vence (seguimiento, o legacy)')
caso('null',      puedeRecapturar(null),      { ok: true, enProrroga: false, diasRestantes: null })
caso('undefined', puedeRecapturar(undefined), { ok: true, enProrroga: false, diasRestantes: null })

console.log('\n▸ 6. El plazo NO está aliasado al TTL de la cola')
// Valen lo mismo hoy, y responden preguntas distintas: cuánto tarda una
// persona en volver a un comercio contra cuánto sobrevive un payload en IDB.
// Este control no compara los valores —eso los ataría— sino que existan por
// separado: si alguien reemplaza la constante por el TTL, el import falla.
caso('es su propia constante y es positiva',
  typeof DIAS_GRACIA_RECAPTURA === 'number' && DIAS_GRACIA_RECAPTURA > 0, true)

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exit(fallos ? 1 : 0)
