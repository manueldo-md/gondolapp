/**
 * probar-pendientes-distri.mts — ¿la bandeja de la distri muestra algo?
 *
 *   npx tsx scripts/probar-pendientes-distri.mts            (dev)
 *   npx tsx scripts/probar-pendientes-distri.mts --prod
 *
 * Solo lectura.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Hasta el 25/9/2026 la bandeja filtraba por las CAMPAÑAS de la distri, y el
 * alta oportunista no escribe `campana_id`. Resultado: **cero comercios
 * visibles en las dos bases, desde siempre.**
 *
 * Un bug así no lo agarra ningún test de unidad: las dos consultas —la de la
 * página y la del badge— eran correctas *como consultas*. Lo que estaba mal era
 * el criterio, y eso solo se ve contando contra datos reales.
 *
 * Por eso este script **llama a la misma función que corre en producción** en
 * vez de reimplementar el filtro. Un control que replica lo que dice verificar
 * se queda verde el día que los dos se separan — ya pasó tres veces acá.
 */
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
// @ts-expect-error — .mjs sin tipos
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import {
  gondolerosParaPendientes, contarComerciosPendientesDistri,
} from '../lib/comercios-pendientes-distri'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const { vars } = credencialesDeRef(ref)

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

console.log(`\n▸ ${nombreDeRef(ref)}`)

const { rows: pend } = await pg.query(
  `SELECT count(*) n FROM comercios WHERE estado = 'pendiente_validacion'`)
console.log(`  comercios en pendiente_validacion, en total: ${pend[0].n}`)

const { rows: distris } = await pg.query('SELECT id, razon_social FROM distribuidoras ORDER BY razon_social')

let vistosEnTotal = 0
const vistosPor = new Map<string, string[]>()

console.log('\n▸ Lo que ve cada distri con el criterio NUEVO (por gondolero)')
for (const d of distris) {
  const gondoleroIds = await gondolerosParaPendientes(d.id, admin)
  const { rows } = gondoleroIds.length
    ? await pg.query(
        `SELECT id, nombre FROM comercios
          WHERE estado = 'pendiente_validacion' AND registrado_por = ANY($1::uuid[])`,
        [gondoleroIds])
    : { rows: [] }

  // El badge tiene que decir exactamente lo mismo que la lista. Si difieren,
  // el usuario ve un número que no puede reconciliar con lo que hay en
  // pantalla — peor que el bug original.
  const badge = await contarComerciosPendientesDistri(d.id, admin as never)
  caso(`${String(d.razon_social).slice(0, 26).padEnd(26)} ${rows.length} pendientes · ${gondoleroIds.length} gondoleros — el badge coincide`,
    badge, rows.length)

  vistosEnTotal += rows.length
  for (const c of rows) {
    if (!vistosPor.has(c.id)) vistosPor.set(c.id, [])
    vistosPor.get(c.id)!.push(d.razon_social)
  }
}

console.log('\n▸ EL BUG: con el criterio VIEJO no se veía ninguno')
{
  // Se reproduce el filtro anterior —por campañas de la distri— para medir
  // contra qué se compara la mejora. No es el código que corre: es el que
  // corría.
  let viejos = 0
  for (const d of distris) {
    const { rows: camps } = await pg.query('SELECT id FROM campanas WHERE distri_id = $1', [d.id])
    if (camps.length === 0) continue
    const { rows } = await pg.query(
      `SELECT count(*) n FROM comercios
        WHERE estado = 'pendiente_validacion' AND campana_id = ANY($1::uuid[])`,
      [camps.map((c: { id: string }) => c.id)])
    viejos += Number(rows[0].n)
  }
  caso('el criterio viejo mostraba CERO', viejos, 0)
  caso('el nuevo muestra al menos uno', vistosEnTotal > 0, true)
}

console.log('\n▸ Los que siguen sin llegarle a ninguna distri')
{
  const { rows: todos } = await pg.query(
    `SELECT id, nombre, registrado_por FROM comercios WHERE estado = 'pendiente_validacion'`)
  const huerfanos = todos.filter((c: { id: string }) => !vistosPor.has(c.id))
  console.log(`  ${huerfanos.length} de ${todos.length}`)
  for (const h of huerfanos) {
    const { rows: q } = await pg.query(
      'SELECT nombre FROM profiles WHERE id = $1', [h.registrado_por])
    console.log(`    ${String(h.nombre).slice(0, 26).padEnd(26)} registrado_por: ${q[0]?.nombre ?? '(nadie)'}`)
  }
  // No es un fallo: un comercio cargado por alguien sin distri vinculada no
  // tiene distri a quien mostrárselo, y para eso está la bandeja de admin —
  // que no filtra por nada. Se imprime para que el número se vea, no se adivine.
  console.log('  (los ve el admin, cuya bandeja no filtra por distri)')
}

console.log('\n▸ Un comercio puede aparecerle a DOS distris, y está bien')
{
  const compartidos = [...vistosPor.entries()].filter(([, ds]) => ds.length > 1)
  console.log(`  ${compartidos.length} comercios los ven 2+ distris`)
  for (const [, ds] of compartidos) console.log(`    → ${ds.join(' + ')}`)
  // Un gondolero puede estar vinculado a varias a la vez y cualquiera puede
  // validar. `validarComercioYCrearMision` es idempotente, así que las dos
  // aprobando no pagan dos veces.
  caso('ninguno se duplica dentro de la misma distri',
    [...vistosPor.values()].every(ds => ds.length === new Set(ds).size), true)
}

await pg.end()
console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exit(fallos ? 1 : 0)
