/**
 * scripts/sembrar-cobertura-mapa.mts
 * Siembra una campaña de seguimiento con los TRES estados de cobertura vivos
 * al mismo tiempo, para poder mirar el mapa pintando cobertura.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/sembrar-cobertura-mapa.mts --ref <ref>
 *   … --limpiar
 *
 * ── POR QUÉ NO ALCANZA CON `sembrar-seguimiento.mjs` ────────────────────────
 * Ese sembró el fixture del dashboard de cobertura y su intención era dar los
 * tres estados —tiene un comercio comentado como "ATRASADO"—, pero **no los da
 * casi nunca**. Medido el jueves 24/9/2026 con `calcularCobertura`:
 *
 *     [TEST] Reposición semanal — cobertura (2/sem)   al_dia 3 · va_bien 2 · atrasado 0
 *     Seguimiento TEST 2V/Semana            (2/sem)   al_dia 0 · va_bien 3 · atrasado 0
 *
 * No es un error del sembrador: es el prorrateo funcionando. `atrasado` exige
 * `visitas < esperadas`, y `esperadas = floor(frecuencia × días_completos / 7)`
 * vale CERO con frecuencia 2 de lunes a jueves. Con cero esperadas nadie puede
 * estar atrasado, que es justamente lo que el prorrateo vino a evitar.
 *
 * ── LA CONSECUENCIA PARA EL MAPA, QUE ES LO QUE ESTO ARREGLA ────────────────
 * El anillo partido en tres es la pieza que impide que la minoría desaparezca:
 * un grupo con un solo comercio atrasado entre ocho tiene que dejar ver ese
 * atrasado. Si el tercer estado no existe en ningún dato, **ese tramo del
 * gradiente no se dibuja nunca** y nadie puede mirarlo — el mismo hueco que el
 * tramo del mapa ya documentó para el anillo tricolor de presencia.
 *
 * ── EL LUNES NO SE PUEDE, Y NO ES DEL FIXTURE ───────────────────────────────
 * El lunes los días completos son 0, así que `esperadas` es 0 para CUALQUIER
 * frecuencia y `atrasado` es inalcanzable. Con frecuencia 7 —una reposición
 * diaria, que es un caso real en una cadena— los tres estados conviven de
 * martes a domingo. El script lo dice cuando no puede.
 *
 * ── LAS CUENTAS SE DERIVAN AL CORRER, NO SE HARDCODEAN ──────────────────────
 * Cuántas visitas hace falta sembrar para cada estado depende del día en que se
 * corra. Se calcula con `visitasEsperadas` de `lib/fecha-ar.ts` —la MISMA que
 * usa el dashboard— y al final se verifica con `calcularCobertura`, que es la
 * misma que va a usar el mapa. Un sembrador que afirma tres estados sin
 * comprobarlos es la promesa que este fixture vino a reemplazar.
 */
import { createRequire } from 'node:module'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { visitasEsperadas, semanaDe, sumarDias, diaDeLaSemanaAR } from '../lib/fecha-ar'
import { calcularCobertura, type VisitaMision } from '../lib/cobertura-seguimiento'
import { agruparEnMapa, repartoDe, type PuntoMapa } from '../lib/mapa-pdv'

const { Client } = createRequire(import.meta.url)('pg')

const NOMBRE = '[TEST] Reposición diaria — mapa de cobertura'
/** Diaria. Es la frecuencia más baja con la que `atrasado` existe un martes. */
const FRECUENCIA = 7

const limpiar = process.argv.includes('--limpiar')
const ref = (() => { const i = process.argv.indexOf('--ref'); return i >= 0 ? process.argv[i + 1] : null })()

if (!ref) {
  console.error('\n✗ Falta --ref <project-ref>. Es obligatorio y no tiene default.\n')
  process.exit(2)
}
if (nombreDeRef(ref) !== 'dev') {
  console.error(
    `\n✗ "${ref}" es ${nombreDeRef(ref) === 'DESCONOCIDO' ? 'un proyecto no reconocido (se trata como PRODUCCIÓN)' : 'PRODUCCIÓN'}.` +
    '\n  Este script siembra datos de prueba y no corre ahí. No hay flag que lo habilite.\n')
  process.exit(2)
}

const cred = credencialesDeRef(ref) as { vars: Record<string, string>; archivo: string }
if (!cred?.vars.PGURL) { console.error(`\n✗ Sin PGURL para ${ref}\n`); process.exit(2) }

const c = new Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

// ─────────────────────────────────────────────────────────────────────────────

if (limpiar) {
  const { rows } = await c.query(`SELECT id FROM campanas WHERE nombre = $1`, [NOMBRE])
  let misiones = 0
  for (const r of rows) {
    const { rowCount } = await c.query(`DELETE FROM misiones WHERE campana_id = $1`, [r.id])
    misiones += rowCount ?? 0
    await c.query(`DELETE FROM participaciones WHERE campana_id = $1`, [r.id])
    await c.query(`DELETE FROM campanas WHERE id = $1`, [r.id])
  }
  console.log(`\n▸ Limpiado\n   campañas ${rows.length}\n   misiones ${misiones}\n`)
  await c.end()
  process.exit(0)
}

const { rows: yaEsta } = await c.query(`SELECT id FROM campanas WHERE nombre = $1`, [NOMBRE])
if (yaEsta.length > 0) {
  console.log('\n⊘ Ya existe. Corré con --limpiar primero si querés rehacerla.\n')
  await c.end()
  process.exit(0)
}

// ── Insumos: no se inventa ningún actor ──────────────────────────────────────
const { rows: [distri] } = await c.query(
  `SELECT id, razon_social FROM distribuidoras WHERE razon_social LIKE 'Biomega%' LIMIT 1`)
if (!distri) throw new Error('No hay distribuidora Biomega en esta base.')

const { rows: [marca] } = await c.query(
  `SELECT id, razon_social FROM marcas WHERE razon_social LIKE 'Georgalos%' LIMIT 1`)
if (!marca) throw new Error('No hay marca Georgalos en esta base.')

const { rows: gonds } = await c.query(`
  SELECT p.id, p.nombre FROM profiles p
  JOIN gondolero_distri_solicitudes s ON s.gondolero_id = p.id AND s.estado = 'aprobada'
  WHERE p.tipo_actor = 'gondolero' AND s.distri_id = $1 ORDER BY p.alias LIMIT 2`, [distri.id])
if (gonds.length < 2) throw new Error('Hacen falta al menos 2 gondoleros vinculados a Biomega.')

// ── LOS COMERCIOS TIENEN QUE ESTAR JUNTOS ────────────────────────────────────
// La primera versión los tomaba por nombre y los tres estados quedaban
// repartidos en DOS racimos geográficos distintos. Resultado, verificado con
// `ver-mapa-cobertura.mts`: los tres estados salían en la referencia y **ningún
// grupo era tricolor a ningún zoom**, o sea que el anillo partido en tres
// —la pieza entera de este fixture— seguía sin poder mirarse.
//
// Se elige el racimo más denso: comercios a menos de ~100 m, que se agrupan en
// el mapa hasta el zoom máximo. Ahí adentro van los tres estados.
const { rows: [racimo] } = await c.query(`
  SELECT array_agg(id ORDER BY nombre) AS ids, count(*)::int AS n
    FROM comercios
   WHERE lat IS NOT NULL AND lng IS NOT NULL AND estado IS DISTINCT FROM 'rechazado'
   GROUP BY round(lat::numeric, 3), round(lng::numeric, 3)
  HAVING count(*) >= 4
   ORDER BY count(*) DESC LIMIT 1`)
if (!racimo) throw new Error('No hay ningún racimo de 4 comercios cercanos con coordenadas.')

// Y uno más lejos, para que el mapa no sea un solo pin: así se ve un grupo con
// anillo Y un punto suelto de color liso.
// Dos consultas y no un UNION: en Postgres el `LIMIT` de un UNION se aplica al
// resultado ENTERO, así que la primera versión traía una sola fila en total.
const delRacimo = racimo.ids.slice(0, 4) as string[]
const { rows: enRacimo } = await c.query(
  `SELECT id, nombre FROM comercios WHERE id = ANY($1) ORDER BY nombre`, [delRacimo])
const { rows: [lejano] } = await c.query(`
  SELECT id, nombre FROM comercios
   WHERE lat IS NOT NULL AND lng IS NOT NULL AND estado IS DISTINCT FROM 'rechazado'
     AND NOT (id = ANY($1))
   ORDER BY nombre LIMIT 1`, [delRacimo])

const comercios = [...enRacimo, ...(lejano ? [lejano] : [])]
if (comercios.length < 5) throw new Error('Hacen falta 5 comercios con coordenadas.')

// ── Cuántas visitas necesita cada estado HOY ─────────────────────────────────
const ahora = new Date()
const semana = semanaDe(ahora)
const esperadas = visitasEsperadas({ visitasPorSemana: FRECUENCIA, ahora })
const completos = diaDeLaSemanaAR(ahora) - 1

// atrasado exige visitas < esperadas. Con esperadas = 0 no hay número que
// sirva: el lunes el estado no existe, para ninguna frecuencia.
const hayAtrasado = esperadas >= 1

/**
 * Cuántas visitas de ESTA semana se le siembran a cada comercio.
 *
 * Los CUATRO PRIMEROS son el racimo, y ahí adentro van los tres estados: es lo
 * que hace que exista un grupo tricolor. El quinto está lejos y queda de punto
 * suelto, para que también se vea un color liso.
 */
const plan: [typeof comercios[number], number, string][] = [
  [comercios[0], FRECUENCIA,                 'al_dia'],
  [comercios[1], esperadas,                  esperadas >= FRECUENCIA ? 'al_dia' : 'va_bien'],
  [comercios[2], Math.max(0, esperadas - 1), hayAtrasado ? 'atrasado' : 'va_bien'],
  [comercios[3], 0,                          hayAtrasado ? 'atrasado' : 'va_bien'],
  [comercios[4], FRECUENCIA,                 'al_dia'],
]

// ── La campaña ───────────────────────────────────────────────────────────────
// Sin `fecha_fin`: lo exige el CHECK campanas_fecha_fin_por_modalidad para
// seguimiento. Arranca la semana pasada para que el prorrateo no se recorte por
// `desde` — si la campaña empezara hoy, lo esperado sería cero.
const { rows: [campana] } = await c.query(`
  INSERT INTO campanas (nombre, tipo, marca_id, distri_id, financiada_por, via_ejecucion,
                        estado, modalidad, visitas_por_semana, fecha_inicio,
                        puntos_por_mision, min_comercios_para_cobrar, max_comercios_por_gondolero,
                        instruccion, actor_campana)
  VALUES ($1,'relevamiento',$2,$3,'marca','distribuidora','activa','seguimiento',$4,$5,
          40, 1, 20, 'Reposición diaria. Campaña de prueba del mapa de cobertura.', 'gondolero')
  RETURNING id`, [NOMBRE, marca.id, distri.id, FRECUENCIA, sumarDias(semana.lunes, -7)])

for (const g of gonds) {
  await c.query(
    `INSERT INTO participaciones (campana_id, gondolero_id, estado) VALUES ($1,$2,'activa')`,
    [campana.id, g.id])
}

/** Un instante de un día ya transcurrido de esta semana, a las 10 AR. */
function cuando(i: number): string {
  // Las visitas se reparten entre el lunes y HOY, nunca en el futuro: una
  // visita adelantada haría que el dashboard cuente trabajo que no pasó.
  const dia = sumarDias(semana.lunes, completos === 0 ? 0 : i % (completos + 1))
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + 13 * 3600_000).toISOString()
}

let n = 0
for (const [com, visitas] of plan) {
  for (let i = 0; i < visitas; i++) {
    const at = cuando(i)
    await c.query(`
      INSERT INTO misiones (campana_id, comercio_id, gondolero_id, estado, puntos_total,
                            bounty_estado, capturada_at, created_at)
      VALUES ($1,$2,$3,'aprobada',40,'acreditado',$4,$4)`,
      [campana.id, com.id, gonds[i % 2].id, at])
    n++
  }
  // Una visita de la semana pasada para todos, así `ultima visita` y
  // `diasSinVisita` tienen algo que decir incluso en los que hoy van en cero.
  const laPasada = new Date(
    new Date(`${sumarDias(semana.lunes, -4)}T00:00:00Z`).getTime() + 13 * 3600_000).toISOString()
  await c.query(`
    INSERT INTO misiones (campana_id, comercio_id, gondolero_id, estado, puntos_total,
                          bounty_estado, capturada_at, created_at)
    VALUES ($1,$2,$3,'aprobada',40,'acreditado',$4,$4)`,
    [campana.id, com.id, gonds[0].id, laPasada])
  n++
}

// ── VERIFICAR, no afirmar ────────────────────────────────────────────────────
// Con la misma función que va a usar el mapa. Un sembrador que dice "tres
// estados" sin comprobarlo es exactamente la promesa que este vino a reemplazar.
// Las coordenadas, para poder agrupar acá lo mismo que agrupa el mapa.
const { rows: coords } = await c.query(
  `SELECT id, lat, lng FROM comercios WHERE id = ANY($1)`, [comercios.map(x => x.id)])
const porId = new Map<string, { lat: number; lng: number }>(
  coords.map((x: { id: string; lat: number; lng: number }) => [x.id, { lat: x.lat, lng: x.lng }]))

const { rows: mis } = await c.query(
  `SELECT comercio_id, gondolero_id, estado, capturada_at, created_at
     FROM misiones WHERE campana_id = $1`, [campana.id])

const cob = calcularCobertura({
  misiones: mis as VisitaMision[],
  nombresComercio: new Map(comercios.map(x => [x.id, x.nombre])),
  visitasPorSemana: FRECUENCIA,
  fechaInicio: sumarDias(semana.lunes, -7),
})

const cuenta = { al_dia: 0, va_bien: 0, atrasado: 0 }
for (const x of cob.comercios) cuenta[x.estado]++

console.log(`
▸ Sembrado

   campaña     ${NOMBRE}
   alcance     ${distri.razon_social} ejecutando para ${marca.razon_social}
   frecuencia  ${FRECUENCIA} visitas por semana
   semana      ${semana.lunes} → ${semana.domingo} · ${completos} días completos · ${esperadas} esperadas
   misiones    ${n}

▸ Los tres estados, calculados con calcularCobertura`)
for (const x of cob.comercios) {
  console.log(`      ${x.estado.padEnd(9)} ${String(x.visitas).padStart(2)}/${FRECUENCIA}  ${x.nombre}`)
}
console.log(`\n   al_dia ${cuenta.al_dia} · va_bien ${cuenta.va_bien} · atrasado ${cuenta.atrasado}`)

if (!hayAtrasado) {
  console.log(`
   ⚠ HOY ES LUNES: 0 días completos, así que lo esperado es 0 y NINGÚN comercio
     puede estar atrasado — para ninguna frecuencia. No es el fixture: es el
     prorrateo, que existe para no marcar en rojo al que todavía tiene la semana
     por delante. El anillo tricolor no se puede mirar hoy; volvé mañana.`)
} else if (cuenta.al_dia > 0 && cuenta.va_bien > 0 && cuenta.atrasado > 0) {
  // ── Y QUE ADEMÁS CAIGAN EN EL MISMO GRUPO ─────────────────────────────────
  // Que los tres estados existan no alcanza: el anillo es de un GRUPO, y si
  // quedan repartidos en racimos distintos cada marker sale de un color liso.
  // Fue exactamente lo que pasó con la primera versión de este fixture, y solo
  // se vio corriendo `ver-mapa-cobertura.mts` — ni el typecheck ni los conteos
  // de arriba lo delataban.
  const puntos: PuntoMapa[] = cob.comercios.map(x => ({
    id: x.comercioId,
    nombre: x.nombre,
    lat: Number(porId.get(x.comercioId)?.lat),
    lng: Number(porId.get(x.comercioId)?.lng),
    presente: null,
    tipo: null,
    cobertura: x.estado,
  }))
  const zoomsConAnillo = [8, 11, 14, 17, 19]
    .filter(z => agruparEnMapa(puntos, z).some(g => repartoDe(g.puntos, 'cobertura').length >= 3))

  if (zoomsConAnillo.length === 0) {
    console.log('\n   ✗ Los tres estados existen pero NINGÚN grupo es tricolor: quedaron en')
    console.log('     racimos distintos y cada marker va de un color liso. El anillo sigue')
    console.log('     sin poder mirarse. Revisá la elección de comercios.')
    process.exitCode = 1
  } else {
    console.log(`\n   ✓ Los tres conviven, y hay un grupo TRICOLOR en los zooms ${zoomsConAnillo.join(', ')}.`)
  }
} else {
  console.log('\n   ✗ NO quedaron los tres estados. Revisalo antes de usar este fixture.')
  process.exitCode = 1
}
console.log()

await c.end()
