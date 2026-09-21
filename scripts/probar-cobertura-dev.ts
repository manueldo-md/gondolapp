/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * scripts/probar-cobertura-dev.ts
 * El cálculo de cobertura contra los datos REALES de dev.
 *
 *   node scripts/sembrar-seguimiento.mjs --ref <dev>   (una vez)
 *   npx tsx scripts/probar-cobertura-dev.ts
 *
 * probar-cobertura.ts prueba la lógica con casos a mano; éste prueba que la
 * lógica y la base se entiendan. Imprime además el mismo dato visto un viernes,
 * porque corriendo un lunes lo esperado es cero y no se ve ningún atrasado.
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { calcularCobertura, etiquetaUltimaVisita } from '../lib/cobertura-seguimiento'
const { Client } = createRequire(import.meta.url)('pg')
const url = fs.readFileSync('C:/Users/manue/GondolAPP/gondolapp/.env.dev.local', 'utf8')
  .match(/^PGURL\s*=\s*"?([^"\r\n]+)"?/m)![1].trim()

const tabla = (rr: any) => console.table(rr.comercios.map((x: any) => ({
  comercio: x.nombre.slice(0, 28), visitas: x.visitas, esperadas: x.esperadas,
  estado: x.estado, ultima: etiquetaUltimaVisita(x.ultimaVisita, x.diasSinVisita),
})))

;(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows: [cam] } = await c.query(
    `SELECT id, visitas_por_semana, fecha_inicio::text FROM campanas WHERE nombre LIKE '[TEST] Reposición%'`)
  const { rows: mis } = await c.query(
    `SELECT comercio_id, gondolero_id, estado, capturada_at, created_at FROM misiones WHERE campana_id=$1`, [cam.id])
  const ids = [...new Set(mis.map((m: any) => m.comercio_id))]
  const { rows: com } = await c.query(`SELECT id, nombre FROM comercios WHERE id = ANY($1)`, [ids])
  await c.end()

  const nombres = new Map<string, string>(com.map((x: any) => [x.id as string, x.nombre as string]))
  const base = { misiones: mis as any, nombresComercio: nombres, visitasPorSemana: cam.visitas_por_semana, fechaInicio: cam.fecha_inicio }

  const r = calcularCobertura(base)
  console.log(`\nHOY — semana ${r.semana.lunes} → ${r.semana.domingo} (${r.enCurso ? 'en curso' : 'cerrada'})`)
  console.log(`Cobertura ${r.visitasHechas} / ${r.metaSemana} · esperadas hoy ${r.esperadasHoy}\n`)
  tabla(r)

  const viernes = new Date(r.semana.desde.getTime() + 4 * 86400000 + 15 * 3600000)
  const rv = calcularCobertura({ ...base, ahora: viernes })
  console.log(`\nEL MISMO DATO VISTO UN VIERNES — esperadas por comercio: ${rv.comercios[0]?.esperadas}\n`)
  tabla(rv)

  const frontera = mis.find((m: any) => new Date(m.capturada_at).toISOString().slice(11, 16) === '01:00')
  if (frontera) {
    const diaAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
      .format(new Date(frontera.capturada_at))
    const contada = r.comercios.find(x => x.comercioId === frontera.comercio_id)?.visitas
    console.log('\nLA VISITA FRONTERA')
    console.log('  capturada_at en UTC  :', new Date(frontera.capturada_at).toISOString(), '← lunes en UTC')
    console.log('  día argentino real   :', diaAR, '← domingo')
    console.log('  semana del dashboard :', r.semana.lunes, '→', r.semana.domingo)
    console.log('  contada esta semana  :', contada === 1 ? 'SÍ — la zona horaria NO está aplicada' : 'no — correcto')
  }
})()
