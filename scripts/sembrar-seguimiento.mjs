#!/usr/bin/env node
/**
 * scripts/sembrar-seguimiento.mjs
 * Siembra una campaña de seguimiento con TRES semanas de visitas, para poder
 * verificar el dashboard de cobertura.
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 * Al 21/9/2026 producción **no tiene ninguna campaña de seguimiento**, y las
 * tres de dev suman 8 misiones que caen TODAS en la misma semana. Con eso no se
 * ejercita ni el prorrateo, ni el atraso, ni la frontera entre semanas: el
 * dashboard se vería verde y no probaría nada.
 *
 * Los comercios quedan repartidos a propósito en los tres estados, y hay una
 * visita puesta el domingo a las 22:00 hora argentina — que en UTC ya es lunes.
 * Ésa es la que falla si alguien se olvida de la zona horaria.
 *
 *   node scripts/sembrar-seguimiento.mjs --ref <project-ref>
 *   node scripts/sembrar-seguimiento.mjs --ref <project-ref> --limpiar
 *
 * NO corre contra producción: la campaña se llama "[TEST]" y no tiene por qué
 * existir ahí. La guarda es explícita más abajo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const { Client } = createRequire(import.meta.url)('pg')

const REF_PROD = 'xzznzustgsacmfwsupux'
const NOMBRE   = '[TEST] Reposición semanal — cobertura'

const ref     = arg('--ref')
const limpiar = process.argv.includes('--limpiar')

function arg(n) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null }

if (!ref) { console.error('Falta --ref <project-ref>.'); process.exit(2) }
if (ref === REF_PROD) {
  console.error('Este script NO corre contra producción: siembra datos de prueba.')
  process.exit(2)
}

function pgurl(ref) {
  for (const f of fs.readdirSync(process.cwd()).filter(f => /^\.env.*\.local$/.test(f))) {
    const m = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
      .match(/^PGURL\s*=\s*"?([^"\r\n]+)"?/m)
    if (m && m[1].includes(ref)) return m[1].trim()
  }
  throw new Error(`No encontré un PGURL con el ref ${ref}`)
}

/** El lunes de la semana argentina de hoy, como 'YYYY-MM-DD'. */
function lunesDeEstaSemana() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const hoy = fmt.format(new Date())
  const d = new Date(`${hoy}T12:00:00Z`)
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (dow - 1))
  return fmt.format(d)
}

/** Un instante UTC a partir de un día AR y una hora AR. */
function instante(dia, horaAR) {
  const base = new Date(`${dia}T00:00:00Z`)
  return new Date(base.getTime() + (horaAR + 3) * 3600_000).toISOString()
}

/**
 * Un instante de la SEMANA EN CURSO, `horas` antes de ahora y nunca antes del
 * lunes.
 *
 * ── POR QUÉ NO SE USA UN DÍA FIJO ───────────────────────────────────────────
 * La primera versión sembraba "lunes + 1" y "lunes + 2". Corrido un LUNES eso
 * cae en el futuro: la cabecera decía "4 de 8" contando visitas que todavía no
 * habían pasado. El cálculo ahora ignora las futuras, así que esas misiones
 * simplemente no contaban — o sea que el caso de prueba no probaba nada.
 *
 * El tope contra el lunes importa: un lunes a la mañana no se puede repartir
 * dos visitas en días distintos de esta semana porque no hubo días distintos.
 * Ahí caen las dos hoy, a horas distintas, que es lo único honesto.
 */
function enEstaSemana(lunes, horas) {
  const tentativo = Date.now() - horas * 3600_000
  const inicioSemana = new Date(`${lunes}T03:00:00Z`).getTime()   // 00:00 AR
  // Un margen de una hora para que nunca quede exactamente en el borde.
  return new Date(Math.max(tentativo, inicioSemana + 3600_000)).toISOString()
}

function sumarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const c = new Client({ connectionString: pgurl(ref), ssl: { rejectUnauthorized: false } })
  await c.connect()

  if (limpiar) {
    const { rows } = await c.query(`SELECT id FROM campanas WHERE nombre = $1`, [NOMBRE])
    for (const r of rows) {
      await c.query(`DELETE FROM misiones WHERE campana_id = $1`, [r.id])
      await c.query(`DELETE FROM participaciones WHERE campana_id = $1`, [r.id])
      await c.query(`DELETE FROM bloques_foto WHERE campana_id = $1`, [r.id])
      await c.query(`DELETE FROM campanas WHERE id = $1`, [r.id])
    }
    console.log(`Limpiadas ${rows.length} campañas "${NOMBRE}".`)
    await c.end()
    return
  }

  const yaExiste = await c.query(`SELECT id FROM campanas WHERE nombre = $1`, [NOMBRE])
  if (yaExiste.rows.length > 0) {
    console.log('Ya existe. Corré con --limpiar primero si querés rehacerla.')
    await c.end()
    return
  }

  // ── Insumos: una distri, sus gondoleros y comercios que ya existen ─────────
  const { rows: [distri] } = await c.query(
    `SELECT id, razon_social FROM distribuidoras WHERE razon_social LIKE 'Biomega%' LIMIT 1`)
  if (!distri) throw new Error('No hay distribuidora Biomega en esta base.')

  const { rows: gonds } = await c.query(`
    SELECT p.id, p.alias FROM profiles p
    JOIN gondolero_distri_solicitudes s ON s.gondolero_id = p.id AND s.estado = 'aprobada'
    WHERE p.tipo_actor = 'gondolero' AND s.distri_id = $1 ORDER BY p.alias LIMIT 2`, [distri.id])
  if (gonds.length < 2) throw new Error('Hacen falta al menos 2 gondoleros vinculados a Biomega.')

  const { rows: comercios } = await c.query(
    `SELECT id, nombre FROM comercios WHERE estado IS DISTINCT FROM 'rechazado' ORDER BY nombre LIMIT 5`)
  if (comercios.length < 5) throw new Error('Hacen falta al menos 5 comercios.')

  const lunes       = lunesDeEstaSemana()
  const lunesPasada = sumarDias(lunes, -7)
  const lunesAnterior = sumarDias(lunes, -14)
  const FRECUENCIA  = 2

  // ── La campaña ────────────────────────────────────────────────────────────
  const { rows: [campana] } = await c.query(`
    INSERT INTO campanas (nombre, tipo, distri_id, financiada_por, via_ejecucion, estado,
                          modalidad, visitas_por_semana, fecha_inicio,
                          puntos_por_mision, min_comercios_para_cobrar, max_comercios_por_gondolero,
                          instruccion, actor_campana)
    VALUES ($1,'relevamiento',$2,'distri','distribuidora','activa','seguimiento',$3,$4,
            50, 1, 20, 'Campaña de prueba del dashboard de cobertura.', 'gondolero')
    RETURNING id`, [NOMBRE, distri.id, FRECUENCIA, lunesAnterior])

  for (const g of gonds) {
    await c.query(`INSERT INTO participaciones (campana_id, gondolero_id, estado) VALUES ($1,$2,'activa')`,
      [campana.id, g.id])
  }

  // ── Las visitas, repartidas para dar los tres estados ─────────────────────
  // Frecuencia 2. Lo esperado depende del día en que se corra esto, así que los
  // comercios se siembran con 0, 1, 2 y 3 visitas de ESTA semana: siempre hay
  // uno de cada lado del prorrateo.
  // Las visitas. Las de ESTA semana van como horas antes de ahora, nunca en el
  // futuro; las de semanas pasadas, como día + hora fijos.
  const visitas = [
    // c0 — AL DÍA: cumplió la semana (2 visitas, las dos ya ocurridas)
    [comercios[0], gonds[0], enEstaSemana(lunes, 26)],
    [comercios[0], gonds[0], enEstaSemana(lunes, 3)],
    // c1 — DOS GONDOLEROS distintos en el mismo comercio. Para cada uno tiene
    //      que decir "Cubierto" a secas: los dos participaron, no hay nada que
    //      explicar. El aviso "lo visitó otro" es solo para quien NO fue.
    [comercios[1], gonds[1], enEstaSemana(lunes, 20)],
    [comercios[1], gonds[0], enEstaSemana(lunes, 5)],
    // c2 — ATRASADO: nada esta semana, última la semana pasada
    [comercios[2], gonds[0], instante(sumarDias(lunesPasada, 3), 12)],
    // c3 — LA FRONTERA: domingo de la semana pasada a las 22:00 AR.
    //      En UTC eso ya es lunes de ESTA semana. Si el cálculo no usa la zona
    //      horaria, esta visita se cuenta en la semana equivocada.
    [comercios[3], gonds[1], instante(sumarDias(lunesPasada, 6), 22)],
    // c4 — EL AVISO "lo visitó otro". Es comercio de gonds[0] porque lo visitó
    //      hace dos semanas, pero esta semana solo fue gonds[1]. Para gonds[0]
    //      tiene que decir "Cubierto · lo visitó otro gondolero": no lo tocó y
    //      sin esa frase parecería que el sistema le perdió la visita.
    //      Para gonds[1] dice "Cubierto" a secas — él fue.
    [comercios[4], gonds[0], instante(sumarDias(lunesAnterior, 2), 14)],
    [comercios[4], gonds[1], enEstaSemana(lunes, 30)],
    [comercios[4], gonds[1], enEstaSemana(lunes, 4)],
  ]

  for (const [com, g, at] of visitas) {
    await c.query(`
      INSERT INTO misiones (campana_id, comercio_id, gondolero_id, estado, puntos_total,
                            bounty_estado, capturada_at, created_at)
      VALUES ($1,$2,$3,'aprobada',50,'acreditado',$4,$4)`,
      [campana.id, com.id, g.id, at])
  }

  // Una descartada, que NO tiene que contar.
  await c.query(`
    INSERT INTO misiones (campana_id, comercio_id, gondolero_id, estado, puntos_total,
                          bounty_estado, capturada_at, created_at)
    VALUES ($1,$2,$3,'descartada',50,'anulado',$4,$4)`,
    [campana.id, comercios[2].id, gonds[0].id, enEstaSemana(lunes, 8)])

  // ── Recalcular los derivados, como hace el seed principal ─────────────────
  //
  // Insertar misiones a mano deja `campanas.comercios_relevados` y
  // `participaciones.comercios_completados` en el valor con el que nacieron, o
  // sea cero. La app los recalcula en cada escritura real
  // (lib/comercios-relevados.ts); un seed que escribe por SQL se saltea ese
  // camino y deja el detalle de la campaña diciendo "0 comercios" con cinco
  // sembrados.
  //
  // Es el mismo estado derivado que CLAUDE.md marca para borrar. Mientras
  // exista, un seed que no lo actualice siembra un dato falso.
  await c.query(`
    UPDATE campanas SET comercios_relevados = (
      SELECT count(DISTINCT m.comercio_id) FROM misiones m
      WHERE m.campana_id = $1 AND m.estado IS DISTINCT FROM 'descartada'
    ) WHERE id = $1`, [campana.id])

  // El de la participación cuenta APROBADAS, que es otro número: es el que se
  // compara contra min_comercios_para_cobrar. Ver "TOMADOS y APROBADOS".
  await c.query(`
    UPDATE participaciones p SET comercios_completados = (
      SELECT count(DISTINCT m.comercio_id) FROM misiones m
      WHERE m.campana_id = p.campana_id AND m.gondolero_id = p.gondolero_id
        AND m.estado = 'aprobada'
    ) WHERE p.campana_id = $1`, [campana.id])

  console.log(`\nSembrada "${NOMBRE}" en ${distri.razon_social}`)
  console.log(`  frecuencia ${FRECUENCIA} por semana · arrancó el ${lunesAnterior}`)
  console.log(`  semana en curso: ${lunes}\n`)
  console.log('  comercio                  visitas esta semana   nota')
  console.log(`  ${comercios[0].nombre.padEnd(25)} 2                     al día`)
  console.log(`  ${comercios[1].nombre.padEnd(25)} 2 (de DOS gondoleros) los dos ven "Cubierto" a secas`)
  console.log(`  ${comercios[2].nombre.padEnd(25)} 0 (+1 descartada)     atrasado; la descartada no cuenta`)
  console.log(`  ${comercios[3].nombre.padEnd(25)} 0                     visita del domingo 22:00 AR — la frontera`)
  console.log(`  ${comercios[4].nombre.padEnd(25)} 2 (solo del OTRO)     el aviso "lo visitó otro gondolero"`)
  console.log('\n  La de la frontera es la que importa: en UTC cae el lunes de esta')
  console.log('  semana. Si el dashboard la cuenta como de ESTA semana, la zona')
  console.log('  horaria no está aplicada.\n')

  await c.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
