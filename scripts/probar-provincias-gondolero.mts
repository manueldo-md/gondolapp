/**
 * probar-provincias-gondolero.mts — `provinciasDeGondoleros` contra dev.
 *
 *   npx tsx scripts/probar-provincias-gondolero.mts
 *
 * Se niega contra producción: crea y borra filas.
 *
 * ── LO QUE PRUEBA ───────────────────────────────────────────────────────────
 *
 *   1. QUE SUBA LA JERARQUÍA DESDE LOS TRES NIVELES. Provincia sale directo;
 *      departamento es un salto; localidad son DOS, porque `localidades` no
 *      tiene `provincia_id`. Ése es el punto entero de la función.
 *
 *   2. QUE EL QUE DECLARÓ UNA LOCALIDAD SUELTA ENTRE EN SU PROVINCIA. Es la
 *      decisión de producto de este tramo, y el control la fija: si alguien
 *      la cambia por "solo el nivel provincia", esto se pone en rojo.
 *
 *   3. QUE DOS GONDOLEROS SE CRUCEN AUNQUE HAYAN DECLARADO DISTINTO. Uno la
 *      provincia entera y otro una localidad de adentro: tienen que compartir
 *      ranking. Es el caso real de dev —Gabriel y Raúl— y es la razón por la
 *      que la versión literal no servía.
 *
 *   4. QUE EL QUE NO DECLARÓ NADA NO APAREZCA EN EL MAP. Que es, hoy, el
 *      100% de producción.
 *
 * ── CONTRA LA BASE Y NO CON MOCKS ───────────────────────────────────────────
 * Porque lo que se está probando es la CADENA del padrón, y un mock de
 * `localidades` la daría por buena. El embed a `provincia_id` que no existe ya
 * pasó una vez.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { provinciasDeGondoleros, nombresDeProvincias } from '../lib/zonas-gondolero'

const REF = 'mqeymmprvpclpyjpujvf'
if (nombreDeRef(REF) !== 'dev') { console.error('\n✗ Este script es solo para dev.\n'); process.exit(1) }

const { vars } = credencialesDeRef(REF)
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

const creados: string[] = []

console.log(`\n▸ provinciasDeGondoleros — contra ${nombreDeRef(REF)}`)

try {
  // ── Setup: tres gondoleros de prueba, uno por nivel ──────────────────────
  // Se eligen una provincia con departamentos y una localidad de adentro, así
  // los tres apuntan a la MISMA provincia por caminos distintos.
  const geo = await uno(`
    SELECT p.id prov, p.nombre prov_nombre, d.id depto, l.id loc
      FROM provincias p
      JOIN departamentos d ON d.provincia_id = p.id
      JOIN localidades   l ON l.departamento_id = d.id
     LIMIT 1`)
  if (!geo) throw new Error('El padrón está vacío: no hay provincia → departamento → localidad')
  console.log(`   geografía de prueba: ${geo.prov_nombre} (prov ${geo.prov}, depto ${geo.depto}, loc ${geo.loc})`)

  const base = await uno(`SELECT id FROM profiles WHERE tipo_actor = 'gondolero' LIMIT 1`)
  if (!base) throw new Error('No hay ningún gondolero en dev')

  // Se reusa un gondolero real y se le agregan filas, en vez de crear perfiles:
  // `profiles` cuelga de `auth.users` y un insert directo dejaría basura en dos
  // tablas. Las filas se borran al final.
  const yo = base.id as string
  const zonasPrevias = (await pg.query(
    `SELECT nivel, ref_id FROM gondolero_localidades WHERE gondolero_id = $1`, [yo])).rows
  await pg.query(`DELETE FROM gondolero_localidades WHERE gondolero_id = $1`, [yo])
  creados.push(yo)

  const declarar = async (nivel: string, refId: number) => {
    await pg.query(
      `INSERT INTO gondolero_localidades (gondolero_id, nivel, ref_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [yo, nivel, refId])
  }

  console.log('\n▸ 1. Los tres niveles resuelven a la MISMA provincia')
  for (const [nivel, ref] of [['provincia', geo.prov], ['departamento', geo.depto], ['localidad', geo.loc]] as const) {
    await pg.query(`DELETE FROM gondolero_localidades WHERE gondolero_id = $1`, [yo])
    await declarar(nivel, ref as number)
    const m = await provinciasDeGondoleros([yo], admin)
    caso(`declaró un/a ${nivel.padEnd(12)} → ${geo.prov_nombre}`,
      [...(m.get(yo) ?? [])], [geo.prov])
  }

  console.log('\n▸ 2. Varias declaraciones se acumulan sin repetir')
  await pg.query(`DELETE FROM gondolero_localidades WHERE gondolero_id = $1`, [yo])
  await declarar('provincia', geo.prov)
  await declarar('localidad', geo.loc)
  await declarar('departamento', geo.depto)
  {
    const m = await provinciasDeGondoleros([yo], admin)
    caso('las tres apuntan a la misma y da UNA sola', [...(m.get(yo) ?? [])], [geo.prov])
  }

  console.log('\n▸ 3. Dos que declararon DISTINTO se cruzan igual')
  // El caso real: uno la provincia entera, otro una localidad de adentro.
  const otro = await uno(
    `SELECT id FROM profiles WHERE tipo_actor = 'gondolero' AND id <> $1 LIMIT 1`, [yo])
  if (!otro) {
    console.log('   ⊘  NO VERIFICABLE: hace falta un segundo gondolero')
  } else {
    const zonasOtro = (await pg.query(
      `SELECT nivel, ref_id FROM gondolero_localidades WHERE gondolero_id = $1`, [otro.id])).rows
    await pg.query(`DELETE FROM gondolero_localidades WHERE gondolero_id = $1`, [otro.id])
    creados.push(otro.id)

    await pg.query(`DELETE FROM gondolero_localidades WHERE gondolero_id = $1`, [yo])
    await declarar('provincia', geo.prov)                       // yo: toda la provincia
    await pg.query(                                              // el otro: una localidad
      `INSERT INTO gondolero_localidades (gondolero_id, nivel, ref_id) VALUES ($1,'localidad',$2)`,
      [otro.id, geo.loc])

    const m = await provinciasDeGondoleros([yo, otro.id], admin)
    const mias  = m.get(yo) ?? new Set<number>()
    const suyas = m.get(otro.id) ?? new Set<number>()
    caso('los dos resuelven a la misma provincia',
      [[...mias], [...suyas]], [[geo.prov], [geo.prov]])
    caso('LA DECISIÓN DEL TRAMO: el de la localidad suelta comparte ranking',
      [...suyas].some(p => mias.has(p)), true)

    // Restaurar lo del otro antes de seguir.
    await pg.query(`DELETE FROM gondolero_localidades WHERE gondolero_id = $1`, [otro.id])
    for (const z of zonasOtro) {
      await pg.query(`INSERT INTO gondolero_localidades (gondolero_id, nivel, ref_id) VALUES ($1,$2,$3)`,
        [otro.id, z.nivel, z.ref_id])
    }
  }

  console.log('\n▸ 4. El que no declaró nada NO aparece en el Map')
  await pg.query(`DELETE FROM gondolero_localidades WHERE gondolero_id = $1`, [yo])
  {
    const m = await provinciasDeGondoleros([yo], admin)
    caso('no está la clave', m.has(yo), false)
    // La distinción importa: `.has()` contesta "¿declaró?", que es lo que la
    // pantalla necesita para decidir si muestra la solapa.
    caso('y el Map está vacío, no con un Set vacío adentro', m.size, 0)
  }

  console.log('\n▸ 5. Lista vacía y nombres')
  caso('sin ids no consulta nada', (await provinciasDeGondoleros([], admin)).size, 0)
  caso('el nombre de la provincia se resuelve',
    (await nombresDeProvincias([geo.prov], admin)).get(geo.prov), geo.prov_nombre)
  caso('sin ids, mapa vacío', (await nombresDeProvincias([], admin)).size, 0)

  // Restaurar lo mío.
  for (const z of zonasPrevias) {
    await pg.query(`INSERT INTO gondolero_localidades (gondolero_id, nivel, ref_id) VALUES ($1,$2,$3)`,
      [yo, z.nivel, z.ref_id])
  }
  console.log(`\n   · restauradas las ${zonasPrevias.length} zonas originales`)

} catch (e) {
  fallos++
  console.log(`\n   ✗ EXCEPCIÓN INESPERADA: ${e instanceof Error ? e.message : String(e)}`)
} finally {
  await pg.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exit(fallos ? 1 : 0)
