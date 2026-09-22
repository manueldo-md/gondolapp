/**
 * probar-migracion-postulacion.mjs — DRY-RUN de 20260924100000_postulacion_fixer.sql
 *
 * Aplica la migración dentro de una transacción, la ejercita y termina con
 * ROLLBACK. No deja nada escrito.
 *
 * Lo que prueba, en orden de importancia:
 *
 *   1. Que los CUATRO tipos de notificación que el código ya escribe —y que hoy
 *      la base rechaza en silencio— pasen a entrar. Eso no es parte de la
 *      feature: está roto en producción ahora mismo.
 *   2. Que lo que YA entraba siga entrando. Se reescribe el CHECK entero, así
 *      que perderse uno de los 29 tipos viejos es el error caro.
 *   3. Que las 12 solicitudes de repositora existentes queden etiquetadas como
 *      lo que son ('repositora'), no como postulaciones.
 *   4. Que nada de esto encienda la feature: la migración sola no cambia ningún
 *      comportamiento.
 *
 *   node scripts/probar-migracion-postulacion.mjs
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

/** Inserta y revierte: devuelve null si entró, o el SQLSTATE si rebotó. */
async function pruebaInsert(sql, args) {
  await c.query('SAVEPOINT p')
  try { await c.query(sql, args); await c.query('ROLLBACK TO SAVEPOINT p'); return null }
  catch (e) { await c.query('ROLLBACK TO SAVEPOINT p'); return e.code }
}

try {
  await c.query('BEGIN')

  const gond = (await uno(`SELECT id FROM profiles WHERE tipo_actor='gondolero' LIMIT 1`)).id
  const NOTIF = `INSERT INTO notificaciones (gondolero_id, tipo, titulo, mensaje, leida) VALUES ($1,$2,'dry','dry',false)`
  const ACTOR = `INSERT INTO notificaciones (gondolero_id, tipo, titulo, mensaje, leida, actor_tipo, actor_id)
                 VALUES ($1,'foto_aprobada','dry','dry',false,$2,$1)`

  console.log('\n▸ CONTROL — el estado roto de HOY')
  caso('vinculacion_invitacion rebota',  await pruebaInsert(NOTIF, [gond, 'vinculacion_invitacion']), '23514')
  caso('desvinculacion_repositora rebota', await pruebaInsert(NOTIF, [gond, 'desvinculacion_repositora']), '23514')
  caso('actor_tipo=fixer rebota',        await pruebaInsert(ACTOR, [gond, 'fixer']), '23514')
  caso('CONTROL — y por eso no hay ni una fila de ese tipo',
    (await uno(`SELECT count(*)::int n FROM notificaciones WHERE tipo='vinculacion_invitacion'`)).n, 0)

  // ── Aplicar la migración ───────────────────────────────────────────────────
  // El archivo trae su propio BEGIN;/COMMIT; porque está hecho para pegar en el
  // SQL Editor. Acá hay que sacarlos: ese COMMIT cerraría esta transacción y
  // ESCRIBIRÍA SOBRE DEV. Se verifica que hayan salido los dos y se aborta si no
  // — un reemplazo que no matchea sería un borrado silencioso con daño real.
  const crudo = fs.readFileSync('supabase/migrations/20260924100000_postulacion_fixer.sql', 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (transacción del dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(`No se pudieron sacar el BEGIN/COMMIT (encontrados: ${sacados}). Se aborta: commitearía sobre dev.`)
  }
  await c.query(sql)
  console.log('\n▸ Migración aplicada (el bloque de verificación no tiró)')

  console.log('\n▸ Los cuatro que el código ya escribe y la base rechazaba')
  for (const t of ['vinculacion_invitacion', 'vinculacion_invitacion_enviada',
                   'vinculacion_nueva', 'desvinculacion_repositora']) {
    caso(`${t} ahora entra`, await pruebaInsert(NOTIF, [gond, t]), null)
  }
  caso('y el del tramo, postulacion_fixer', await pruebaInsert(NOTIF, [gond, 'postulacion_fixer']), null)

  console.log('\n▸ Lo que YA entraba tiene que seguir entrando')
  // Se reescribe el CHECK entero: perderse uno de los 29 viejos es el error caro.
  for (const t of ['foto_aprobada', 'foto_rechazada', 'nivel_subido', 'mision_aprobada',
                   'puntos_acreditados', 'nueva_campana_disponible', 'comercio_validado',
                   'campana_aprobada', 'campana_rechazada', 'nueva_mision_recibida',
                   'campana_por_vencer', 'nueva_distribuidora_vinculada',
                   'distribuidora_termino_relacion', 'campana_marca_pendiente',
                   'gondolero_solicitud_vinculacion', 'gondolero_completo_mision',
                   'comercio_pendiente_validacion', 'marca_solicitud_reinicio_relacion',
                   'campana_por_vencer_distri', 'admin_campana_pendiente',
                   'admin_comercio_pendiente', 'admin_error_reportado', 'solicitud_aprobada',
                   'solicitud_rechazada', 'desvinculacion_distri', 'cambios_solicitados',
                   'campana_cerrada_por_tope', 'comercio_ubicacion_reportada',
                   'comercio_rechazado']) {
    const r = await pruebaInsert(NOTIF, [gond, t])
    if (r !== null) { fallos++; console.log(`   ✗  se perdió el tipo viejo "${t}" (${r})`) }
  }
  console.log('   ✓  los 29 tipos viejos siguen entrando')

  caso('un tipo inventado sigue rebotando', await pruebaInsert(NOTIF, [gond, 'no_existe_este_tipo']), '23514')

  console.log('\n▸ actor_tipo: los seis')
  for (const a of ['gondolero', 'fixer', 'marca', 'distribuidora', 'repositora', 'admin']) {
    caso(`actor_tipo=${a}`, await pruebaInsert(ACTOR, [gond, a]), null)
  }
  caso('uno inventado rebota', await pruebaInsert(ACTOR, [gond, 'fabricante']), '23514')

  console.log('\n▸ Las columnas nuevas')
  const cols = await uno(`
    SELECT count(*) FILTER (WHERE table_name='campanas' AND column_name='abierta_a_postulaciones')::int AS flag,
           count(*) FILTER (WHERE table_name='fixer_repo_solicitudes' AND column_name='iniciado_por')::int AS inic,
           count(*) FILTER (WHERE column_name IN ('motivo_rechazo','rechazada_at')
                              AND table_name IN ('fixer_repo_solicitudes','fixer_distri_solicitudes'))::int AS rech
    FROM information_schema.columns
    WHERE table_name IN ('campanas','fixer_repo_solicitudes','fixer_distri_solicitudes')`)
  caso('campanas.abierta_a_postulaciones', cols.flag, 1)
  caso('fixer_repo_solicitudes.iniciado_por', cols.inic, 1)
  caso('motivo_rechazo + rechazada_at en las dos tablas', cols.rech, 4)

  console.log('\n▸ Las 12 solicitudes que ya existen')
  const etiquetas = await uno(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE iniciado_por = 'repositora')::int AS como_repositora,
           count(*) FILTER (WHERE iniciado_por IS NULL)::int AS sin_etiqueta
    FROM fixer_repo_solicitudes`)
  caso('todas quedaron etiquetadas como de la repositora',
    { como_repositora: etiquetas.como_repositora, sin_etiqueta: etiquetas.sin_etiqueta },
    { como_repositora: etiquetas.total, sin_etiqueta: 0 })
  caso('el CHECK nuevo acepta "fixer"',
    await pruebaInsert(`UPDATE fixer_repo_solicitudes SET iniciado_por='fixer'`, []), null)
  caso('y rechaza cualquier otra cosa',
    await pruebaInsert(`UPDATE fixer_repo_solicitudes SET iniciado_por='distri'`, []), '23514')

  console.log('\n▸ Y lo que NO tiene que haber cambiado todavía')
  // La migración sola no enciende nada: ninguna campaña acepta postulaciones y
  // el flag existe con el valor que describe el comportamiento de hoy.
  const flag = await uno(`SELECT count(*) FILTER (WHERE abierta_a_postulaciones)::int AS abiertas,
                                 count(*)::int AS total FROM campanas`)
  caso('ninguna campaña quedó abierta a postulaciones', flag.abiertas, 0)
  caso('CONTROL — y hay campañas para que eso signifique algo', flag.total > 0, true)
  caso('estado="rechazada" seguía aceptándose desde antes',
    await pruebaInsert(`UPDATE fixer_repo_solicitudes SET estado='rechazada'`, []), null)

} finally {
  await c.query('ROLLBACK')
  console.log('\n(ROLLBACK — dev quedó exactamente como estaba)')
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
