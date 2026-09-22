/**
 * probar-solicitudes-fixer.mjs — etapa 3 del tramo de postulación.
 *
 * Corre contra dev dentro de una transacción y termina con ROLLBACK.
 *
 * Lo que prueba, en orden de importancia:
 *
 *   1. EL BYPASS DE CONSENTIMIENTO. Una invitación del ejecutor
 *      (`iniciado_por='distri'/'repositora'`) NO puede aparecer en su propia
 *      lista de pendientes. Hasta el 24/9/2026 aparecía, y con el botón
 *      "Aprobar" al lado: la distri escribía el vínculo sin que el fixer
 *      aceptara nada.
 *   2. EL PISOTÓN. Aprobar a un fixer que YA tiene una repositora (o una
 *      distri) no puede moverlo de equipo. El vínculo nuevo va a la tabla, que
 *      es la fuente; la columna del perfil solo se llena si está vacía.
 *   3. Que el rechazo deje rastro: `rechazada_at` y el motivo, sin borrar nada.
 *
 * Las consultas replican las de las pantallas. No llama a las server actions
 * —necesitan sesión— así que la regla de las actions se prueba reproduciendo su
 * SQL; lo que esto NO cubre es que la pantalla llame a la action correcta, y eso
 * es de campo.
 *
 *   node scripts/probar-solicitudes-fixer.mjs
 */
import pg from 'pg'
import fs from 'fs'

const url = fs.readFileSync('.env.dev.local', 'utf8')
  .match(/^PGURL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
const uno = async (sql, args = []) => (await c.query(sql, args)).rows[0]

try {
  await c.query('BEGIN')

  const fixer = (await uno(`SELECT id FROM profiles WHERE tipo_actor='fixer' LIMIT 1`)).id
  const repos = (await c.query(`SELECT id FROM repositoras ORDER BY created_at LIMIT 2`)).rows
  const distri = (await uno(`SELECT id FROM distribuidoras LIMIT 1`)).id
  if (repos.length < 2) { console.log('   (hacen falta 2 repositoras en dev)'); process.exit(1) }
  const [repoA, repoB] = repos.map(r => r.id)

  // Estado de partida controlado: el fixer trabaja para A.
  await c.query(`DELETE FROM fixer_repo_solicitudes WHERE fixer_id=$1`, [fixer])
  await c.query(`DELETE FROM fixer_distri_solicitudes WHERE fixer_id=$1`, [fixer])
  await c.query(`INSERT INTO fixer_repo_solicitudes (fixer_id, repositora_id, estado, iniciado_por)
                 VALUES ($1,$2,'aprobada','repositora')`, [fixer, repoA])
  await c.query(`UPDATE profiles SET repositora_id=$2 WHERE id=$1`, [fixer, repoA])

  // ── 1. El bypass ───────────────────────────────────────────────────────────
  console.log('\n▸ El bypass de consentimiento')
  // La repositora B invita por código: nace pendiente, iniciada por ella.
  await c.query(`INSERT INTO fixer_repo_solicitudes (fixer_id, repositora_id, estado, iniciado_por)
                 VALUES ($1,$2,'pendiente','repositora')`, [fixer, repoB])

  const pendientesConFiltro = async (repo) => (await uno(
    `SELECT count(*)::int n FROM fixer_repo_solicitudes
     WHERE repositora_id=$1 AND estado='pendiente' AND iniciado_por='fixer'`, [repo])).n
  const pendientesSinFiltro = async (repo) => (await uno(
    `SELECT count(*)::int n FROM fixer_repo_solicitudes
     WHERE repositora_id=$1 AND estado='pendiente'`, [repo])).n

  caso('CONTROL — sin el filtro, la repositora ve su PROPIA invitación', await pendientesSinFiltro(repoB), 1)
  caso('con el filtro no la ve, y por lo tanto no la puede aprobar', await pendientesConFiltro(repoB), 0)

  // Y la postulación del fixer sí aparece.
  await c.query(`UPDATE fixer_repo_solicitudes SET iniciado_por='fixer'
                 WHERE fixer_id=$1 AND repositora_id=$2`, [fixer, repoB])
  caso('una postulación del fixer SÍ aparece', await pendientesConFiltro(repoB), 1)

  // ── 2. El pisotón ──────────────────────────────────────────────────────────
  console.log('\n▸ El pisotón de profiles.repositora_id')
  const perfilRepo = async () => (await uno(`SELECT repositora_id FROM profiles WHERE id=$1`, [fixer])).repositora_id
  caso('CONTROL — el fixer arranca trabajando para A', await perfilRepo(), repoA)

  // Lo que hacía la action vieja: UPDATE sin condición.
  await c.query('SAVEPOINT viejo')
  await c.query(`UPDATE profiles SET repositora_id=$2 WHERE id=$1`, [fixer, repoB])
  caso('CONTROL — el UPDATE incondicional lo movía a B', await perfilRepo(), repoB)
  await c.query('ROLLBACK TO SAVEPOINT viejo')

  // Lo que hace la action nueva: solo si está en null.
  const aprobarComoLaAction = async (repo) => {
    await c.query(`UPDATE fixer_repo_solicitudes SET estado='aprobada'
                   WHERE fixer_id=$1 AND repositora_id=$2`, [fixer, repo])
    const p = await uno(`SELECT repositora_id FROM profiles WHERE id=$1`, [fixer])
    if (!p?.repositora_id) {
      await c.query(`UPDATE profiles SET repositora_id=$2 WHERE id=$1`, [fixer, repo])
    }
  }
  await aprobarComoLaAction(repoB)
  caso('aprobar en B NO lo mueve: sigue con A en el perfil', await perfilRepo(), repoA)
  caso('y el vínculo con B quedó igual, en la tabla que es la fuente',
    (await uno(`SELECT count(*)::int n FROM fixer_repo_solicitudes
                WHERE fixer_id=$1 AND estado='aprobada'`, [fixer])).n, 2)

  console.log('\n▸ Y si el perfil está vacío, sí se llena')
  await c.query(`UPDATE profiles SET repositora_id=NULL WHERE id=$1`, [fixer])
  await c.query(`DELETE FROM fixer_repo_solicitudes WHERE fixer_id=$1 AND repositora_id=$2`, [fixer, repoB])
  await c.query(`INSERT INTO fixer_repo_solicitudes (fixer_id, repositora_id, estado, iniciado_por)
                 VALUES ($1,$2,'pendiente','fixer')`, [fixer, repoB])
  await aprobarComoLaAction(repoB)
  caso('con el perfil en null, la aprobación lo llena', await perfilRepo(), repoB)

  // ── 3. El rechazo ──────────────────────────────────────────────────────────
  console.log('\n▸ El rechazo deja rastro y no borra')
  await c.query(`DELETE FROM fixer_distri_solicitudes WHERE fixer_id=$1`, [fixer])
  await c.query(`INSERT INTO fixer_distri_solicitudes (fixer_id, distri_id, estado, iniciado_por)
                 VALUES ($1,$2,'pendiente','fixer')`, [fixer, distri])
  const ahora = new Date().toISOString()
  await c.query(`UPDATE fixer_distri_solicitudes
                 SET estado='rechazada', motivo_rechazo=$3, rechazada_at=$4, updated_at=$4
                 WHERE fixer_id=$1 AND distri_id=$2`, [fixer, distri, 'No cubrimos esa zona', ahora])
  const r = await uno(`SELECT estado, motivo_rechazo, rechazada_at IS NOT NULL AS tiene_fecha
                       FROM fixer_distri_solicitudes WHERE fixer_id=$1 AND distri_id=$2`, [fixer, distri])
  caso('la fila sigue existiendo, en rechazada', r?.estado, 'rechazada')
  caso('con su motivo', r?.motivo_rechazo, 'No cubrimos esa zona')
  caso('y con rechazada_at, que es lo que manda los 30 días', r?.tiene_fecha, true)
  caso('ya no aparece como pendiente',
    (await uno(`SELECT count(*)::int n FROM fixer_distri_solicitudes
                WHERE distri_id=$1 AND estado='pendiente' AND iniciado_por='fixer'`, [distri])).n, 0)

  // El motivo es OPCIONAL: rechazar sin texto tiene que funcionar igual.
  await c.query(`UPDATE fixer_distri_solicitudes SET estado='pendiente', motivo_rechazo=NULL, rechazada_at=NULL
                 WHERE fixer_id=$1 AND distri_id=$2`, [fixer, distri])
  await c.query(`UPDATE fixer_distri_solicitudes
                 SET estado='rechazada', motivo_rechazo=NULL, rechazada_at=$3, updated_at=$3
                 WHERE fixer_id=$1 AND distri_id=$2`, [fixer, distri, ahora])
  const sinMotivo = await uno(`SELECT estado, motivo_rechazo FROM fixer_distri_solicitudes
                               WHERE fixer_id=$1 AND distri_id=$2`, [fixer, distri])
  caso('se puede rechazar sin motivo', { e: sinMotivo?.estado, m: sinMotivo?.motivo_rechazo },
    { e: 'rechazada', m: null })

} finally {
  await c.query('ROLLBACK')
  console.log('\n(ROLLBACK — dev quedó exactamente como estaba)')
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
