/**
 * probar-fotos-por-campana.mts — contra datos reales, SOLO LECTURA.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-fotos-por-campana.mts
 *   GONDOLAPP_PROD=1 npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-fotos-por-campana.mts --prod
 *
 * ── QUÉ PROTEGE, Y POR QUÉ NO ALCANZA UN TEST PURO ──────────────────────────
 * Con una campaña elegida en el mapa, el thumb tiene que ser DE ESA CAMPAÑA.
 * El caso que rompe: entro a una campaña de hace seis meses, toco un punto, y
 * me trae una foto de hace 30 días de otra campaña. **Eso es mostrar evidencia
 * equivocada** — la peor clase de error de este panel, porque la foto se ve
 * perfectamente normal y no lleva la fecha escrita.
 *
 * `ultimaFotoPorComercio` no puede protegerlo: elige la más reciente de las
 * filas que le dan, y hace bien. La regla vive en los FILTROS de la consulta.
 *
 * ── Y POR QUÉ ESTE ARCHIVO LLAMA AL CÓDIGO DE VERDAD ────────────────────────
 * La primera versión replicaba el SQL de la acción en un `SELECT DISTINCT ON`.
 * Daba verde, y no servía: un control que REPLICA lo que dice verificar se
 * queda verde el día que los dos se separan. Es el mismo defecto que la sonda
 * del mapa, que medía una URL escrita a mano en vez de la del componente.
 *
 * Por eso la consulta se sacó de la server action a `lib/fotos-mapa.ts`, y acá
 * se llama `fotosCandidatas` + `ultimaFotoPorComercio` — las mismas funciones
 * que corren en producción. Lo único que no se ejercita es la resolución del
 * permiso, que necesita sesión.
 */
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { fotosCandidatas, ultimaFotoPorComercio } from '../lib/fotos-mapa'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'

if (esProd && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para correrlo contra producción hace falta GONDOLAPP_PROD=1.\n')
  process.exit(1)
}

const cred = credencialesDeRef(ref) as { vars: Record<string, string>; archivo: string }
console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

const admin = createClient(cred.vars.NEXT_PUBLIC_SUPABASE_URL, cred.vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

/** El camino real: la consulta de la lib + la elección de la lib. */
async function thumbDe(comercioId: string, campanaIds: string[]) {
  const filas = await fotosCandidatas([comercioId], campanaIds, admin)
  const elegidas = ultimaFotoPorComercio(filas)
  const e = elegidas.get(comercioId)
  if (!e) return null
  const fila = filas.find(f => f.id === e.fotoId)
  return { fotoId: e.fotoId, instante: e.instante, fila }
}

/** De qué campaña es una foto. Se pregunta aparte: la lib no la devuelve. */
async function campanaDe(fotoId: string): Promise<string | null> {
  const { rows } = await c.query(`SELECT campana_id FROM fotos WHERE id = $1`, [fotoId])
  return rows[0]?.campana_id ?? null
}

try {
  // ── El caso: un comercio con fotos en DOS campañas de la misma marca, donde
  //    la de la OTRA campaña es MÁS NUEVA ────────────────────────────────────
  const { rows: candidatos } = await c.query(`
    WITH ult AS (
      SELECT f.comercio_id, f.campana_id, ca.marca_id, ca.nombre AS campana,
             max(COALESCE(mi.capturada_at, f.created_at)) AS instante
        FROM fotos f
        JOIN misiones mi ON mi.id = f.mision_id
        JOIN campanas ca ON ca.id = f.campana_id
       WHERE f.estado = 'aprobada' AND ca.marca_id IS NOT NULL
       GROUP BY 1, 2, 3, 4)
    SELECT a.comercio_id, a.marca_id,
           a.campana_id AS vieja_id, a.campana AS vieja, a.instante AS vieja_at,
           b.campana_id AS nueva_id, b.campana AS nueva, b.instante AS nueva_at,
           co.nombre AS comercio
      FROM ult a
      JOIN ult b ON b.comercio_id = a.comercio_id
                AND b.marca_id    = a.marca_id
                AND b.instante    > a.instante
      JOIN comercios co ON co.id = a.comercio_id
     ORDER BY (b.instante - a.instante) DESC
     LIMIT 3`)

  console.log('\n▸ El caso que hace falta para que esto pruebe algo')
  if (candidatos.length === 0) {
    console.log('   ⊘ NO HAY ningún comercio con fotos de dos campañas de la misma marca')
    console.log('     donde la de otra campaña sea más nueva. Sin ese dato, este control no')
    console.log('     distingue un filtro que anda de uno que no existe: se reporta como')
    console.log('     NO VERIFICABLE, no como verde.')
    fallos++
  } else {
    for (const x of candidatos) {
      const dias = Math.round(
        (new Date(x.nueva_at).getTime() - new Date(x.vieja_at).getTime()) / 86400000)
      console.log(`   ·  ${x.comercio}`)
      console.log(`      vieja: ${String(x.vieja).slice(0, 44)} — ${new Date(x.vieja_at).toISOString().slice(0, 10)}`)
      console.log(`      nueva: ${String(x.nueva).slice(0, 44)} — ${new Date(x.nueva_at).toISOString().slice(0, 10)}  (+${dias} días)`)
    }

    const x = candidatos[0]

    console.log('\n▸ 1. Con campaña elegida, la foto sale SOLO de esa campaña')
    const conFiltro = await thumbDe(x.comercio_id, [x.vieja_id])
    caso('devuelve una foto', conFiltro !== null, true)
    caso('y es de la campaña elegida', await campanaDe(conFiltro!.fotoId), x.vieja_id)
    caso('con el instante de esa campaña',
      new Date(conFiltro!.instante).toISOString(), new Date(x.vieja_at).toISOString())

    // EL CONTROL. Si sin el filtro diera lo mismo, el caso elegido no
    // distinguiría nada y todo lo de arriba sería decorativo.
    const sinFiltro = await thumbDe(x.comercio_id, [x.vieja_id, x.nueva_id])
    caso('CONTROL — sin el filtro la foto sería OTRA',
      sinFiltro!.fotoId === conFiltro!.fotoId, false)
    caso('y sería la de la campaña nueva', await campanaDe(sinFiltro!.fotoId), x.nueva_id)

    console.log('\n▸ 2. Sin campaña elegida, la última de cualquier campaña del alcance')
    const { rows: alc } = await c.query(
      `SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids FROM campanas WHERE marca_id = $1`,
      [x.marca_id])
    const delAlcance = await thumbDe(x.comercio_id, alc[0].ids)
    caso('es la más reciente del alcance', await campanaDe(delAlcance!.fotoId), x.nueva_id)

    console.log('\n▸ 3. Nunca se cuela una foto de afuera del alcance')
    const { rows: aj } = await c.query(
      `SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids
         FROM campanas WHERE marca_id IS DISTINCT FROM $1`, [x.marca_id])
    const conAjenas = await fotosCandidatas([x.comercio_id], aj[0].ids, admin)
    const propias: string[] = alc[0].ids
    const coladas: string[] = []
    for (const f of conAjenas) {
      const ca = await campanaDe(f.id)
      if (ca && propias.includes(ca)) coladas.push(f.id)
    }
    caso('pedir campañas ajenas no devuelve ninguna del alcance propio', coladas.length, 0)
    caso('y con el arreglo vacío no devuelve nada',
      (await fotosCandidatas([x.comercio_id], [], admin)).length, 0)
    caso('sin comercios tampoco', (await fotosCandidatas([], alc[0].ids, admin)).length, 0)
  }

  // ── El tamaño del problema ────────────────────────────────────────────────
  const { rows: impacto } = await c.query(`
    WITH ult AS (
      SELECT f.comercio_id, f.campana_id, ca.marca_id,
             max(COALESCE(mi.capturada_at, f.created_at)) AS instante
        FROM fotos f
        JOIN misiones mi ON mi.id = f.mision_id
        JOIN campanas ca ON ca.id = f.campana_id
       WHERE f.estado = 'aprobada' AND ca.marca_id IS NOT NULL
       GROUP BY 1, 2, 3)
    SELECT count(DISTINCT a.comercio_id)::int AS pdv
      FROM ult a JOIN ult b ON b.comercio_id = a.comercio_id
                           AND b.marca_id    = a.marca_id
                           AND b.instante    > a.instante`)
  console.log('\n▸ Tamaño del problema si el filtro no estuviera')
  console.log(`   ${impacto[0].pdv} PDV mostrarían la foto de otra campaña al filtrar por la vieja`)

} catch (e) {
  fallos++
  console.error(`\n✗ ${(e as Error).message}`)
} finally {
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
