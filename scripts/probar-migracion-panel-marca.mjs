/**
 * probar-migracion-panel-marca.mjs — DRY-RUN de 20260925100000_panel_marca.sql
 *
 * Aplica la migración dentro de una transacción, la ejercita y termina con
 * ROLLBACK. No deja nada escrito.
 *
 *   node scripts/probar-migracion-panel-marca.mjs            (dev)
 *   GONDOLAPP_PROD=1 node scripts/probar-migracion-panel-marca.mjs --prod
 *
 * ── LO QUE PRUEBA, EN ORDEN DE IMPORTANCIA ──────────────────────────────────
 *
 *   1. EL ANCLA. Es el error que arruinaría el panel entero sin que nadie lo
 *      note: con `mision_respuestas.created_at` toda la historia de prod cae en
 *      un solo mes y el gráfico dibuja una raya. El control no lo mira de
 *      costado —mueve el `capturada_at` de una misión adentro de la transacción
 *      y verifica que el mes se mueva con ella—. Si alguien cambia el ancla,
 *      este control se pone rojo en las dos bases.
 *
 *   2. LOS NÚMEROS CONGELADOS. El piloto de Georgalos son 56 observaciones y 45
 *      presentes, en las dos bases, y no va a cambiar nunca: `registrarMision`
 *      no escribe `fotos.declaracion` desde 20260407124015. Si esos números se
 *      mueven, se movió la regla de conteo, no los datos.
 *
 *   3. QUE LA OBSERVACIÓN SEA LA MISIÓN Y NO LA FILA. 112 fotos son 56
 *      observaciones. Contar filas daría exactamente el doble y el porcentaje
 *      saldría igual, así que el bug sería invisible en el gráfico y solo se
 *      vería en la base de cálculo — que es justo lo que este panel promete.
 *
 *   4. EL AISLAMIENTO ENTRE MARCAS. Una función que devuelva de más acá es una
 *      marca viendo la presencia de otra.
 */
import pg from 'pg'
import fs from 'fs'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const REF_DEV  = 'mqeymmprvpclpyjpujvf'
const REF_PROD = 'xzznzustgsacmfwsupux'

const esProd = process.argv.includes('--prod')
const ref    = esProd ? REF_PROD : REF_DEV

if (esProd && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para correrlo contra producción hace falta GONDOLAPP_PROD=1.\n' +
                '  (Aunque termina en ROLLBACK, abre una transacción sobre prod.)\n')
  process.exit(1)
}

const cred = credencialesDeRef(ref)
if (!cred?.vars.PGURL) {
  console.error(`\n✗ No encontré PGURL para el ref ${ref}.\n`)
  process.exit(1)
}

console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
function nota(texto) { console.log(`   ·  ${texto}`) }

const uno   = async (sql, args = []) => (await c.query(sql, args)).rows[0]
const todas = async (sql, args = []) => (await c.query(sql, args)).rows

/** Corre `fn` sobre un SAVEPOINT y lo revierte, pase lo que pase. */
async function enSandbox(fn) {
  await c.query('SAVEPOINT s')
  try { return await fn() }
  finally { await c.query('ROLLBACK TO SAVEPOINT s') }
}

/** Solo las filas de TOTAL (campana_id NULL): las que dibujan la línea. */
const totalesDe = async (marcaId) => todas(
  `SELECT mes, metrica_slug AS slug, observaciones::int AS obs, base_pdv::int AS pdv,
          obs_con_valor::int AS con_valor, suma_numerica::float8 AS suma, verdaderos::int AS si
     FROM public.panel_marca_series($1)
    WHERE campana_id IS NULL
    ORDER BY mes, metrica_slug`, [marcaId])

// ── Los números congelados de cada base ──────────────────────────────────────
// Medidos el 23/9/2026. El piloto es idéntico en las dos; lo que cambia es que
// dev no tiene ninguna respuesta tipificada colgando de una campaña con marca.
const ESPERADO = {
  dev: {
    Georgalos: [
      { mes: '2026-03', slug: 'presencia', obs: 56, pdv: 56, con_valor: 56, suma: null, si: 45 },
    ],
    Suprante: [],
    visitas: [
      { mes: '2026-03', pdv: 56, misiones: 56 },
      { mes: '2026-04', pdv: 23, misiones: 23 },
      { mes: '2026-09', pdv:  9, misiones: 15 },
    ],
  },
  produccion: {
    Georgalos: [
      { mes: '2026-03', slug: 'presencia', obs: 56, pdv: 56, con_valor: 56, suma: null,  si: 45 },
      { mes: '2026-04', slug: 'precio',    obs: 23, pdv: 23, con_valor: 23, suma: 86920, si: 0  },
      { mes: '2026-09', slug: 'precio',    obs:  2, pdv:  2, con_valor:  2, suma: 5380,  si: 0  },
    ],
    Suprante: [
      { mes: '2026-04', slug: 'frentes',   obs: 8, pdv: 8, con_valor: 8, suma: 26,   si: 0 },
      { mes: '2026-04', slug: 'presencia', obs: 8, pdv: 8, con_valor: 8, suma: null, si: 4 },
      { mes: '2026-09', slug: 'frentes',   obs: 3, pdv: 3, con_valor: 3, suma: 22,   si: 0 },
      { mes: '2026-09', slug: 'presencia', obs: 3, pdv: 3, con_valor: 3, suma: null, si: 3 },
    ],
    visitas: [
      { mes: '2026-03', pdv: 56, misiones: 56 },
      { mes: '2026-04', pdv: 23, misiones: 23 },
      { mes: '2026-09', pdv:  2, misiones:  2 },
    ],
  },
}[nombreDeRef(ref)]

try {
  await c.query('BEGIN')

  const marcaDe = async (nombre) => (await uno(
    `SELECT id FROM marcas WHERE razon_social ILIKE $1 || '%' LIMIT 1`, [nombre]))?.id
  const GEORGALOS = await marcaDe('Georgalos')
  const SUPRANTE  = await marcaDe('Suprante')
  const ACME      = await marcaDe('ACME')

  // ── CONTROL — el estado roto de HOY ────────────────────────────────────────
  // Es lo que justifica el tramo: la fórmula del dashboard actual, calculada
  // acá con los datos de esta base.
  console.log('\n▸ CONTROL — lo que el dashboard muestra hoy')
  const roto = await todas(`
    SELECT ma.razon_social AS marca,
           round(100.0 * count(*) FILTER (WHERE f.declaracion = 'producto_presente')
                 / nullif(count(*), 0))::int AS pct
      FROM fotos f
      JOIN campanas c ON c.id = f.campana_id
      JOIN marcas  ma ON ma.id = c.marca_id
     WHERE f.estado = 'aprobada'
     GROUP BY 1 ORDER BY 1`)
  for (const r of roto) nota(`${r.marca}: "Presencia ${r.pct}%"`)
  const supranteRoto = roto.find(r => /Suprante/.test(r.marca))
  if (supranteRoto) {
    caso('Suprante lee 0% aunque tenga respuestas tipificadas', supranteRoto.pct, 0)
  } else {
    nota('(esta base no tiene fotos aprobadas de Suprante: el control no corre)')
  }

  // ── Aplicar la migración ───────────────────────────────────────────────────
  // El archivo trae su propio BEGIN;/COMMIT; porque está hecho para pegar en el
  // SQL Editor. Acá hay que sacarlos: ese COMMIT cerraría esta transacción y
  // escribiría de verdad. Se verifica que hayan salido los dos y se aborta si
  // no — un reemplazo que no matchea sería un commit silencioso.
  const ARCHIVO = 'supabase/migrations/20260925100000_panel_marca.sql'
  const crudo = fs.readFileSync(ARCHIVO, 'utf8')
  const sql = crudo.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi, '-- (transacción del dry-run)')
  const sacados = (crudo.match(/^\s*(BEGIN|COMMIT)\s*;\s*$/gmi) ?? []).length
  if (sacados !== 2 || /^\s*(BEGIN|COMMIT)\s*;\s*$/mi.test(sql)) {
    throw new Error(`No se pudieron sacar el BEGIN/COMMIT (encontrados: ${sacados}). Se aborta.`)
  }
  await c.query(sql)
  console.log('\n▸ Migración aplicada (el bloque DO de verificación no tiró)')

  // ── Los índices ────────────────────────────────────────────────────────────
  console.log('\n▸ Los índices')
  const idx = await uno(`
    SELECT count(*) FILTER (WHERE indexname = 'misiones_campana_id_idx')::int      AS mis,
           count(*) FILTER (WHERE indexname = 'fotos_declaracion_mision_idx')::int AS fot
      FROM pg_indexes WHERE schemaname = 'public'`)
  caso('misiones(campana_id)', idx.mis, 1)
  caso('fotos(mision_id) WHERE declaracion IS NOT NULL', idx.fot, 1)
  // El Seq Scan sobre misiones era el motivo del índice.
  const plan = (await todas(
    `EXPLAIN (COSTS OFF) SELECT * FROM public.panel_marca_series($1)`, [GEORGALOS]))
    .map(r => r['QUERY PLAN']).join('\n')
  nota(plan.includes('Seq Scan on misiones')
    ? 'el plan todavía hace Seq Scan on misiones (normal con tan pocas filas)'
    : 'el plan ya usa índice sobre misiones')

  // ── Los números congelados ─────────────────────────────────────────────────
  console.log('\n▸ Los números congelados del piloto')
  const gTot = await totalesDe(GEORGALOS)
  caso('la serie de Georgalos, entera', gTot, ESPERADO.Georgalos)
  caso('la serie de Suprante, entera',  await totalesDe(SUPRANTE), ESPERADO.Suprante)
  caso('visitas de Georgalos por mes',
    (await todas(`SELECT mes, pdv_visitados::int AS pdv, misiones::int AS misiones
                    FROM public.panel_marca_visitas($1) ORDER BY mes`, [GEORGALOS])),
    ESPERADO.visitas)

  console.log('\n▸ La observación es la MISIÓN, no la fila')
  // El piloto son 2 fotos por misión. Si esto dijera 112 el porcentaje saldría
  // igual y el error solo se vería en la base de cálculo.
  const marzo = gTot.find(r => r.mes === '2026-03' && r.slug === 'presencia')
  caso('marzo son 56 observaciones y no 112', marzo?.obs, 56)
  caso('CONTROL — y son 112 fotos las que las producen',
    (await uno(`SELECT count(*)::int n FROM fotos f
                  JOIN misiones mi ON mi.id = f.mision_id
                  JOIN campanas c  ON c.id = mi.campana_id
                 WHERE c.marca_id = $1 AND f.declaracion IS NOT NULL`, [GEORGALOS])).n, 112)
  caso('45 presentes de 56', [marzo?.si, marzo?.obs], [45, 56])

  // ── EL ANCLA ───────────────────────────────────────────────────────────────
  console.log('\n▸ EL ANCLA es capturada_at — el control que se rompe si alguien lo cambia')
  await enSandbox(async () => {
    const { id: misionId } = await uno(`
      SELECT mi.id FROM misiones mi
        JOIN fotos f ON f.mision_id = mi.id AND f.declaracion IS NOT NULL
        JOIN campanas c ON c.id = mi.campana_id
       WHERE c.marca_id = $1 LIMIT 1`, [GEORGALOS])

    // Se mueve SOLO capturada_at. created_at queda donde estaba, así que si el
    // ancla fuera esa, nada de lo de abajo se movería.
    const antes = await uno(`SELECT created_at FROM misiones WHERE id = $1`, [misionId])
    await c.query(`UPDATE misiones SET capturada_at = '2026-07-15T12:00:00Z' WHERE id = $1`, [misionId])
    caso('CONTROL — created_at NO se tocó',
      (await uno(`SELECT created_at FROM misiones WHERE id = $1`, [misionId])).created_at.toISOString(),
      antes.created_at.toISOString())

    const t = await totalesDe(GEORGALOS)
    caso('marzo pierde esa observación',
      t.find(r => r.mes === '2026-03' && r.slug === 'presencia')?.obs, 55)
    caso('y aparece en julio, que antes no existía',
      t.find(r => r.mes === '2026-07' && r.slug === 'presencia')?.obs, 1)
    caso('las visitas la siguen al mismo mes',
      (await todas(`SELECT mes FROM public.panel_marca_visitas($1)`, [GEORGALOS]))
        .map(r => r.mes).includes('2026-07'), true)
  })
  caso('y el sandbox revirtió: marzo volvió a 56',
    (await totalesDe(GEORGALOS)).find(r => r.mes === '2026-03')?.obs, 56)

  // ── Qué misiones cuentan ───────────────────────────────────────────────────
  console.log('\n▸ Una misión descartada deja de ser una observación')
  await enSandbox(async () => {
    await c.query(`
      UPDATE misiones SET estado = 'descartada' WHERE id = (
        SELECT mi.id FROM misiones mi
          JOIN fotos f ON f.mision_id = mi.id AND f.declaracion IS NOT NULL
          JOIN campanas c ON c.id = mi.campana_id
         WHERE c.marca_id = $1 LIMIT 1)`, [GEORGALOS])
    const t = await totalesDe(GEORGALOS)
    caso('marzo baja a 55', t.find(r => r.mes === '2026-03')?.obs, 55)
    caso('y su PDV también sale de la base', t.find(r => r.mes === '2026-03')?.pdv, 55)
  })

  // ── El GROUPING SETS ───────────────────────────────────────────────────────
  console.log('\n▸ Los dos granos')
  const filas = await todas(`SELECT * FROM public.panel_marca_series($1)`, [GEORGALOS])
  const totales   = filas.filter(f => f.campana_id === null)
  const desgloses = filas.filter(f => f.campana_id !== null)
  caso('hay filas de total', totales.length > 0, true)
  caso('hay filas de desglose', desgloses.length > 0, true)
  caso('la fila de total no trae fuente (es la suma de todas)',
    totales.every(t => t.fuente === null), true)
  caso('toda fila de desglose trae fuente',
    desgloses.every(d => d.fuente !== null), true)
  caso('ningún desglose supera a su total',
    desgloses.every(d => {
      const t = totales.find(x => x.mes === d.mes && x.metrica_slug === d.metrica_slug)
      return t && Number(d.observaciones) <= Number(t.observaciones)
                && Number(d.base_pdv)     <= Number(t.base_pdv)
    }), true)

  console.log('\n▸ base_pdv NO se puede sumar (por eso el rollup es de SQL)')
  // Un comercio visitado por dos campañas el mismo mes cuenta UNA vez en el
  // total y una vez en cada desglose. Sumar desgloses daría de más.
  const sumaDesgloses = new Map()
  for (const d of desgloses) {
    const k = `${d.mes}|${d.metrica_slug}`
    sumaDesgloses.set(k, (sumaDesgloses.get(k) ?? 0) + Number(d.base_pdv))
  }
  caso('el total nunca es mayor que la suma de sus partes',
    totales.every(t => Number(t.base_pdv) <= sumaDesgloses.get(`${t.mes}|${t.metrica_slug}`)), true)

  // ── Aislamiento ────────────────────────────────────────────────────────────
  console.log('\n▸ Aislamiento entre marcas')
  const campanasDeGeorgalos = new Set(
    (await todas(`SELECT id FROM campanas WHERE marca_id = $1`, [GEORGALOS])).map(r => r.id))
  const ajenas = (await todas(`SELECT campana_id FROM public.panel_marca_series($1)`, [ACME]))
    .filter(r => r.campana_id && campanasDeGeorgalos.has(r.campana_id))
  caso('la serie de ACME no trae ninguna campaña de Georgalos', ajenas.length, 0)
  caso('una marca que no existe devuelve vacío, no todo',
    (await todas(`SELECT 1 FROM public.panel_marca_series('00000000-0000-0000-0000-000000000000')`)).length, 0)

  // ── Permisos ───────────────────────────────────────────────────────────────
  console.log('\n▸ Permisos')
  for (const fn of ['panel_marca_series', 'panel_marca_visitas']) {
    const p = await uno(`
      SELECT has_function_privilege('service_role',  'public.${fn}(uuid)', 'EXECUTE') AS srv,
             has_function_privilege('authenticated', 'public.${fn}(uuid)', 'EXECUTE') AS auth,
             has_function_privilege('anon',          'public.${fn}(uuid)', 'EXECUTE') AS anon,
             (SELECT prosecdef FROM pg_proc WHERE oid = 'public.${fn}(uuid)'::regprocedure) AS definer`)
    caso(`${fn}: service_role sí, authenticated no, anon no`,
      { srv: p.srv, auth: p.auth, anon: p.anon }, { srv: true, auth: false, anon: false })
    caso(`${fn}: SECURITY INVOKER, no DEFINER`, p.definer, false)
  }

  // ── El guard del jsonb ─────────────────────────────────────────────────────
  console.log('\n▸ Un valor del tipo equivocado no voltea la función')
  await enSandbox(async () => {
    // Si en esta base las respuestas numéricas no cuelgan de ninguna marca, se
    // le engancha una adentro del sandbox para que el control corra igual.
    const fila = await uno(`
      SELECT r.id, c.id AS campana_id, c.marca_id
        FROM mision_respuestas r
        JOIN bloque_campos bc ON bc.id = r.campo_id
        JOIN metricas      m  ON m.id  = bc.metrica_id AND m.tipo_respuesta = 'numero'
        JOIN misiones      mi ON mi.id = r.mision_id
        JOIN campanas      c  ON c.id  = mi.campana_id
       WHERE r.reemplazada_por IS NULL
       LIMIT 1`)
    if (!fila) { nota('no hay ninguna respuesta numérica en esta base: el control no corre'); return }

    let marca = fila.marca_id
    if (!marca) {
      marca = GEORGALOS
      await c.query(`UPDATE campanas SET marca_id = $1 WHERE id = $2`, [marca, fila.campana_id])
      nota('(la campaña no tenía marca: se le enganchó una dentro del sandbox)')
    }

    const antes = await totalesDe(marca)
    await c.query(`UPDATE mision_respuestas SET valor = '"catorce mil"'::jsonb WHERE id = $1`, [fila.id])

    let despues
    try { despues = await totalesDe(marca) }
    catch (e) { fallos++; console.log(`   ✗  la función explotó con un valor de texto: ${e.message}`); return }

    const k = (r) => `${r.mes}|${r.slug}`
    const antesMap   = new Map(antes.map(r => [k(r), r]))
    const despuesMap = new Map(despues.map(r => [k(r), r]))
    const movidas = [...despuesMap.values()].filter(d => {
      const a = antesMap.get(k(d))
      return a && (a.obs !== d.obs || a.con_valor !== d.con_valor)
    })
    caso('la función no explota', true, true)
    caso('alguna fila cambió (si no, el control no probó nada)', movidas.length > 0, true)
    caso('la observación sigue contando, pero sin valor',
      movidas.every(d => d.obs === antesMap.get(k(d)).obs
                      && d.con_valor === antesMap.get(k(d)).con_valor - 1), true)
  })

  // ── Respuestas reemplazadas ────────────────────────────────────────────────
  console.log('\n▸ Una respuesta reemplazada no se cuenta dos veces')
  const reemplazadas = (await uno(
    `SELECT count(*)::int n FROM mision_respuestas WHERE reemplazada_por IS NOT NULL`)).n
  nota(`${reemplazadas} respuesta(s) reemplazada(s) en esta base`)
  await enSandbox(async () => {
    const fila = await uno(`
      SELECT r.id, mi.campana_id, c.marca_id
        FROM mision_respuestas r
        JOIN bloque_campos bc ON bc.id = r.campo_id AND bc.metrica_id IS NOT NULL
        JOIN misiones      mi ON mi.id = r.mision_id
        JOIN campanas      c  ON c.id  = mi.campana_id
       WHERE r.reemplazada_por IS NULL AND c.marca_id IS NOT NULL
       LIMIT 1`)
    if (!fila) { nota('ninguna respuesta tipificada cuelga de una marca en esta base: no corre'); return }
    const antes = await totalesDe(fila.marca_id)
    await c.query(`UPDATE mision_respuestas SET reemplazada_por = id WHERE id = $1`, [fila.id])
    const despues = await totalesDe(fila.marca_id)
    const totalObs = (rs) => rs.reduce((s, r) => s + r.obs, 0)
    caso('al marcarla reemplazada, la serie pierde una observación',
      totalObs(antes) - totalObs(despues), 1)
  })

} finally {
  await c.query('ROLLBACK')
  console.log(`\n(ROLLBACK — ${nombreDeRef(ref)} quedó exactamente como estaba)`)
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
