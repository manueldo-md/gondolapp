/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * scripts/probar-cobertura.ts
 * El cálculo de cobertura, contra casos armados a mano.
 *
 *   npx tsx scripts/probar-cobertura.ts
 *
 * Sale con 1 si algo falla. No toca la base ni la red: `calcularCobertura` es
 * pura, y esa es la razón de que se pueda probar así.
 *
 * La semana de referencia es 2026-09-21 (lunes) a 2026-09-27 (domingo).
 */
import { calcularCobertura, etiquetaUltimaVisita, type VisitaMision } from '../lib/cobertura-seguimiento'

let fallos = 0
function ok(titulo: string, real: unknown, esperado: unknown) {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`  ${bien ? 'OK  ' : 'FALLA'} ${titulo}`)
  if (!bien) console.log(`        esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`)
}

/** Una misión el día `dia` a las 12:00 AR. */
const v = (comercio: string, dia: string, estado = 'aprobada', gondolero = 'g1'): VisitaMision => ({
  comercio_id: comercio, gondolero_id: gondolero, estado,
  capturada_at: `${dia}T15:00:00.000Z`,
})

const NOMBRES = new Map([['c1', 'Almacén LB'], ['c2', 'Dietética LB'], ['c3', 'AutoSEN']])
const VIERNES = new Date('2026-09-25T15:00:00Z')   // 12:00 AR, 4 días completos

// ── 1. Los tres estados ──────────────────────────────────────────────────────
console.log('\n── 1. los tres estados, viernes, frecuencia 2 (esperadas = 1) ──')
{
  const r = calcularCobertura({
    misiones: [
      v('c1', '2026-09-21'), v('c1', '2026-09-22'),   // 2 → cumplió la semana
      v('c2', '2026-09-22'),                          // 1 → va bien (esperadas 1)
      v('c3', '2026-09-14'),                          // 0 esta semana → atrasado
    ],
    nombresComercio: NOMBRES, visitasPorSemana: 2, ahora: VIERNES,
  })
  ok('esperadas del viernes con frecuencia 2', r.comercios[0].esperadas, 1)
  ok('los atrasados primero', r.comercios.map(c => c.nombre), ['AutoSEN', 'Dietética LB', 'Almacén LB'])
  ok('estados', r.comercios.map(c => c.estado), ['atrasado', 'va_bien', 'al_dia'])
  ok('visitas de la semana', r.comercios.map(c => c.visitas), [0, 1, 2])
  ok('meta de la semana = 3 comercios × 2', r.metaSemana, 6)
  ok('esperadas hoy = 3 × 1', r.esperadasHoy, 3)
  ok('visitas hechas', r.visitasHechas, 3)
}

// ── 2. El universo son los visitados alguna vez, no los de la semana ─────────
console.log('\n── 2. el universo: un comercio sin visitas ESTA semana sigue contando ──')
{
  const r = calcularCobertura({
    misiones: [v('c3', '2026-08-01')],   // visitado hace mes y medio, nunca más
    nombresComercio: NOMBRES, visitasPorSemana: 2, ahora: VIERNES,
  })
  ok('aparece igual', r.comercios.length, 1)
  ok('y aparece atrasado', r.comercios[0].estado, 'atrasado')
  ok('con su última visita real', r.comercios[0].ultimaVisita, '2026-08-01')
  ok('la meta lo cuenta', r.metaSemana, 2)
}

// ── 3. Qué cuenta como visita ────────────────────────────────────────────────
console.log('\n── 3. pendiente cuenta, descartada no ──')
{
  const r = calcularCobertura({
    misiones: [
      v('c1', '2026-09-22', 'pendiente'),
      v('c1', '2026-09-23', 'descartada'),
      v('c1', '2026-09-24', null as any),   // estado NULL: cuenta
    ],
    nombresComercio: NOMBRES, visitasPorSemana: 3, ahora: VIERNES,
  })
  ok('2 visitas: la pendiente y la de estado NULL', r.comercios[0].visitas, 2)
}
{
  // Un comercio con SOLO descartadas no entra al universo: nunca se visitó.
  const r = calcularCobertura({
    misiones: [v('c3', '2026-09-22', 'descartada')],
    nombresComercio: NOMBRES, visitasPorSemana: 2, ahora: VIERNES,
  })
  ok('un comercio con solo descartadas no existe para el reporte', r.comercios.length, 0)
}

// ── 4. La frontera de la semana ──────────────────────────────────────────────
console.log('\n── 4. la frontera: domingo 22:00 AR cuenta en la semana que termina ──')
{
  const r = calcularCobertura({
    misiones: [
      // 2026-09-28T01:00:00Z = domingo 27 a las 22:00 AR. En UTC ya es lunes.
      { comercio_id: 'c1', gondolero_id: 'g1', estado: 'aprobada', capturada_at: '2026-09-28T01:00:00.000Z' },
    ],
    nombresComercio: NOMBRES, visitasPorSemana: 1,
    ahora: new Date('2026-09-27T23:00:00Z'),   // domingo 20:00 AR
  })
  ok('la visita del domingo a las 22 entra en su semana', r.comercios[0].visitas, 1)
  ok('y la semana es la del 21', r.semana.lunes, '2026-09-21')
}

// ── 5. El lunes arranca en cero ──────────────────────────────────────────────
console.log('\n── 5. el lunes a las 8 nadie está atrasado ──')
{
  const LUNES_8AM = new Date('2026-09-21T11:00:00Z')
  const r = calcularCobertura({
    misiones: [v('c1', '2026-09-15')],   // última visita la semana pasada
    nombresComercio: NOMBRES, visitasPorSemana: 2, ahora: LUNES_8AM,
  })
  ok('esperadas el lunes = 0', r.comercios[0].esperadas, 0)
  ok('con 0 visitas NO está atrasado', r.comercios[0].estado, 'va_bien')
}

// ── 6. Varios gondoleros en el mismo comercio ────────────────────────────────
console.log('\n── 6. el mismo comercio visitado por dos personas ──')
{
  const r = calcularCobertura({
    misiones: [v('c2', '2026-09-22', 'aprobada', 'g1'), v('c2', '2026-09-23', 'aprobada', 'g2')],
    nombresComercio: NOMBRES, visitasPorSemana: 2, ahora: VIERNES,
  })
  ok('cuenta las dos visitas', r.comercios[0].visitas, 2)
  ok('y registra los dos gondoleros', r.comercios[0].gondoleroIds.sort(), ['g1', 'g2'])
}

// ── 7. Semana cerrada ────────────────────────────────────────────────────────
console.log('\n── 7. "en curso" se mide contra la semana de HOY, no contra la del caso ──')
{
  // Una semana lejana en el pasado: no puede ser la actual bajo ningún reloj.
  const r = calcularCobertura({
    misiones: [v('c1', '2020-01-07')],
    nombresComercio: NOMBRES, visitasPorSemana: 2,
    ahora: new Date('2020-01-09T15:00:00Z'),
  })
  ok('una semana de 2020 no está en curso', r.enCurso, false)
  ok('y su lunes es el 6 de enero', r.semana.lunes, '2020-01-06')
}
{
  // Y la de hoy sí, sea cual sea el día en que se corra esto.
  const r = calcularCobertura({
    misiones: [], nombresComercio: NOMBRES, visitasPorSemana: 2, ahora: new Date(),
  })
  ok('la semana de hoy sí está en curso', r.enCurso, true)
}

// ── 8. La etiqueta de última visita ──────────────────────────────────────────
console.log('\n── 8. etiquetaUltimaVisita ──')
ok('hoy',            etiquetaUltimaVisita('2026-09-25', 0), 'hoy')
ok('ayer',           etiquetaUltimaVisita('2026-09-24', 1), 'ayer')
ok('dentro de la semana usa el nombre del día', etiquetaUltimaVisita('2026-09-22', 3), 'martes')
ok('más de una semana usa los días',            etiquetaUltimaVisita('2026-09-10', 15), 'hace 15 días')
ok('sin visitas',    etiquetaUltimaVisita(null, null), 'nunca')

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
