/**
 * probar-alcance-revision.mts — ¿se puede aprobar la foto de otro?
 *
 *   npx tsx scripts/probar-alcance-revision.mts            (dev)
 *   npx tsx scripts/probar-alcance-revision.mts --prod
 *
 * SOLO LECTURA. No escribe una fila: llama al guard, que solo consulta.
 *
 * ── POR QUÉ ESTE CONTROL Y NO UNO DE UNIDAD ─────────────────────────────────
 * "Que compile" no prueba nada acá. Lo que hay que probar es que **una distri
 * autenticada NO pueda tocar la foto de la campaña de otra**, y eso solo se ve
 * con actores y fotos REALES: el permiso depende de `campanas.distri_id`,
 * `marca_id`, `repositora_id` y de las dos tablas de relación de repositora.
 * Un fixture los inventa todos y prueba mi idea del schema, no el schema.
 *
 * Por eso `lib/alcance-revision.ts` no importa `next/headers` —eso vive en
 * `lib/actor-sesion.ts`— y `fotosQuePuedeRevisar` recibe el actor por
 * parámetro: la decisión entera se puede correr desde acá, sin un request.
 *
 * ── LO QUE ESTE SCRIPT NO PUEDE CUBRIR, Y QUIÉN LO CUBRE ────────────────────
 * La línea sesión → actor necesita cookies. Esa mitad la cubre el control de
 * CABLEADO del final: verifica que ninguna action que escriba `fotos.estado`
 * lo haga sin pasar por el guard. *El cableado es lo que falla, no la función*
 * — van cuatro casos documentados en este proyecto, incluidos los dos bugs del
 * mapa de ayer.
 *
 * ── Y SI LOS DATOS NO DAN, SE DICE ──────────────────────────────────────────
 * Un caso que no se puede armar con los datos de la base se reporta **NO
 * VERIFICABLE**, no verde. Un control que no distingue "el permiso anda" de
 * "no había con qué probarlo" no es un control.
 */
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import {
  actorRevisorDePerfil, campanaEnAlcance, fotosQuePuedeRevisar,
  exigirFotoRevisable, ESTADOS_REVISABLES, type ActorRevisor,
} from '../lib/alcance-revision'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const { vars } = credencialesDeRef(ref)

const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const pg = new Client({ connectionString: vars.PGURL })
await pg.connect()

let fallos = 0, sinVerificar = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
function noVerificable(nombre: string, porque: string) {
  sinVerificar++
  console.log(`   ⊘  ${nombre}`)
  console.log(`       NO VERIFICABLE: ${porque}`)
}
async function tira(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null } catch (e) { return e instanceof Error ? e.message : String(e) }
}

console.log(`\n▸ ${nombreDeRef(ref)}`)

// ── El actor sale del PERFIL, y el perfil de la base ────────────────────────
console.log('\n▸ De una fila de profiles a un actor')
{
  const { rows } = await pg.query(`
    SELECT tipo_actor, distri_id, marca_id, repositora_id
      FROM profiles WHERE tipo_actor IN ('distribuidora','marca','repositora','admin','gondolero','fixer')`)

  const porTipo = new Map<string, Record<string, unknown>>()
  for (const p of rows) if (!porTipo.has(p.tipo_actor)) porTipo.set(p.tipo_actor, p)

  for (const tipo of ['distribuidora', 'marca', 'repositora', 'admin']) {
    const p = porTipo.get(tipo)
    if (!p) { noVerificable(`${tipo} → actor`, `no hay ningún perfil ${tipo} en esta base`); continue }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = actorRevisorDePerfil(p as any)
    caso(`${tipo.padEnd(14)} → actor.tipo`, a?.tipo, tipo)
  }

  // Los que NO revisan. Es la mitad que importa: un gondolero no puede aprobar
  // su propia foto, y el default del switch tiene que denegar.
  for (const tipo of ['gondolero', 'fixer']) {
    const p = porTipo.get(tipo)
    if (!p) { noVerificable(`${tipo} → null`, `no hay ningún perfil ${tipo}`); continue }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    caso(`${tipo.padEnd(14)} → NO revisa (null)`, actorRevisorDePerfil(p as any), null)
  }
  caso('un tipo_actor desconocido → null',
    actorRevisorDePerfil({ tipo_actor: 'inventado', distri_id: null, marca_id: null, repositora_id: null }), null)
  caso('sin perfil → null', actorRevisorDePerfil(null), null)
  caso('distribuidora SIN distri_id → null',
    actorRevisorDePerfil({ tipo_actor: 'distribuidora', distri_id: null, marca_id: null, repositora_id: null }), null)
}

// ── EL CONTROL QUE PEDIMOS: aprobar la foto de otro ─────────────────────────
console.log('\n▸ Una distri intenta revisar la foto de la campaña de OTRA')
{
  // Se busca una foto revisable cuya campaña tenga dueño, y una distri que NO
  // sea esa dueña. Las dos salen de la base: si no existen, se dice.
  const { rows: candidatas } = await pg.query(`
    SELECT f.id foto_id, f.estado, c.distri_id, d.razon_social
      FROM fotos f
      JOIN campanas c ON c.id = f.campana_id
      JOIN distribuidoras d ON d.id = c.distri_id
     WHERE f.estado = ANY($1) AND c.distri_id IS NOT NULL
     LIMIT 1`, [ESTADOS_REVISABLES])

  const { rows: otras } = await pg.query(
    'SELECT id, razon_social FROM distribuidoras ORDER BY razon_social')

  if (!candidatas.length) {
    noVerificable('la distri ajena NO puede', `no hay fotos en ${ESTADOS_REVISABLES.join('|')} con campaña de una distri`)
  } else {
    const f = candidatas[0]
    const duena: ActorRevisor  = { tipo: 'distribuidora', id: f.distri_id }
    const ajena = otras.find((d: { id: string }) => d.id !== f.distri_id)

    if (!ajena) {
      noVerificable('la distri ajena NO puede', 'hay una sola distribuidora en esta base')
    } else {
      const actorAjeno: ActorRevisor = { tipo: 'distribuidora', id: ajena.id }
      console.log(`   (foto de ${f.razon_social}, la intenta tocar ${ajena.razon_social})`)

      const err = await tira(() => exigirFotoRevisable({
        fotoId: f.foto_id, actor: actorAjeno, estados: ESTADOS_REVISABLES, admin, desde: 'control',
      }))
      caso('TIRA cuando la foto es de otra campaña', err !== null, true)
      caso('y no devuelve null en silencio (que sería un no-op mudo)',
        err?.includes('no es de una campaña tuya') ?? false, true)

      // EL CONTROL DEL CONTROL. Sin esto, el test daría verde si el guard
      // denegara SIEMPRE — que es tan inútil como si permitiera siempre.
      const errDuena = await tira(() => exigirFotoRevisable({
        fotoId: f.foto_id, actor: duena, estados: ESTADOS_REVISABLES, admin, desde: 'control',
      }))
      caso('CONTROL — la dueña SÍ puede (no tira)', errDuena, null)

      caso('el alcance dice false para la ajena',
        await campanaEnAlcance(await campanaDe(f.foto_id), actorAjeno, admin), false)
      caso('y true para la dueña',
        await campanaEnAlcance(await campanaDe(f.foto_id), duena, admin), true)
    }
  }
}

async function campanaDe(fotoId: string): Promise<string | null> {
  const { rows } = await pg.query('SELECT campana_id FROM fotos WHERE id = $1', [fotoId])
  return rows[0]?.campana_id ?? null
}

// ── Lo mismo del lado de la marca ───────────────────────────────────────────
console.log('\n▸ Una marca intenta revisar la foto de la campaña de OTRA')
{
  const { rows: cand } = await pg.query(`
    SELECT f.id foto_id, c.marca_id, m.razon_social
      FROM fotos f JOIN campanas c ON c.id = f.campana_id
      JOIN marcas m ON m.id = c.marca_id
     WHERE f.estado = ANY($1) AND c.marca_id IS NOT NULL LIMIT 1`, [ESTADOS_REVISABLES])
  const { rows: marcas } = await pg.query('SELECT id, razon_social FROM marcas ORDER BY razon_social')

  if (!cand.length) {
    noVerificable('la marca ajena NO puede', 'no hay fotos revisables de campañas con marca')
  } else {
    const f = cand[0]
    const ajena = marcas.find((m: { id: string }) => m.id !== f.marca_id)
    if (!ajena) {
      noVerificable('la marca ajena NO puede', 'hay una sola marca')
    } else {
      console.log(`   (foto de ${f.razon_social}, la intenta tocar ${ajena.razon_social})`)
      const campanaId = await campanaDe(f.foto_id)
      caso('la ajena NO', await campanaEnAlcance(campanaId, { tipo: 'marca', id: ajena.id }, admin), false)
      caso('CONTROL — la dueña SÍ', await campanaEnAlcance(campanaId, { tipo: 'marca', id: f.marca_id }, admin), true)
    }
  }
}

// ── La repositora, que entró desde el principio y no después ────────────────
console.log('\n▸ La repositora: relación ACTIVA, o nada')
{
  // Su panel re-exporta la action de distri, así que si el actor no se derivara
  // de `tipo_actor` quedaría con el alcance de una distribuidora — o sea con
  // TODO. Es el caso que hace que arreglar tres de cuatro paneles no sirva.
  const { rows: repos } = await pg.query('SELECT id, razon_social FROM repositoras ORDER BY razon_social')
  if (!repos.length) {
    noVerificable('la repositora vinculada SÍ / la otra NO', 'no hay repositoras en esta base')
  } else {
    // Una campaña que alguna repositora pueda ver por relación con su distri.
    const { rows: rel } = await pg.query(`
      SELECT r.repositora_id, c.id campana_id
        FROM distri_repo_relaciones r
        JOIN campanas c ON c.distri_id = r.distri_id
       WHERE r.estado = 'activa' LIMIT 1`)

    if (!rel.length) {
      noVerificable('la repositora vinculada SÍ', 'ninguna repositora tiene relación activa con una distri que tenga campañas')
    } else {
      const { repositora_id, campana_id } = rel[0]
      caso('con relación activa a la distri dueña → SÍ',
        await campanaEnAlcance(campana_id, { tipo: 'repositora', id: repositora_id }, admin), true)

      const otra = repos.find((r: { id: string }) => r.id !== repositora_id)
      if (!otra) {
        noVerificable('la repositora SIN relación → NO', 'hay una sola repositora')
      } else {
        // Solo vale como control si esta otra NO tiene relación con esa distri.
        const { rows: tiene } = await pg.query(`
          SELECT 1 FROM distri_repo_relaciones r JOIN campanas c ON c.distri_id = r.distri_id
           WHERE c.id = $1 AND r.repositora_id = $2 AND r.estado = 'activa'`, [campana_id, otra.id])
        if (tiene.length) {
          noVerificable('la repositora SIN relación → NO', 'la otra repositora también está vinculada a esa distri')
        } else {
          caso('sin relación con la distri dueña → NO',
            await campanaEnAlcance(campana_id, { tipo: 'repositora', id: otra.id }, admin), false)
        }
      }
    }
  }

  // Una campaña directamente suya, si la hay.
  const { rows: directa } = await pg.query(
    'SELECT id, repositora_id FROM campanas WHERE repositora_id IS NOT NULL LIMIT 1')
  if (!directa.length) noVerificable('campaña con repositora_id propio → SÍ', 'ninguna campaña tiene repositora_id')
  else caso('campaña con repositora_id propio → SÍ',
    await campanaEnAlcance(directa[0].id, { tipo: 'repositora', id: directa[0].repositora_id }, admin), true)
}

// ── El admin ve todas, y por eso su rama no consulta nada ───────────────────
console.log('\n▸ El admin')
{
  const { rows } = await pg.query('SELECT id FROM campanas LIMIT 3')
  for (const c of rows) {
    caso(`admin sobre ${String(c.id).slice(0, 8)} → SÍ`, await campanaEnAlcance(c.id, { tipo: 'admin' }, admin), true)
  }
  caso('admin sobre una foto SIN campaña → SÍ', await campanaEnAlcance(null, { tipo: 'admin' }, admin), true)
  caso('una distri sobre una foto SIN campaña → NO (ante la duda, no)',
    await campanaEnAlcance(null, { tipo: 'distribuidora', id: '00000000-0000-0000-0000-000000000001' }, admin), false)
}

// ── El lote: un id ajeno mezclado no pasa, y no se pierde ninguno ───────────
console.log('\n▸ El masivo, que es el que multiplica el daño por N')
{
  const { rows: mias } = await pg.query(`
    SELECT f.id, c.distri_id FROM fotos f JOIN campanas c ON c.id = f.campana_id
     WHERE f.estado = ANY($1) AND c.distri_id IS NOT NULL LIMIT 1`, [ESTADOS_REVISABLES])

  if (!mias.length) {
    noVerificable('el lote filtra lo ajeno', 'no hay fotos revisables con campaña de distri')
  } else {
    const distriId = mias[0].distri_id
    const actor: ActorRevisor = { tipo: 'distribuidora', id: distriId }

    const { rows: propias } = await pg.query(`
      SELECT f.id FROM fotos f JOIN campanas c ON c.id = f.campana_id
       WHERE f.estado = ANY($1) AND c.distri_id = $2 LIMIT 3`, [ESTADOS_REVISABLES, distriId])
    const { rows: ajenas } = await pg.query(`
      SELECT f.id FROM fotos f JOIN campanas c ON c.id = f.campana_id
       WHERE c.distri_id IS DISTINCT FROM $1 LIMIT 3`, [distriId])
    const inventada = '00000000-0000-0000-0000-000000000099'

    const idsPropias = propias.map((r: { id: string }) => r.id)
    const idsAjenas  = ajenas.map((r: { id: string }) => r.id)
    const lote = [...idsPropias, ...idsAjenas, inventada]

    const r = await fotosQuePuedeRevisar({ fotoIds: lote, actor, estados: ESTADOS_REVISABLES, admin })
    console.log(`   (lote de ${lote.length}: ${idsPropias.length} propias, ${idsAjenas.length} ajenas, 1 inventada)`)

    caso('las propias pasan', r.permitidas.map(f => f.id).sort(), idsPropias.sort())
    if (idsAjenas.length) caso('las ajenas quedan marcadas', r.ajenas.sort(), idsAjenas.sort())
    else noVerificable('las ajenas quedan marcadas', 'no hay fotos de otra distri en esta base')
    caso('la inventada va a inexistentes', r.inexistentes, [inventada])

    // EL INVARIANTE. Una foto que no cae en ningún grupo desaparece sin que
    // nadie lo note — igual que un PDV que el mapa se come al agrupar.
    const total = r.permitidas.length + r.ajenas.length + r.fueraDeEstado.length + r.inexistentes.length
    caso('no se pierde ninguna: los cuatro grupos suman el lote', total, lote.length)
    caso('el lote vacío no consulta ni devuelve nada',
      await fotosQuePuedeRevisar({ fotoIds: [], actor, estados: ESTADOS_REVISABLES, admin }),
      { permitidas: [], ajenas: [], fueraDeEstado: [], inexistentes: [] })
  }
}

// ── El punto 2: el estado, que cierra el replay del dueño legítimo ──────────
console.log('\n▸ El estado: una foto ya aprobada no se vuelve a aprobar')
{
  const { rows } = await pg.query(`
    SELECT f.id, c.distri_id FROM fotos f JOIN campanas c ON c.id = f.campana_id
     WHERE f.estado = 'aprobada' AND c.distri_id IS NOT NULL LIMIT 1`)

  if (!rows.length) {
    noVerificable('una aprobada propia NO vuelve a pasar', 'no hay fotos aprobadas de campañas con distri')
  } else {
    const { id, distri_id } = rows[0]
    const duena: ActorRevisor = { tipo: 'distribuidora', id: distri_id }

    const r = await fotosQuePuedeRevisar({ fotoIds: [id], actor: duena, estados: ESTADOS_REVISABLES, admin })
    caso('SUYA y ya aprobada → fueraDeEstado, no permitidas', r.fueraDeEstado, [id])
    caso('y NO pasa a permitidas', r.permitidas.length, 0)

    // Fuera de estado NO tira: dos revisores clickeando a la vez es legítimo.
    // Ajena sí tira. La asimetría es la decisión, y acá se fija.
    caso('fuera de estado devuelve null y NO tira (doble click es legítimo)',
      await tira(() => exigirFotoRevisable({ fotoId: id, actor: duena, estados: ESTADOS_REVISABLES, admin, desde: 'control' })),
      null)

    // Y el admin, que SÍ puede aprobar desde 'rechazada' pero no desde 'aprobada'.
    const rAdmin = await fotosQuePuedeRevisar({
      fotoIds: [id], actor: { tipo: 'admin' }, estados: ['pendiente', 'en_revision', 'rechazada'], admin })
    caso('el admin tampoco puede reaprobar una aprobada', rAdmin.fueraDeEstado, [id])
  }

  const { rows: rech } = await pg.query(`
    SELECT f.id FROM fotos f JOIN campanas c ON c.id = f.campana_id
     WHERE f.estado = 'rechazada' LIMIT 1`)
  if (!rech.length) noVerificable('el admin SÍ puede aprobar una rechazada', 'no hay fotos rechazadas')
  else {
    const r = await fotosQuePuedeRevisar({
      fotoIds: [rech[0].id], actor: { tipo: 'admin' }, estados: ['pendiente', 'en_revision', 'rechazada'], admin })
    caso('el admin SÍ puede aprobar una rechazada (corregir un rechazo)', r.permitidas.length, 1)
    const rDistri = await fotosQuePuedeRevisar({
      fotoIds: [rech[0].id], actor: { tipo: 'admin' }, estados: ESTADOS_REVISABLES, admin })
    caso('y con los estados de distri, NO', rDistri.permitidas.length, 0)
  }
}

await pg.end()
console.log(
  `\n${fallos ? `✗ ${fallos} mal` : '✓ Todo como se esperaba'}` +
  `${sinVerificar ? ` · ${sinVerificar} sin datos para verificar` : ''}\n`)
process.exit(fallos ? 1 : 0)
