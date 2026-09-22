/**
 * probar-postulacion-fixer.ts — SOLO LÓGICA, sin base.
 *
 * La ventana de 30 días y los estados del botón.
 *
 * El caso que manda es el del borde: a los 29 días y pico NO puede, a los 30 y
 * un minuto SÍ. Si el borde se corre para el lado equivocado, o el fixer se
 * queda afuera un día de más, o el rechazo no frena nada y vuelve a postularse
 * al toque — que es lo que la regla vino a evitar.
 *
 *   npx tsx scripts/probar-postulacion-fixer.ts
 */
import {
  estadoPostulacion,
  textoPostulacion,
  DIAS_ESPERA_REPOSTULACION,
} from '../lib/postulacion-fixer'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const AHORA = new Date('2026-10-24T15:00:00.000Z')
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString()
const rechazada = (d: number, motivo: string | null = null) =>
  ({ estado: 'rechazada', motivo_rechazo: motivo, rechazada_at: haceDias(d) })

console.log('\n▸ Los estados simples')
caso('sin fila, puede', estadoPostulacion(null, AHORA), { estado: 'puede' })
caso('pendiente', estadoPostulacion({ estado: 'pendiente' }, AHORA), { estado: 'pendiente' })
caso('aprobada = ya vinculado', estadoPostulacion({ estado: 'aprobada' }, AHORA), { estado: 'vinculado' })

console.log('\n▸ EL BORDE DE LOS 30 DÍAS')
caso('CONTROL — la ventana son 30 días', DIAS_ESPERA_REPOSTULACION, 30)
caso('recién rechazado: 30 días',
  estadoPostulacion(rechazada(0), AHORA),
  { estado: 'rechazada', motivo: null, diasRestantes: 30 })
caso('a los 29 días todavía NO puede',
  estadoPostulacion(rechazada(29), AHORA),
  { estado: 'rechazada', motivo: null, diasRestantes: 1 })
// El minuto que separa las dos respuestas.
const casiTreinta = { estado: 'rechazada', rechazada_at: new Date(AHORA.getTime() - (30 * 86_400_000 - 60_000)).toISOString() }
caso('a 30 días MENOS un minuto: no puede', estadoPostulacion(casiTreinta, AHORA).estado, 'rechazada')
caso('y le dice 1 día, no 0',
  (estadoPostulacion(casiTreinta, AHORA) as { diasRestantes: number }).diasRestantes, 1)
const treintaJustos = { estado: 'rechazada', rechazada_at: haceDias(30) }
caso('a los 30 justos YA puede', estadoPostulacion(treintaJustos, AHORA), { estado: 'puede' })
caso('a los 31, obvio', estadoPostulacion(rechazada(31), AHORA), { estado: 'puede' })

console.log('\n▸ El motivo viaja')
caso('con motivo',
  estadoPostulacion(rechazada(5, 'No cubrimos esa zona'), AHORA),
  { estado: 'rechazada', motivo: 'No cubrimos esa zona', diasRestantes: 25 })
caso('sin motivo, null y no un texto inventado',
  (estadoPostulacion(rechazada(5), AHORA) as { motivo: string | null }).motivo, null)

console.log('\n▸ Lo que falla ABIERTO, a propósito')
// Una fila rechazada de antes de la migración no tiene la marca. Bloquear por
// un dato que nosotros no guardamos dejaría a alguien afuera sin poder
// explicarle cuánto falta.
caso('rechazada sin rechazada_at: puede',
  estadoPostulacion({ estado: 'rechazada', rechazada_at: null }, AHORA), { estado: 'puede' })
caso('con una fecha que no se puede parsear: puede',
  estadoPostulacion({ estado: 'rechazada', rechazada_at: 'ayer' }, AHORA), { estado: 'puede' })
// 'terminada' es una DESVINCULACIÓN, no un "no" a una postulación: no espera.
caso('terminada no arrastra la espera',
  estadoPostulacion({ estado: 'terminada', rechazada_at: null }, AHORA), { estado: 'puede' })

console.log('\n▸ Los textos')
caso('puede',     textoPostulacion({ estado: 'puede' }), 'Postularme')
caso('pendiente', textoPostulacion({ estado: 'pendiente' }), 'Postulación enviada')
caso('a 1 día dice mañana, no "en 1 días"',
  textoPostulacion({ estado: 'rechazada', motivo: null, diasRestantes: 1 }),
  'Podés volver a postularte mañana')
caso('a varios días',
  textoPostulacion({ estado: 'rechazada', motivo: null, diasRestantes: 12 }),
  'Podés volver a postularte en 12 días')

console.log('\n▸ CONTROL — es una DURACIÓN, no un día calendario')
//
// La primera versión de este control afirmaba lo contrario —que rechazos a
// distintas horas del mismo día dan la misma espera— y se puso rojo. El test
// estaba mal, no el código: eso es precisamente lo que pasaría si la regla fuera
// de día calendario, y la decisión fue que NO lo sea.
//
// El discriminador de verdad: dos rechazos del MISMO día, a horas distintas,
// medidos en un instante que cae entre los dos vencimientos. Con día calendario
// los dos darían lo mismo; con duración, uno ya puede y el otro no.
const RECHAZO_TEMPRANO = '2026-09-24T08:00:00.000Z'
const RECHAZO_TARDE    = '2026-09-24T20:00:00.000Z'
const MEDIO = new Date('2026-10-24T14:00:00.000Z')   // 30d y 6h del primero, 29d y 18h del segundo

caso('CONTROL — los dos rechazos son del mismo día',
  [RECHAZO_TEMPRANO.slice(0, 10), RECHAZO_TARDE.slice(0, 10)], ['2026-09-24', '2026-09-24'])
caso('el de las 08:00 ya cumplió los 30 días',
  estadoPostulacion({ estado: 'rechazada', rechazada_at: RECHAZO_TEMPRANO }, MEDIO), { estado: 'puede' })
caso('el de las 20:00 del mismo día todavía no',
  estadoPostulacion({ estado: 'rechazada', rechazada_at: RECHAZO_TARDE }, MEDIO).estado, 'rechazada')

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
