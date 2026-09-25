/**
 * probar-localidad-sugerida.mts — el camino COMPLETO contra dev: red, padrón y
 * escritura. Crea comercios de prueba, los geocodifica y los borra.
 *
 *   npx tsx scripts/probar-localidad-sugerida.mts
 *
 * Se niega contra producción: crea y borra filas.
 *
 * ── POR QUÉ EXISTE, SI YA ESTÁ probar-geocoding.ts ──────────────────────────
 * Ese cubre la DECISIÓN —`lib/geocoding.ts`, pura, 27 controles—. Lo que no
 * puede cubrir es el cableado: que la key sea la correcta, que el padrón se
 * traiga con los acentos bien, que el CHECK de la base acepte lo que la lib
 * produce, y que un fallo del proveedor no voltee nada.
 *
 * Es exactamente el hueco que costó los dos bugs del 25/9: funciones correctas
 * y un llamador que les pasaba de menos. Una suite que solo prueba las piezas
 * se queda verde contra ese error.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { sugerirLocalidad } from '../lib/localidad-sugerida'

const REF = 'mqeymmprvpclpyjpujvf'
if (nombreDeRef(REF) !== 'dev') { console.error('\n✗ Este script es solo para dev.\n'); process.exit(1) }

const { vars } = credencialesDeRef(REF)
for (const k of ['PGURL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEOAPIFY_SERVER_KEY']) {
  if (!vars[k]) { console.error(`\n✗ Falta ${k} en el .env de dev\n`); process.exit(1) }
}
// `sugerirLocalidad` lee la key del entorno del proceso, igual que en el server.
process.env.GEOAPIFY_SERVER_KEY = vars.GEOAPIFY_SERVER_KEY

const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const pg = new Client({ connectionString: vars.PGURL })
await pg.connect()

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const creados: string[] = []
async function comercioDePrueba(lat: number, lng: number): Promise<string> {
  const { rows } = await pg.query(
    `INSERT INTO comercios (nombre, tipo, lat, lng, validado, estado)
     VALUES ('[TEST geocoding] borrar', 'kiosco', $1, $2, false, 'pendiente_validacion')
     RETURNING id`, [lat, lng])
  creados.push(rows[0].id)
  return rows[0].id
}
async function leer(id: string) {
  const { rows } = await pg.query(
    `SELECT localidad_id, localidad_sugerida_id, localidad_sugerida_estado, localidad_sugerida_texto
       FROM comercios WHERE id = $1`, [id])
  return rows[0]
}

try {
  // Las columnas de la etapa 3 tienen que estar aplicadas.
  const { rows: cols } = await pg.query(`
    SELECT count(*) n FROM information_schema.columns
     WHERE table_name='comercios' AND column_name LIKE 'localidad_sugerida%'`)
  if (Number(cols[0].n) !== 3) {
    console.error('\n✗ Falta la migración 20261001100000. Correla antes.\n'); process.exit(1)
  }

  console.log('\n▸ Un punto en Colón — resuelve exacto y guarda el id')
  {
    // Las coordenadas de un comercio real de Colón, el pueblo del piloto.
    const { rows } = await pg.query(`
      SELECT co.lat, co.lng FROM comercios co JOIN localidades l ON l.id=co.localidad_id
       WHERE l.nombre='Colón' AND co.lat IS NOT NULL LIMIT 1`)
    const id = await comercioDePrueba(Number(rows[0].lat), Number(rows[0].lng))
    await sugerirLocalidad(id, Number(rows[0].lat), Number(rows[0].lng), admin as never)
    const r = await leer(id)
    caso('el estado es exacto', r.localidad_sugerida_estado, 'exacto')
    caso('guardó un id de localidad', r.localidad_sugerida_id !== null, true)
    caso('y el id es el Colón que quedó después de la etapa 1',
      (await pg.query('SELECT nombre FROM localidades WHERE id=$1', [r.localidad_sugerida_id])).rows[0].nombre,
      'Colón')
    caso('LO QUE MÁS IMPORTA — NO tocó localidad_id', r.localidad_id, null)
  }

  console.log('\n▸ Un punto en el medio del mar — el proveedor no tiene qué decir')
  {
    const id = await comercioDePrueba(-40.0, -50.0)
    await sugerirLocalidad(id, -40.0, -50.0, admin as never)
    const r = await leer(id)
    caso('queda sin_dato o fuera, no exacto',
      ['sin_dato', 'fuera'].includes(r.localidad_sugerida_estado), true)
    caso('sin id de localidad', r.localidad_sugerida_id, null)
    caso('y sin tocar localidad_id', r.localidad_id, null)
  }

  console.log('\n▸ FALLA ABIERTO — sin key, el alta no se entera')
  {
    const guardada = process.env.GEOAPIFY_SERVER_KEY
    delete process.env.GEOAPIFY_SERVER_KEY
    const id = await comercioDePrueba(-31.3930, -58.0209)
    let tiro = false
    try { await sugerirLocalidad(id, -31.3930, -58.0209, admin as never) } catch { tiro = true }
    process.env.GEOAPIFY_SERVER_KEY = guardada
    caso('no lanza', tiro, false)
    const r = await leer(id)
    caso('y deja estado=error, que NO es sin_dato', r.localidad_sugerida_estado, 'error')
    caso('la diferencia permite reprocesar solo lo que falta',
      r.localidad_sugerida_estado !== 'sin_dato', true)
  }

  console.log('\n▸ Una coordenada imposible — tampoco voltea nada')
  {
    const id = await comercioDePrueba(-31.3930, -58.0209)
    let tiro = false
    try { await sugerirLocalidad(id, 999, 999, admin as never) } catch { tiro = true }
    caso('no lanza', tiro, false)
    const r = await leer(id)
    caso('queda con algún estado y sin id',
      r.localidad_sugerida_estado !== null && r.localidad_sugerida_id === null, true)
  }

  console.log('\n▸ El CHECK de la base acepta todo lo que la lib produce')
  {
    const { rows } = await pg.query(`
      SELECT DISTINCT localidad_sugerida_estado e FROM comercios
       WHERE id = ANY($1::uuid[]) AND localidad_sugerida_estado IS NOT NULL`, [creados])
    caso('ninguna escritura fue rechazada por constraint', rows.length > 0, true)
    console.log('       estados vistos: ' + rows.map((x: { e: string }) => x.e).join(', '))
  }

} catch (e) {
  console.error('\n✗ Excepción:', e instanceof Error ? e.message : e)
  fallos++
} finally {
  if (creados.length) {
    await pg.query('DELETE FROM comercios WHERE id = ANY($1::uuid[])', [creados])
    const { rows } = await pg.query(
      `SELECT count(*) n FROM comercios WHERE id = ANY($1::uuid[])`, [creados])
    console.log(`\n▸ Limpieza: ${creados.length} comercios de prueba borrados (quedan ${rows[0].n})`)
    if (Number(rows[0].n) !== 0) { console.error('✗ QUEDARON FILAS DE PRUEBA EN DEV'); fallos++ }
  }
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exit(fallos ? 1 : 0)
