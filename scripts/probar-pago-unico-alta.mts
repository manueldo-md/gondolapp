/**
 * probar-pago-unico-alta.mts — el camino COMPLETO contra dev, con escritura.
 *
 *   npx tsx scripts/probar-pago-unico-alta.mts
 *
 * Se niega contra producción: crea y borra filas.
 *
 * ── LA PREGUNTA QUE CONTESTA ────────────────────────────────────────────────
 * **¿Se puede pagar dos veces el mismo comercio?**
 *
 * Los dos escenarios, encadenados, que es como aparecen en la vida:
 *
 *   1. validar   → se crea la misión y se paga.
 *   2. rechazar  → la misión se cierra y **la plata NO se toca**.
 *   3. REVALIDAR → no se crea otra misión y no se paga de nuevo.
 *
 * El paso 3 es el que justifica este archivo. Hasta el 26/9/2026 el paso 2
 * dejaba la misión en 'aprobada' —un `.neq('estado','aprobada')` sin
 * comentario— y la guarda de idempotencia la encontraba. Al cerrar la misión
 * en 'descartada', esa guarda dejó de verla: buscaba **"hay misión viva"**, y
 * una descartada no lo es. El paso 3 habría pagado 400 puntos por un comercio.
 *
 * Por eso el criterio pasó a ser **"este comercio ya se pagó"** —hay un bounty
 * acreditado— que es el invariante, no una consecuencia suya. Mismo cambio de
 * forma que "la lista ES el permiso".
 *
 * ── Y POR QUÉ CONTRA LA BASE Y NO CON MOCKS ─────────────────────────────────
 * Porque lo que se rompió no fue una función: fue el acuerdo entre dos que se
 * leían distinto. Un mock del `find()` habría seguido en verde.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { validarComercioYCrearMision, rechazarComercioConMotivo } from '../lib/validacion-comercio'

const REF = 'mqeymmprvpclpyjpujvf'
if (nombreDeRef(REF) !== 'dev') { console.error('\n✗ Este script es solo para dev.\n'); process.exit(1) }

const { vars } = credencialesDeRef(REF)
for (const k of ['PGURL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!vars[k]) { console.error(`\n✗ Falta ${k} en el .env de dev\n`); process.exit(1) }
}

// Las funciones de `lib/` construyen sus propios clientes desde `process.env`
// en algún punto de la cadena —`sincronizarComerciosRelevados` y compañía—, y
// un script no tiene el entorno de Next. Sin esto explota con "supabaseUrl is
// required" recién adentro de la primera llamada, que es donde menos se
// entiende.
process.env.NEXT_PUBLIC_SUPABASE_URL  = vars.NEXT_PUBLIC_SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = vars.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const pg = new Client({ connectionString: vars.PGURL, ssl: { rejectUnauthorized: false } })
await pg.connect()

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
const uno = async (q: string, a: unknown[] = []) => (await pg.query(q, a)).rows[0]

const SUFIJO = `dry-${Date.now()}`
let campanaId = ''
let comercioId = ''
let gondoleroId = ''

/** Cuánto cobró el gondolero en esta campaña, sumando movimientos. */
const cobrado = async () => Number((await uno(
  `SELECT coalesce(sum(monto), 0) s FROM movimientos_puntos
    WHERE gondolero_id = $1 AND campana_id = $2`, [gondoleroId, campanaId])).s)
const misionesDelComercio = async () => (await pg.query(
  `SELECT id, estado, bounty_estado, puntos_total FROM misiones
    WHERE campana_id = $1 AND comercio_id = $2 ORDER BY created_at`,
  [campanaId, comercioId])).rows

console.log(`\n▸ Pago único del alta — contra ${nombreDeRef(REF)}`)

try {
  // ── Setup ────────────────────────────────────────────────────────────────
  const g = await uno(`SELECT id FROM profiles WHERE tipo_actor = 'gondolero' LIMIT 1`)
  if (!g) throw new Error('No hay ningún gondolero en dev')
  gondoleroId = g.id

  // `min_comercios_para_cobrar = 1` para que el pago salga en el acto y el
  // control mida el pago y no el mínimo, que es otra regla y ya tiene prueba.
  // `modalidad='puntual'` + `fecha_fin` no son decoración: los pide
  // `campanas_fecha_fin_por_modalidad`, y una campaña activa sin fecha rebota.
  campanaId = (await uno(`
    INSERT INTO campanas (nombre, tipo, estado, financiada_por, puntos_por_mision,
                          min_comercios_para_cobrar, max_comercios_por_gondolero,
                          modalidad, fecha_fin)
    VALUES ($1, 'comercios', 'activa', 'gondolapp', 200, 1, 20,
            'puntual', CURRENT_DATE + 30) RETURNING id`,
    [`Alta ${SUFIJO}`])).id

  comercioId = (await uno(`
    INSERT INTO comercios (nombre, lat, lng, estado, campana_id, registrado_por, validado)
    VALUES ($1, -31.39, -58.02, 'pendiente_validacion', $2, $3, false) RETURNING id`,
    [`Comercio ${SUFIJO}`, campanaId, gondoleroId])).id

  const cobradoInicial = await cobrado()
  caso('CONTROL — arranca sin cobrar nada en esta campaña', cobradoInicial, 0)

  // ── 1. Validar: se crea la misión y se paga ──────────────────────────────
  console.log('\n▸ 1. Se valida el comercio')
  const r1 = await validarComercioYCrearMision(comercioId, admin)
  caso('la validación dice ok', r1.ok, true)
  const tras1 = await misionesDelComercio()
  caso('hay UNA misión', tras1.length, 1)
  caso('aprobada y acreditada', [tras1[0]?.estado, tras1[0]?.bounty_estado],
    ['aprobada', 'acreditado'])
  caso('cobró los 200', await cobrado(), 200)

  // ── 2. Rechazar: se cierra y la plata queda ──────────────────────────────
  console.log('\n▸ 2. Se rechaza el comercio DESPUÉS de haberlo pagado')
  const r2 = await rechazarComercioConMotivo(comercioId, 'Mal ubicado en el mapa', admin)
  caso('el rechazo dice ok', r2.ok, true)
  const tras2 = await misionesDelComercio()
  caso('sigue habiendo UNA misión', tras2.length, 1)
  caso('ahora descartada', tras2[0]?.estado, 'descartada')
  caso('Y EL BOUNTY SIGUE ACREDITADO — el gondolero no hizo nada mal',
    tras2[0]?.bounty_estado, 'acreditado')
  caso('no se le quitó la plata', await cobrado(), 200)

  // ── 3. Revalidar: NO se paga de nuevo ────────────────────────────────────
  // Éste es el caso. Con el criterio viejo —"hay misión viva"— la descartada
  // no contaba, se creaba una segunda misión y se pagaban otros 200.
  console.log('\n▸ 3. Se REVALIDA el mismo comercio')
  const r3 = await validarComercioYCrearMision(comercioId, admin)
  caso('la revalidación dice ok', r3.ok, true)
  const tras3 = await misionesDelComercio()
  caso('NO se creó una segunda misión', tras3.length, 1)
  caso('SIGUEN SIENDO 200 Y NO 400', await cobrado(), 200)
  caso('y el movimiento es uno solo', Number((await uno(
    `SELECT count(*)::int n FROM movimientos_puntos
      WHERE gondolero_id = $1 AND campana_id = $2`, [gondoleroId, campanaId])).n), 1)

  // ── 4. Y el camino normal sigue funcionando ──────────────────────────────
  // Sin esto, una guarda que rechace TODO también daría verde arriba: "no paga
  // dos veces" lo cumple igual de bien la que no paga nunca.
  console.log('\n▸ 4. CONTROL — un comercio nuevo de la misma campaña SÍ se paga')
  const otroId = (await uno(`
    INSERT INTO comercios (nombre, lat, lng, estado, campana_id, registrado_por, validado)
    VALUES ($1, -31.40, -58.03, 'pendiente_validacion', $2, $3, false) RETURNING id`,
    [`Comercio2 ${SUFIJO}`, campanaId, gondoleroId])).id
  await validarComercioYCrearMision(otroId, admin)
  caso('ahora sí cobró 400 en total', await cobrado(), 400)
  await pg.query(`DELETE FROM misiones WHERE comercio_id = $1`, [otroId])
  await pg.query(`DELETE FROM fotos WHERE comercio_id = $1`, [otroId])
  await pg.query(`DELETE FROM comercios WHERE id = $1`, [otroId])

} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e instanceof Error ? e.message : String(e)}`)
} finally {
  // ── Limpieza ─────────────────────────────────────────────────────────────
  // En orden inverso de FK, y siempre: un test que deja basura en dev ensucia
  // las mediciones del próximo, que es como se llega a conclusiones falsas.
  try {
    if (campanaId) {
      await pg.query(`DELETE FROM movimientos_puntos WHERE campana_id = $1`, [campanaId])
      await pg.query(`DELETE FROM fotos WHERE campana_id = $1`, [campanaId])
      await pg.query(`DELETE FROM misiones WHERE campana_id = $1`, [campanaId])
      await pg.query(`DELETE FROM comercios WHERE campana_id = $1`, [campanaId])
      await pg.query(`DELETE FROM campanas WHERE id = $1`, [campanaId])
    }
    const resto = Number((await uno(
      `SELECT count(*)::int n FROM campanas WHERE nombre LIKE $1`, [`%${SUFIJO}%`])).n)
    if (resto > 0) console.log(`\n   ⚠ Quedaron ${resto} filas de prueba con el sufijo ${SUFIJO}`)
    else console.log('\n   · dev limpio: no quedó ninguna fila de prueba')
  } catch (e) {
    console.log(`\n   ⚠ La limpieza falló: ${e instanceof Error ? e.message : String(e)}`)
  }
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exit(fallos ? 1 : 0)
