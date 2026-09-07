#!/usr/bin/env node
// =============================================================================
// aplicar-migraciones.mjs — aplica supabase/migrations/*.sql en orden
// =============================================================================
// Para qué existe: verificar que el set completo de migraciones reproduce el
// schema de producción sobre una base vacía. No reemplaza a `supabase db push`
// para el flujo normal; es una herramienta de verificación.
//
// Requiere el paquete `pg`, que NO está en package.json a propósito:
//   npm install --no-save pg
//
// Uso:
//   export PGURL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
//   node scripts/aplicar-migraciones.mjs --ref <project-ref>
//
// El --ref es obligatorio y se valida contra PGURL. Es la red de seguridad
// contra correr esto sobre producción por accidente: si el ref no aparece en
// la connection string, el script no hace nada.
//
// Cada archivo se envía en una sola llamada, así que corre dentro de una
// transacción implícita: si un archivo falla, se revierte entero y no deja la
// base a mitad de camino. Se corta en el primer error.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { salirCon, resolverConexion, cargarClient } from './lib/conexion.mjs'
import { exigirConfirmacionProd, nombreDeRef } from './lib/entorno.mjs'

// SQL de los GRANT que Supabase crea al provisionar el proyecto y que
// DROP SCHEMA public se lleva puestos. No están en ninguna migración porque no
// son parte del schema versionado. Sin ellos la app no lee NADA aunque los
// datos estén: toda query devuelve "permission denied for schema public".
// Es el fallo más desconcertante, porque desde el SQL Editor —que corre como
// postgres— la base se ve perfecta.
const SQL_GRANTS = `
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;
`

const DIR_MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

// ── Guardas ──────────────────────────────────────────────────────────────────
// --reset  : DROP SCHEMA public CASCADE + CREATE SCHEMA public
// --grants : reponer los permisos de anon/authenticated/service_role
// --solo-grants : hacer únicamente los GRANT y salir
//
// El --reset merece al menos la misma protección que un seed: exige --ref como
// todo lo demás, y GONDOLAPP_PROD=1 si el ref resuelve a producción. La lista
// de refs conocidos vive en entorno.mjs, para no tener dos criterios distintos
// de qué es producción.
const hacerReset = process.argv.includes('--reset')
const hacerGrants = process.argv.includes('--grants') || process.argv.includes('--solo-grants')
const soloGrants = process.argv.includes('--solo-grants')

// La confirmación de producción va ANTES de resolver credenciales: si la
// intención es peligrosa hay que frenar por eso, no por un detalle de conexión.
if (hacerReset) {
  const i = process.argv.indexOf('--ref')
  const ref = i !== -1 ? process.argv[i + 1] : null
  if (!ref) salirCon('Falta --ref <project-ref>. Es obligatorio, y más para --reset.')
  exigirConfirmacionProd(ref, 'DROP SCHEMA public CASCADE borra TODO el esquema')
}

const { config, refEsperado, descripcion, verificaSsl } = resolverConexion(process.argv)
const Client = await cargarClient()

// ── Archivos, en orden lexicográfico ─────────────────────────────────────────
const todos = readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()
if (todos.length === 0) salirCon(`No hay archivos .sql en ${DIR_MIGRACIONES}`)

// --desde <archivo>: reanudar desde ese archivo inclusive.
//
// Para qué: si la corrida corta en el archivo N, ese archivo se revirtió entero
// pero los N-1 anteriores quedaron aplicados. Volver a empezar desde cero contra
// esa base NO funciona: varias migraciones del set no son re-ejecutables (crean
// policies sin DROP previo, por ejemplo). Lo correcto es arreglar el archivo que
// falló y reanudar desde ahí.
const indiceDesde = process.argv.indexOf('--desde')
const desde = indiceDesde !== -1 ? process.argv[indiceDesde + 1] : null
if (indiceDesde !== -1 && !desde) salirCon('--desde necesita un nombre de archivo.')
if (desde && !todos.includes(desde)) {
  salirCon(`--desde "${desde}" no existe en ${DIR_MIGRACIONES}.\n  Tiene que ser el nombre exacto del archivo.`)
}

const archivos = desde ? todos.slice(todos.indexOf(desde)) : todos
const omitidos = todos.length - archivos.length

// ── Contexto del error: ubicar la sentencia que falló ────────────────────────
// Postgres devuelve `position` como offset en caracteres sobre el string
// enviado. Con eso se puede señalar la línea exacta dentro del archivo.
function contextoDelError(sql, position) {
  if (!position) return null
  const offset = Number(position) - 1
  if (!Number.isFinite(offset) || offset < 0 || offset > sql.length) return null

  const lineas = sql.slice(0, offset).split('\n')
  const nroLinea = lineas.length
  const columna = lineas[lineas.length - 1].length + 1
  const todas = sql.split('\n')
  const desde = Math.max(0, nroLinea - 4)
  const hasta = Math.min(todas.length, nroLinea + 3)

  const extracto = []
  for (let i = desde; i < hasta; i++) {
    const marca = i === nroLinea - 1 ? '>' : ' '
    extracto.push(`  ${marca} ${String(i + 1).padStart(4)} | ${todas[i]}`)
    if (i === nroLinea - 1) extracto.push(`         ${' '.repeat(String(columna).length)}${' '.repeat(columna)}^`)
  }
  return { nroLinea, columna, extracto: extracto.join('\n') }
}

// Verifica que los GRANT quedaron puestos, en vez de asumirlo. Solo consulta
// roles que existan, así no rompe en una base que no sea de Supabase.
async function mostrarGrants(client) {
  const { rows } = await client.query(`
    SELECT r.rolname,
           has_schema_privilege(r.rolname, 'public', 'USAGE') AS usage_ok,
           (SELECT count(*)::int FROM information_schema.role_table_grants g
             WHERE g.grantee = r.rolname AND g.table_schema = 'public'
               AND g.privilege_type = 'SELECT') AS tablas
    FROM pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
    ORDER BY r.rolname
  `)
  console.log('  Verificación de permisos:')
  for (const r of rows) {
    console.log(`    ${r.rolname.padEnd(15)} USAGE sobre public: ${r.usage_ok ? 'sí' : 'NO'}   tablas con SELECT: ${r.tablas}`)
  }
  console.log('')
}

// ── Corrida ──────────────────────────────────────────────────────────────────
const client = new Client(config)

try {
  await client.connect()
} catch (error) {
  console.error(`\n✗ No se pudo conectar a "${refEsperado}".`)
  console.error(`  ${error.code ?? 'sin código'}: ${error.message}`)
  console.error(`  Conexión (enmascarada): ${descripcion}`)

  if (error.code === '28P01') {
    // El pooler de Supabase (Supavisor) usa postgres.<ref> solo para enrutar y
    // después conecta upstream como `postgres`, así que el error habla de un
    // usuario que vos no escribiste. No es que falte el sufijo: si el ruteo
    // hubiera fallado, ni siquiera se llegaría a autenticar.
    console.error('\n  El mensaje dice user "postgres" aunque tu PGURL diga postgres.<ref>:')
    console.error('  el pooler enruta por el sufijo y después conecta upstream como postgres.')
    console.error('  Que llegue a autenticar significa que el ruteo funcionó: lo que no coincide')
    console.error('  es la password.\n')
    console.error('  Revisá que sea la del proyecto correcto — es fácil pegar la de otro proyecto — o')
    console.error('  generá una nueva en Settings → Database → Reset database password.')
  } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
    console.error('\n  No se resolvió el host. Revisá la región del pooler en la connection string.')
  }
  console.error('')
  process.exit(1)
}

const { rows: [info] } = await client.query('SELECT current_database() AS db, version() AS v')
console.log(`\nConexión:  ${descripcion}`)
console.log(`Base:      ${info.db}`)
console.log(`Servidor:  ${info.v.split(',')[0]}`)
console.log(`Proyecto:  ${refEsperado}`)
if (!verificaSsl) console.log('SSL:       sin verificación de cadena (definí PGSSLROOTCERT para verificarla)')
console.log(
  omitidos > 0
    ? `Archivos:  ${archivos.length} de ${todos.length} (${omitidos} omitidos por --desde ${desde})\n`
    : `Archivos:  ${archivos.length}\n`
)

// ── --reset: vaciar el esquema ───────────────────────────────────────────────
if (hacerReset) {
  const { rows: [antes] } = await client.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
  )
  console.log(`⚠️  RESET — el esquema public tiene ${antes.n} tablas y se van a borrar todas`)
  const t0 = Date.now()
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  console.log(`  ✓ esquema public vaciado y recreado (${Date.now() - t0}ms)\n`)
}

// ── --solo-grants: reponer permisos y salir ──────────────────────────────────
if (soloGrants) {
  await client.query(SQL_GRANTS)
  console.log('✓ GRANT repuestos para anon, authenticated y service_role\n')
  await mostrarGrants(client)
  await client.end()
  process.exit(0)
}

let aplicados = 0
const arranque = Date.now()

for (const archivo of archivos) {
  const sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8')
  const t0 = Date.now()
  try {
    await client.query(sql)
    aplicados++
    console.log(`  ✓ ${String(aplicados).padStart(2)}/${archivos.length}  ${archivo}  (${Date.now() - t0}ms)`)
  } catch (error) {
    console.error(`\n✗ FALLÓ en ${archivo}\n`)
    console.error(`  ${error.code ?? 'sin código'}: ${error.message}`)
    if (error.detail) console.error(`  detalle: ${error.detail}`)
    if (error.hint) console.error(`  hint: ${error.hint}`)
    if (error.where) console.error(`  contexto: ${error.where}`)

    const ctx = contextoDelError(sql, error.position)
    if (ctx) {
      console.error(`\n  Línea ${ctx.nroLinea}, columna ${ctx.columna} de ${archivo}:\n`)
      console.error(ctx.extracto)
    } else {
      console.error('\n  Postgres no reportó posición. Suele pasar con errores de constraint')
      console.error('  o de dependencias, no de sintaxis — revisar el mensaje de arriba.')
    }

    console.error(`\n  El archivo se revirtió entero (transacción implícita).`)
    console.error(`  Aplicados sin problema antes de este: ${aplicados}/${archivos.length}\n`)
    await client.end()
    process.exit(1)
  }
}

console.log(`\n✓ ${aplicados}/${archivos.length} migraciones aplicadas en ${((Date.now() - arranque) / 1000).toFixed(1)}s`)

if (hacerGrants) {
  await client.query(SQL_GRANTS)
  console.log('✓ GRANT repuestos para anon, authenticated y service_role\n')
  await mostrarGrants(client)
} else if (hacerReset) {
  console.log('\n⚠️  Hiciste --reset sin --grants: los permisos de anon/authenticated/')
  console.log('   service_role NO están repuestos y la app no va a leer nada.')
  console.log(`   Corré: node scripts/aplicar-migraciones.mjs --ref ${refEsperado} --solo-grants\n`)
}

await client.end()
console.log('Siguiente paso: node scripts/comparar-schema.mjs --ref ' + refEsperado + '\n')
