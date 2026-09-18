/**
 * scripts/probar-acceso-campana.ts
 * Corre la regla REAL de lib/acceso-campana.ts contra los datos reales.
 *
 * No reimplementa nada: importa `accesoACampana` y la evalúa para cada par
 * (actor, campaña activa). Si reimplementara la regla estaría comparándola
 * consigo misma, que es el error que ya evitamos en probar-rls-profiles.mjs.
 *
 *   npx tsx scripts/probar-acceso-campana.ts --ref <project-ref>
 *   npx tsx scripts/probar-acceso-campana.ts            (corre dev y prod)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
// `pg` no tiene @types instalados y este archivo lo typechequea el build de
// Next. createRequire devuelve `any`, así que no hace falta silenciar nada.
const { Client } = createRequire(import.meta.url)('pg')
import { accesoACampana, type CampanaAcceso } from '../lib/acceso-campana'

function pgurl(archivo: string): string {
  const m = fs.readFileSync(path.join(process.cwd(), archivo), 'utf8')
    .match(/^PGURL\s*=\s*"?([^"\r\n]+)"?/m)
  if (!m) throw new Error(`Sin PGURL en ${archivo}`)
  return m[1].trim()
}

async function run(label: string, archivo: string) {
  const c = new Client({ connectionString: pgurl(archivo), ssl: { rejectUnauthorized: false } })
  await c.connect()
  const campanas: any[] = (await c.query(
    `SELECT id, nombre, financiada_por, via_ejecucion, distri_id, repositora_id, marca_id, actor_campana
     FROM campanas WHERE estado = 'activa'`)).rows
  const actores: any[] = (await c.query(
    `SELECT id, alias, tipo_actor FROM profiles WHERE tipo_actor IN ('gondolero','fixer') ORDER BY alias`)).rows
  const vinculos: any[] = (await c.query(
    `SELECT gondolero_id AS actor, distri_id FROM gondolero_distri_solicitudes WHERE estado = 'aprobada'
     UNION ALL
     SELECT fixer_id, distri_id FROM fixer_distri_solicitudes WHERE estado = 'aprobada'`)).rows
  const vinculosRepo: any[] = (await c.query(
    `SELECT fixer_id AS actor, repositora_id FROM fixer_repo_solicitudes WHERE estado = 'aprobada'`)).rows
  const relaciones: any[] = (await c.query(
    `SELECT marca_id, distri_id FROM marca_distri_relaciones WHERE estado = 'activa'`)).rows
  // A quién le cambia: tiene trabajo hecho en una campaña a la que ya no accede.
  const conTrabajo: any[] = (await c.query(
    `SELECT DISTINCT m.gondolero_id AS actor, m.campana_id FROM misiones m
     UNION SELECT p.gondolero_id, p.campana_id FROM participaciones p`)).rows
  await c.end()

  const distrisDe = new Map<string, string[]>()
  for (const v of vinculos) {
    const lista = distrisDe.get(v.actor) ?? []
    lista.push(v.distri_id)
    distrisDe.set(v.actor, lista)
  }
  const reposDe = new Map<string, string[]>()
  for (const v of vinculosRepo) {
    const lista = reposDe.get(v.actor) ?? []
    lista.push(v.repositora_id)
    reposDe.set(v.actor, lista)
  }
  const trabajoDe = new Set(conTrabajo.map((t: any) => `${t.actor}|${t.campana_id}`))

  console.log(`\n######## ${label} — ${campanas.length} campañas activas × ${actores.length} actores`)
  const resumen = new Map<string, number>()
  const pierden: string[] = []

  for (const a of actores) {
    const mis = distrisDe.get(a.id) ?? []
    const ctx = {
      esFixer: a.tipo_actor === 'fixer',
      misDistriIds: mis,
      misRepoIds: reposDe.get(a.id) ?? [],
      relacionesMarcaDistri: relaciones.filter((r: any) => mis.includes(r.distri_id)),
    }
    for (const cam of campanas) {
      const r = accesoACampana(cam as CampanaAcceso, ctx)
      const clave = r.ok ? 'ok' : r.motivo
      resumen.set(clave, (resumen.get(clave) ?? 0) + 1)
      // Lo que importa no es cuántos pares dan "sin acceso" —la mayoría son
      // campañas de otra distri que el gondolero nunca vio— sino a quién se le
      // corta trabajo que YA HIZO.
      if (!r.ok && trabajoDe.has(`${a.id}|${cam.id}`)) {
        pierden.push(`${a.alias} (${a.tipo_actor}) × "${cam.nombre}" → ${r.motivo}`)
      }
    }
  }

  console.table([...resumen.entries()].map(([resultado, pares]) => ({ resultado, pares })))
  if (pierden.length === 0) {
    console.log('  Nadie con trabajo hecho pierde acceso.')
  } else {
    console.log(`  ${pierden.length} casos con trabajo hecho y sin acceso:`)
    for (const p of pierden) console.log('   ', p)
  }
}

const ref = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : null
const objetivos: [string, string][] = [['PROD', '.env.local'], ['DEV', '.env.dev.local']]
  .filter(([, f]) => !ref || pgurl(f).includes(ref)) as [string, string][]

;(async () => { for (const [l, f] of objetivos) await run(l, f) })()
  .catch(e => { console.error('ERROR:', e.message); process.exit(1) })
