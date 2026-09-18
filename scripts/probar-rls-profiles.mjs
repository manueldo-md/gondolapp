#!/usr/bin/env node
/**
 * scripts/probar-rls-profiles.mjs
 * Ejercita de verdad la RLS de `profiles` y `comercios`, impersonando usuarios.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Todas las pantallas de distribuidora usan el service role, que NO pasa por
 * RLS. O sea que estas políticas hoy **no las ejercita nadie**: se pueden
 * romper y nadie se entera hasta que alguna pantalla futura use el cliente de
 * usuario, meses después, con el síntoma "no aparece ningún gondolero".
 *
 * Cambiar una policy que nadie ejercita es el escenario donde un error queda
 * dormido. Este script la ejercita.
 *
 * ── CÓMO ─────────────────────────────────────────────────────────────────────
 * `auth.uid()` de Supabase lee `request.jwt.claims` con `current_setting`, así
 * que se puede impersonar cualquier usuario desde una conexión común:
 *
 *   SET LOCAL ROLE authenticated;
 *   SELECT set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);
 *
 * Con `--candidata` aplica la migración 20260918210000 DENTRO de la
 * transacción y al final hace ROLLBACK. Nada queda escrito: sirve para ver el
 * resultado de la policy nueva antes de correrla de verdad.
 *
 *   node scripts/probar-rls-profiles.mjs --ref <project-ref>
 *   node scripts/probar-rls-profiles.mjs --ref <project-ref> --candidata
 *
 * Sale con código 1 si algún caso no da lo esperado.
 *
 * ── QUÉ SE CONSIDERA "ESPERADO" ──────────────────────────────────────────────
 * La verdad se calcula APARTE de la policy, desde las tablas de vínculos con el
 * rol normal (sin RLS). Si el esperado saliera de la misma expresión que la
 * policy, el test pasaría siempre: estaría comparando la policy consigo misma.
 */

import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const ref       = arg('--ref')
const candidata = process.argv.includes('--candidata')
if (!ref) {
  console.error('Falta --ref <project-ref>. Ver CLAUDE.md, "Poblar un ambiente desde cero".')
  process.exit(2)
}

const MIGRACION = path.join(
  process.cwd(), 'supabase', 'migrations',
  '20260918210000_rls_pertenencia_por_vinculo.sql',
)

function arg(nombre) {
  const i = process.argv.indexOf(nombre)
  return i >= 0 ? process.argv[i + 1] : null
}

/** Busca el PGURL del proyecto pedido entre los .env*.local, y valida el ref. */
function pgurlDe(ref) {
  for (const f of fs.readdirSync(process.cwd()).filter(f => /^\.env.*\.local$/.test(f))) {
    const txt = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
    const m   = txt.match(/^PGURL\s*=\s*"?([^"\r\n]+)"?/m)
    if (m && m[1].includes(ref)) return { url: m[1].trim(), archivo: f }
  }
  throw new Error(`No encontré un PGURL con el ref ${ref} en ningún .env*.local`)
}

// ── Casos ────────────────────────────────────────────────────────────────────

/** Lo que cada distribuidora DEBERÍA ver, calculado desde los vínculos. */
const SQL_ESPERADO = `
  SELECT du.id AS distri_user, p.id AS actor, p.alias, p.tipo_actor,
         EXISTS (
           SELECT 1 FROM gondolero_distri_solicitudes s
           WHERE s.gondolero_id = p.id AND s.distri_id = du.distri_id AND s.estado = 'aprobada'
         ) OR EXISTS (
           SELECT 1 FROM fixer_distri_solicitudes f
           WHERE f.fixer_id = p.id AND f.distri_id = du.distri_id AND f.estado = 'aprobada'
         ) AS deberia_ver
  FROM profiles du
  CROSS JOIN profiles p
  WHERE du.tipo_actor = 'distribuidora' AND du.distri_id IS NOT NULL
    AND p.tipo_actor IN ('gondolero', 'fixer')`

async function comoUsuario(c, userId, fn) {
  await c.query('SAVEPOINT imp')
  await c.query('SET LOCAL ROLE authenticated')
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: userId, role: 'authenticated' })])
  try {
    return await fn()
  } finally {
    await c.query('RESET ROLE')
    await c.query('ROLLBACK TO SAVEPOINT imp')
  }
}

async function main() {
  const { url, archivo } = pgurlDe(ref)
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()

  console.log(`RLS de profiles/comercios — ref ${ref} (credenciales de ${archivo})`)
  console.log(candidata
    ? 'MODO CANDIDATA: se aplica 20260918210000 en la transacción y se revierte al final.\n'
    : 'MODO ACTUAL: se prueba la policy que está hoy en la base.\n')

  await c.query('BEGIN')
  let fallos = 0

  try {
    if (candidata) {
      const sql = fs.readFileSync(MIGRACION, 'utf8')
        .replace(/^\s*BEGIN;\s*$/m, '')   // ya estamos en una transacción
        .replace(/^\s*COMMIT;\s*$/m, '')  // y no queremos cerrarla
      await c.query(sql)
      console.log('  (migración aplicada dentro de la transacción)\n')
    }

    const esperado = (await c.query(SQL_ESPERADO)).rows
    const distris  = [...new Set(esperado.map(r => r.distri_user))]

    // ── 1. profiles: cada distribuidora ve exactamente a su gente ────────────
    console.log('── 1. profiles: qué gondoleros y fixers ve cada distribuidora ──')
    for (const du of distris) {
      const casos = esperado.filter(r => r.distri_user === du)
      const nombre = (await c.query(
        `SELECT d.razon_social FROM profiles p JOIN distribuidoras d ON d.id = p.distri_id WHERE p.id = $1`, [du])).rows[0]?.razon_social

      const visibles = await comoUsuario(c, du, async () => {
        const r = await c.query(`SELECT id FROM profiles WHERE tipo_actor IN ('gondolero','fixer')`)
        return new Set(r.rows.map(x => x.id))
      })

      const faltan = casos.filter(x =>  x.deberia_ver && !visibles.has(x.actor))
      const sobran = casos.filter(x => !x.deberia_ver &&  visibles.has(x.actor))
      const ok = faltan.length === 0 && sobran.length === 0

      console.log(`  ${ok ? 'OK  ' : 'FALLA'} ${nombre}: ve ${visibles.size}, debería ver ${casos.filter(x => x.deberia_ver).length}`)
      for (const f of faltan) console.log(`        NO VE a ${f.alias} (${f.tipo_actor}) y tiene vínculo aprobado`)
      for (const s of sobran) console.log(`        VE a ${s.alias} (${s.tipo_actor}) y NO tiene vínculo`)
      if (!ok) fallos++
    }

    // ── 2. La distribuidora se sigue viendo a sí misma ───────────────────────
    // Sale de `profiles_select` (id = auth.uid()), no de la policy que tocamos.
    // Se prueba igual: es lo que rompería si alguien la borrara por error.
    console.log('\n── 2. cada distribuidora se ve a sí misma ──')
    for (const du of distris) {
      const seVe = await comoUsuario(c, du, async () =>
        (await c.query(`SELECT 1 FROM profiles WHERE id = $1`, [du])).rowCount > 0)
      console.log(`  ${seVe ? 'OK  ' : 'FALLA'} ${du}`)
      if (!seVe) fallos++
    }

    // ── 3. Una distribuidora NO ve a otra distribuidora ──────────────────────
    console.log('\n── 3. una distribuidora no ve el perfil de otra ──')
    for (const du of distris) {
      const otras = distris.filter(x => x !== du)
      const vistas = await comoUsuario(c, du, async () => {
        const r = await c.query(`SELECT id FROM profiles WHERE id = ANY($1)`, [otras])
        return r.rows.length
      })
      console.log(`  ${vistas === 0 ? 'OK  ' : 'FALLA'} ${du} ve ${vistas} de ${otras.length}`)
      if (vistas !== 0) fallos++
    }

    // ── 4. Un gondolero solo se ve a sí mismo ───────────────────────────────
    console.log('\n── 4. un gondolero no ve a otros gondoleros ──')
    const gonds = (await c.query(
      `SELECT id, alias FROM profiles WHERE tipo_actor = 'gondolero' ORDER BY alias LIMIT 3`)).rows
    for (const g of gonds) {
      const n = await comoUsuario(c, g.id, async () =>
        (await c.query(`SELECT id FROM profiles`)).rowCount)
      console.log(`  ${n === 1 ? 'OK  ' : 'FALLA'} ${g.alias} ve ${n} perfiles (debería ver 1: el suyo)`)
      if (n !== 1) fallos++
    }

    // ── 5. comercios: la distri puede actualizar los de su gente ────────────
    // Se prueba con EXPLAIN sobre el UPDATE + un SELECT del predicado, para no
    // escribir. `count` bajo la policy de UPDATE no sirve —UPDATE y SELECT
    // tienen políticas distintas— así que se mide con un UPDATE real que la
    // transacción revierte.
    console.log('\n── 5. comercios: la distri actualiza los que registró su gente ──')
    for (const du of distris) {
      const casos = (await c.query(`
        SELECT co.id, co.nombre, p.alias,
               EXISTS (SELECT 1 FROM gondolero_distri_solicitudes s
                       WHERE s.gondolero_id = co.registrado_por
                         AND s.distri_id = (SELECT distri_id FROM profiles WHERE id = $1)
                         AND s.estado = 'aprobada') AS deberia_poder
        FROM comercios co JOIN profiles p ON p.id = co.registrado_por
        WHERE co.registrado_por IS NOT NULL
        ORDER BY deberia_poder DESC, co.nombre LIMIT 6`, [du])).rows
      if (casos.length === 0) { console.log('  (sin comercios con registrado_por)'); break }

      for (const caso of casos) {
        const pudo = await comoUsuario(c, du, async () => {
          const r = await c.query(
            `UPDATE comercios SET updated_at = updated_at WHERE id = $1`, [caso.id])
          return r.rowCount > 0
        })
        const ok = pudo === caso.deberia_poder
        if (!ok) {
          console.log(`  FALLA "${caso.nombre}" (de ${caso.alias}): pudo=${pudo}, debería=${caso.deberia_poder}`)
          fallos++
        }
      }
      console.log(`  ${casos.length} comercios probados para ${du}`)
    }

    // ── 6. EL CASO QUE IMPORTA, construido a mano ───────────────────────────
    // Los datos reales no lo tienen: hoy nadie con dos vínculos registró
    // comercios, así que los tests 1 y 5 pasan con la policy vieja para todo lo
    // que NO es el bug. Sin este caso, "pasa" solo querría decir "no rompí lo
    // que ya andaba".
    //
    // Se inserta un segundo vínculo aprobado dentro de la transacción, se
    // verifica, y el ROLLBACK del final se lo lleva.
    console.log('\n── 6. caso construido: gondolero en DOS distribuidoras ──')
    const [par] = (await c.query(`
      SELECT g.id AS gond, g.alias, otra.id AS distri_user, d.razon_social, d.id AS distri
      FROM profiles g
      JOIN comercios co ON co.registrado_por = g.id
      CROSS JOIN profiles otra
      JOIN distribuidoras d ON d.id = otra.distri_id
      WHERE g.tipo_actor = 'gondolero' AND otra.tipo_actor = 'distribuidora'
        AND NOT EXISTS (SELECT 1 FROM gondolero_distri_solicitudes s
                        WHERE s.gondolero_id = g.id AND s.distri_id = otra.distri_id)
      LIMIT 1`)).rows

    if (!par) {
      console.log('  (no hay par posible en esta base)')
    } else {
      const antes = await comoUsuario(c, par.distri_user, async () =>
        (await c.query(`SELECT 1 FROM profiles WHERE id = $1`, [par.gond])).rowCount > 0)

      await c.query(`INSERT INTO gondolero_distri_solicitudes
        (gondolero_id, distri_id, estado, iniciado_por) VALUES ($1, $2, 'aprobada', 'distri')`,
        [par.gond, par.distri])

      const despues = await comoUsuario(c, par.distri_user, async () =>
        (await c.query(`SELECT 1 FROM profiles WHERE id = $1`, [par.gond])).rowCount > 0)

      const puedeComercio = await comoUsuario(c, par.distri_user, async () =>
        (await c.query(
          `UPDATE comercios SET updated_at = updated_at WHERE registrado_por = $1`,
          [par.gond])).rowCount > 0)

      console.log(`  ${par.alias} + vínculo nuevo con ${par.razon_social}`)
      console.log(`  ${antes === false ? 'OK  ' : 'FALLA'} antes del vínculo NO lo veía (vio=${antes})`)
      console.log(`  ${despues === true ? 'OK  ' : 'FALLA'} con el vínculo SÍ lo ve (ve=${despues})`)
      console.log(`  ${puedeComercio === true ? 'OK  ' : 'FALLA'} y puede actualizar sus comercios (pudo=${puedeComercio})`)
      if (antes !== false)         fallos++
      if (despues !== true)        fallos++
      if (puedeComercio !== true)  fallos++
    }

  } finally {
    await c.query('ROLLBACK')
    await c.end()
  }

  console.log(fallos === 0
    ? '\nTODO OK — nada quedó escrito (ROLLBACK).'
    : `\n${fallos} FALLOS — nada quedó escrito (ROLLBACK).`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('\nERROR:', e.message); process.exit(2) })
