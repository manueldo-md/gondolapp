/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * scripts/probar-fecha-ar.ts
 * Las fronteras de lib/fecha-ar.ts, que son donde vive el bug de zona horaria.
 *
 *   npx tsx scripts/probar-fecha-ar.ts
 *
 * Sale con 1 si algo falla. No toca la base ni la red.
 *
 * Corre con el reloj del proceso donde esté: los casos se escriben en UTC
 * explícito, así que el resultado no depende de la zona de la máquina. Eso es
 * justamente lo que hay que poder afirmar — el servidor de Vercel corre en UTC
 * y esta máquina en UTC−3.
 */
import {
  diaAR, diaDeLaSemanaAR, semanaDe, diasCompletosDeLaSemana,
  visitasEsperadas, medianocheAR, sumarDias,
} from '../lib/fecha-ar'

let fallos = 0

function ok(titulo: string, real: unknown, esperado: unknown) {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`  ${bien ? 'OK  ' : 'FALLA'} ${titulo}`)
  if (!bien) console.log(`        esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`)
}

// ── 1. La frontera del día ───────────────────────────────────────────────────
// 2026-09-21 a las 20:59 AR = 23:59 UTC del 21.
// 2026-09-21 a las 21:01 AR = 00:01 UTC del 22.  ← el servidor ya cambió de día
console.log('\n── 1. la frontera de las 21:00 (donde el servidor se adelanta) ──')
ok('20:59 AR sigue siendo el 21',  diaAR('2026-09-21T23:59:00Z'), '2026-09-21')
ok('21:01 AR sigue siendo el 21',  diaAR('2026-09-22T00:01:00Z'), '2026-09-21')
ok('00:01 AR ya es el 22',         diaAR('2026-09-22T03:01:00Z'), '2026-09-22')
ok('23:59:59.999 AR sigue el 21',  diaAR('2026-09-22T02:59:59.999Z'), '2026-09-21')

// El bug que esto evita, escrito como afirmación:
const ingenuo = new Date('2026-09-22T00:01:00Z').toISOString().slice(0, 10)
ok('el cálculo ingenuo SÍ se equivoca (control)', ingenuo, '2026-09-22')

// ── 2. Día de la semana ──────────────────────────────────────────────────────
console.log('\n── 2. día de la semana, lunes = 1 ──')
ok('2026-09-21 es lunes',  diaDeLaSemanaAR('2026-09-21T15:00:00Z'), 1)
ok('2026-09-27 es domingo', diaDeLaSemanaAR('2026-09-27T15:00:00Z'), 7)
ok('domingo 23:30 AR sigue siendo domingo', diaDeLaSemanaAR('2026-09-28T02:30:00Z'), 7)
ok('lunes 00:30 AR ya es lunes',            diaDeLaSemanaAR('2026-09-28T03:30:00Z'), 1)

// ── 3. La semana ─────────────────────────────────────────────────────────────
console.log('\n── 3. la semana de lunes a domingo ──')
const s = semanaDe('2026-09-24T15:00:00Z')   // un jueves
ok('lunes de la semana',   s.lunes,   '2026-09-21')
ok('domingo de la semana', s.domingo, '2026-09-27')
ok('desde = medianoche AR del lunes', s.desde.toISOString(), '2026-09-21T03:00:00.000Z')
ok('hasta = medianoche AR del lunes siguiente', s.hasta.toISOString(), '2026-09-28T03:00:00.000Z')

// El rango semiabierto: el domingo a las 23:59:30 tiene que caer ADENTRO.
const casiLunes = new Date('2026-09-28T02:59:30Z')
ok('domingo 23:59:30 entra en la semana',
  casiLunes >= s.desde && casiLunes < s.hasta, true)
ok('y NO entra en la siguiente',
  casiLunes >= semanaDe('2026-09-29T15:00:00Z').desde, false)

// Una misión del domingo a las 22:00 AR: el servidor la ve el lunes en UTC.
ok('domingo 22:00 AR cae en la semana que termina', semanaDe('2026-09-28T01:00:00Z').lunes, '2026-09-21')

// ── 4. Días completos ────────────────────────────────────────────────────────
console.log('\n── 4. días completos: el de hoy no cuenta ──')
ok('lunes 08:00 AR → 0 completos',  diasCompletosDeLaSemana('2026-09-21T11:00:00Z'), 0)
ok('lunes 23:00 AR → 0 completos',  diasCompletosDeLaSemana('2026-09-22T02:00:00Z'), 0)
ok('martes 08:00 AR → 1 completo',  diasCompletosDeLaSemana('2026-09-22T11:00:00Z'), 1)
ok('domingo 23:00 AR → 6 completos', diasCompletosDeLaSemana('2026-09-28T02:00:00Z'), 6)

// ── 5. El prorrateo ──────────────────────────────────────────────────────────
console.log('\n── 5. visitas esperadas: floor(frecuencia × completos / 7) ──')
const semanaDeEjemplo = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
                         '2026-09-25', '2026-09-26', '2026-09-27']
const alMediodia = (dia: string) => `${dia}T15:00:00Z`   // 12:00 AR

for (const [frec, esperado] of [[1, [0, 0, 0, 0, 0, 0, 0]], [2, [0, 0, 0, 0, 1, 1, 1]],
                                [5, [0, 0, 1, 2, 2, 3, 4]], [7, [0, 1, 2, 3, 4, 5, 6]]] as const) {
  const real = semanaDeEjemplo.map(d => visitasEsperadas({ visitasPorSemana: frec, ahora: alMediodia(d) }))
  ok(`frecuencia ${frec} → ${esperado.join(' ')}`, real, [...esperado])
}

// Lo que la fórmula anterior hacía mal, escrito como afirmación:
ok('el lunes arranca en CERO con frecuencia 2',
  visitasEsperadas({ visitasPorSemana: 2, ahora: alMediodia('2026-09-21') }), 0)
ok('el jueves NO exige 2 con frecuencia 2',
  visitasEsperadas({ visitasPorSemana: 2, ahora: alMediodia('2026-09-24') }), 0)

// ── 6. Campaña que arranca a mitad de semana ─────────────────────────────────
console.log('\n── 6. campaña arrancada a mitad de semana ──')
// Arranca el miércoles 23; el domingo 27 solo tuvo 4 días completos, no 6.
ok('sin fecha_inicio, domingo → 1 (frec 2)',
  visitasEsperadas({ visitasPorSemana: 2, ahora: alMediodia('2026-09-27') }), 1)
ok('arrancando el miércoles, domingo → 1 (frec 5)',
  visitasEsperadas({ visitasPorSemana: 5, ahora: alMediodia('2026-09-27'), desde: '2026-09-23' }), 2)
ok('fecha_inicio anterior a la semana no descuenta nada',
  visitasEsperadas({ visitasPorSemana: 5, ahora: alMediodia('2026-09-27'), desde: '2026-09-01' }), 4)

// ── 7. Utilidades ────────────────────────────────────────────────────────────
console.log('\n── 7. medianocheAR y sumarDias ──')
ok('medianoche del 21 = 03:00 UTC', medianocheAR('2026-09-21').toISOString(), '2026-09-21T03:00:00.000Z')
ok('sumar 1 día cruza de mes', sumarDias('2026-09-30', 1), '2026-10-01')
ok('restar 1 día cruza de mes', sumarDias('2026-10-01', -1), '2026-09-30')
ok('cruza de año', sumarDias('2026-12-31', 1), '2027-01-01')
ok('año bisiesto', sumarDias('2028-02-28', 1), '2028-02-29')

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
