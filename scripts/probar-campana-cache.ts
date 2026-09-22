/**
 * probar-campana-cache.ts — SOLO LÓGICA, sin base ni browser.
 *
 * Ejercita el TTL y la decisión de refetch de lib/campana-cache.ts con un
 * IndexedDB de mentira. Lo que no se puede probar acá —que el gondolero vea el
 * cartel, que el precache al unirse escriba— es de campo.
 *
 *   npx tsx scripts/probar-campana-cache.ts
 */
import { campanaCacheVencido, fechaCacheRelativa, CAMPANA_CACHE_TTL_MS, type CampanaCacheEntry } from '../lib/campana-cache'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const HORA = 60 * 60 * 1000
const AHORA = new Date('2026-09-22T15:00:00-03:00').getTime()
const entry = (edadHoras: number): CampanaCacheEntry =>
  ({ data: {} as never, timestamp: AHORA - edadHoras * HORA, updatedAt: 'x' })

console.log('\n▸ El TTL')
caso('recién guardado no vence', campanaCacheVencido(entry(0), AHORA), false)
caso('11 h no vence', campanaCacheVencido(entry(11), AHORA), false)
caso('12 h justas todavía no vencen', campanaCacheVencido(entry(12), AHORA), false)
caso('13 h vence', campanaCacheVencido(entry(13), AHORA), true)
caso('una semana vence', campanaCacheVencido(entry(24 * 7), AHORA), true)

// El caché del formato viejo: timestamp 0 → siempre vencido, así que la primera
// vez que haya señal se revisa. Es lo que se quiere, no un accidente.
caso('el formato viejo (timestamp 0) nace vencido',
  campanaCacheVencido({ data: {} as never, timestamp: 0, updatedAt: null }, AHORA), true)

caso('CONTROL — el TTL son 12 horas', CAMPANA_CACHE_TTL_MS, 12 * HORA)

console.log('\n▸ El texto del aviso')
caso('de hoy', fechaCacheRelativa(AHORA - 7 * HORA, AHORA).startsWith('de hoy a las'), true)
caso('de ayer', fechaCacheRelativa(AHORA - 24 * HORA, AHORA), 'de ayer')
// Se comparan los textos enteros y no un patrón: `\w` no matchea la tilde de
// "sábado", y la primera versión de esta prueba fallaba por eso —por el test,
// no por el código—. Un literal no se presta a esa confusión.
caso('dentro de la semana nombra el día',
  fechaCacheRelativa(AHORA - 3 * 24 * HORA, AHORA), 'del sábado')
caso('más de una semana da la fecha',
  fechaCacheRelativa(AHORA - 10 * 24 * HORA, AHORA), 'del 12 de septiembre')
caso('el formato viejo no dice "1 de enero de 1970"',
  fechaCacheRelativa(0, AHORA), 'de una versión anterior de la app')

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
