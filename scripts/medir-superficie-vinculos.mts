/**
 * medir-superficie-vinculos.mts — cuántas filas quedan al alcance del relevamiento
 * de vínculos y borradores.
 *
 *   npx tsx scripts/medir-superficie-vinculos.mts            (dev)
 *   npx tsx scripts/medir-superficie-vinculos.mts --prod
 *
 * SOLO LECTURA.
 *
 * Las actions de vinculación, relación y borrador reciben un id del cliente y
 * no verifican que sea suyo. "Es un agujero" es barato; lo que decide la
 * prioridad es cuántas filas alcanza cada una y qué se lleva puesto.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const { vars } = credencialesDeRef(ref)
const pg = new Client({ connectionString: vars.PGURL })
await pg.connect()

console.log(`\n▸ ${nombreDeRef(ref)}`)

async function n(sql: string): Promise<number> {
  try { const { rows } = await pg.query(sql); return Number(rows[0].n) }
  catch { return -1 }
}

const filas: [string, number, string][] = [
  ['solicitudes gondolero↔distri, pendientes',
    await n(`SELECT count(*) n FROM gondolero_distri_solicitudes WHERE estado = 'pendiente'`),
    'aceptar/rechazarVinculacionDistri, aprobar/rechazarSolicitud'],
  ['solicitudes gondolero↔distri, TOTAL',
    await n('SELECT count(*) n FROM gondolero_distri_solicitudes'), 'el id se puede pasar igual'],
  ['solicitudes fixer↔distri, total',
    await n('SELECT count(*) n FROM fixer_distri_solicitudes'), 'aceptar/rechazarVinculacionDistri_Fixer'],
  ['solicitudes fixer↔repo, total',
    await n('SELECT count(*) n FROM fixer_repo_solicitudes'), 'aceptar/rechazarVinculacionRepo'],
  ['relaciones marca↔distri',
    await n('SELECT count(*) n FROM marca_distri_relaciones'), 'terminarRelacion / terminarRelacionDistri'],
  ['  … activas',
    await n(`SELECT count(*) n FROM marca_distri_relaciones WHERE estado = 'activa'`), ''],
  ['relaciones marca↔repo',
    await n('SELECT count(*) n FROM marca_repo_relaciones'), 'terminarRelacionRepo'],
  ['relaciones distri↔repo',
    await n('SELECT count(*) n FROM distri_repo_relaciones'), 'terminarRelacionDistriRepo'],
  ['perfiles con distri_id escrito',
    await n('SELECT count(*) n FROM profiles WHERE distri_id IS NOT NULL'), 'aprobarSolicitud pisa esta columna'],
  ['perfiles con repositora_id escrito',
    await n('SELECT count(*) n FROM profiles WHERE repositora_id IS NOT NULL'), 'aceptarVinculacionRepo la pisa SIN guarda'],
  ['campañas, total',
    await n('SELECT count(*) n FROM campanas'), 'guardarBorrador*/republicar*/descartarCambios*'],
  ['  … activas',
    await n(`SELECT count(*) n FROM campanas WHERE estado = 'activa'`), 'republicar les cambia bloques y bounty'],
  ['  … con tiene_draft',
    await n('SELECT count(*) n FROM campanas WHERE tiene_draft'), ''],
  ['notificaciones sin leer',
    await n('SELECT count(*) n FROM notificaciones WHERE leida = false'), 'marcarNotificaciones*Leidas'],
  ['logros no vistos',
    await n('SELECT count(*) n FROM gondolero_logros WHERE visto = false'), 'marcarLogrosVistos'],
  ['reportes de ubicación pendientes',
    await n(`SELECT count(*) n FROM comercios_reportes_ubicacion WHERE estado = 'pendiente'`), 'descartarReporteUbicacion'],
]

for (const [que, cuantas, quien] of filas) {
  console.log(`  ${String(cuantas === -1 ? 'n/d' : cuantas).padStart(5)}  ${que.padEnd(46)} ${quien}`)
}

// ── Lo que hace grande a republicarCampana: no toca una fila, toca un árbol ──
console.log('\n▸ Qué se lleva puesto una republicación ajena')
{
  const { rows } = await pg.query(`
    SELECT count(DISTINCT b.id) bloques, count(bc.id) campos
      FROM campanas c
      LEFT JOIN bloques_foto b ON b.campana_id = c.id
      LEFT JOIN bloque_campos bc ON bc.bloque_id = b.id`)
  console.log(`  ${rows[0].bloques} bloques y ${rows[0].campos} campos colgando de las campañas`)
  const { rows: mis } = await pg.query(
    `SELECT count(*) n FROM misiones WHERE estado IS DISTINCT FROM 'descartada'`)
  console.log(`  ${mis[0].n} misiones vivas contra esos bloques`)
}

// ── Y el multi-vínculo, que es lo que hace peligroso pisar la columna ────────
console.log('\n▸ Gente con más de un vínculo vivo (por eso pisar la columna duele)')
{
  const { rows } = await pg.query(`
    SELECT count(*) n FROM (
      SELECT gondolero_id FROM gondolero_distri_solicitudes WHERE estado = 'aprobada'
      GROUP BY gondolero_id HAVING count(DISTINCT distri_id) > 1) x`)
  console.log(`  gondoleros vinculados a 2+ distris: ${rows[0].n}`)
}

await pg.end()
console.log('\n(solo lectura)\n')
