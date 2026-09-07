#!/usr/bin/env node
// =============================================================================
// poblar-ambiente.mjs — deja un ambiente completo desde cero
// =============================================================================
// Uso:
//   npx tsx scripts/poblar-ambiente.mjs --ref <project-ref>
//   npx tsx scripts/poblar-ambiente.mjs --ref <project-ref> --forzar
//
// POR QUÉ EXISTE
// El problema no es acordarse de siete comandos: es que un ambiente incompleto
// NO se queja. Correr solo el seed deja presencia 0% y las fotos sin cargar,
// síntomas que parecen bugs de la app y mandan a cazar errores que no existen.
// Pasó en producción tras la reconstrucción y volvió a pasar en dev.
//
// Por eso este script hace tres cosas, y la tercera es la que lo justifica:
//   1. Encadena los siete pasos en orden, cortando en el primero que falle.
//   2. Se niega a correr sobre un ambiente ya poblado, salvo --forzar:
//      seed-demo-completo NO es idempotente para las misiones y fotos de las
//      campañas 5, 6 y 7, así que una segunda pasada las duplica.
//   3. Verifica al final y falla si quedó incompleto. Convierte el fallo
//      silencioso en uno ruidoso.
//
// Hereda las guardas de cada script: --ref obligatorio, credenciales buscadas
// por ref, y GONDOLAPP_PROD=1 si el destino es producción.
// =============================================================================

import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { resolverEntorno } from './lib/entorno.mjs'
import { hayCsvPiloto, RUTA_CSV_PILOTO } from './lib/csv-piloto.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const ENTORNO = resolverEntorno(process.argv)
const FORZAR = process.argv.includes('--forzar')

const db = createClient(ENTORNO.url, ENTORNO.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASOS = [
  ['seed-zonas.ts',                'Geografía: provincias, departamentos, localidades'],
  ['seed-demo-completo.ts',        'Entidades, usuarios, comercios, campañas, misiones, fotos'],
  ['fix-localidad-comercios.mjs',  'localidad_id de los comercios'],
  ['fix-declaracion-georgalos.mjs','fotos.declaracion — sin esto la presencia da 0%'],
  ['fix-fechas-piloto.mjs',        'Fechas reales del relevamiento (11-14/3/2026)'],
  ['fix-foto-urls-v2.mjs',         'URLs de Drive a formato thumbnail — sin esto las fotos no cargan'],
  ['asignar-campana-localidades.mjs', 'Zonas de cada campaña — sin esto todos ven todas las campañas'],
]

function salirCon(mensaje) {
  console.error(`\n✗ ${mensaje}\n`)
  process.exit(1)
}

// ── Chequeos previos: todo lo que pueda faltar, ANTES de escribir nada ───────
async function preflight() {
  if (!hayCsvPiloto()) {
    salirCon(`Falta el CSV del piloto en ${RUTA_CSV_PILOTO}.\n  Cuatro de los siete pasos lo necesitan. Recuperalo con:\n    git checkout data/georgalos-piloto.csv`)
  }

  const { error } = await db.from('campanas').select('id').limit(1)
  if (error) salirCon(`No se pudo consultar la base: ${error.message}`)

  const tablas = ['campanas', 'comercios', 'misiones', 'fotos', 'localidades']
  const conDatos = []
  for (const t of tablas) {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true })
    if (count > 0) conDatos.push(`${t}=${count}`)
  }

  if (conDatos.length > 0 && !FORZAR) {
    salirCon(
      `El ambiente ya tiene datos: ${conDatos.join(', ')}\n\n` +
      '  seed-demo-completo NO es idempotente: las misiones y fotos de las\n' +
      '  campañas 5, 6 y 7 se insertan sin guarda, así que una segunda pasada\n' +
      '  las duplica.\n\n' +
      '  Para repoblar de cero, vaciá primero:\n' +
      `    node scripts/aplicar-migraciones.mjs --ref ${ENTORNO.ref} --reset --grants\n\n` +
      '  Si sabés lo que hacés y querés correrlo igual: --forzar'
    )
  }
  if (conDatos.length > 0) {
    console.log(`⚠️  --forzar: el ambiente ya tiene datos (${conDatos.join(', ')}) y se corre igual\n`)
  }
}

// ── Los siete pasos ───────────────────────────────────────────────────────────
function correrPasos() {
  const t0 = Date.now()
  for (const [i, [archivo, descripcion]] of PASOS.entries()) {
    console.log(`\n${'━'.repeat(70)}`)
    console.log(`PASO ${i + 1}/${PASOS.length} — ${archivo}`)
    console.log(`  ${descripcion}`)
    console.log('━'.repeat(70))

    const r = spawnSync(
      process.execPath,
      [join(DIR, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(DIR, archivo), '--ref', ENTORNO.ref],
      { stdio: 'inherit', env: process.env }
    )

    if (r.status !== 0) {
      salirCon(
        `El paso ${i + 1} (${archivo}) falló con código ${r.status}.\n` +
        '  Se corta acá: los pasos siguientes dependen de este.\n' +
        `  Arreglá la causa y volvé a correr con --forzar, o vaciá y empezá de nuevo.`
      )
    }
  }
  console.log(`\n${'━'.repeat(70)}`)
  console.log(`Los ${PASOS.length} pasos corrieron en ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

// ── Verificación: lo que justifica el script ─────────────────────────────────
// Cada chequeo corresponde a un síntoma que ya se vio en un ambiente real.
async function verificar() {
  console.log(`\n${'━'.repeat(70)}`)
  console.log('VERIFICACIÓN')
  console.log('━'.repeat(70))

  const problemas = []
  const cuenta = async (tabla, filtro) => {
    let q = db.from(tabla).select('*', { count: 'exact', head: true })
    if (filtro) q = filtro(q)
    const { count } = await q
    return count ?? 0
  }

  const localidades = await cuenta('localidades')
  const comercios = await cuenta('comercios')
  const sinLocalidad = await cuenta('comercios', (q) => q.is('localidad_id', null))
  const campanaLoc = await cuenta('campana_localidades')
  const fotos = await cuenta('fotos')
  const conDeclaracion = await cuenta('fotos', (q) => q.not('declaracion', 'is', null))
  const urlsMal = await cuenta('fotos', (q) => q.like('url', '%uc?export=view%'))

  const linea = (ok, texto) => console.log(`  ${ok ? '✓' : '✗'} ${texto}`)

  linea(localidades > 900, `localidades: ${localidades}`)
  if (localidades <= 900) problemas.push('faltan localidades — ¿corrió seed-zonas?')

  linea(comercios > 0, `comercios: ${comercios}`)
  if (comercios === 0) problemas.push('no hay comercios — ¿corrió seed-demo-completo?')

  linea(sinLocalidad === 0, `comercios sin localidad_id: ${sinLocalidad}`)
  if (sinLocalidad > 0) problemas.push('hay comercios sin localidad — el filtro por zona no va a discriminar bien')

  linea(campanaLoc > 0, `pares campaña→localidad: ${campanaLoc}`)
  if (campanaLoc === 0) problemas.push('campana_localidades vacía — todos los gondoleros ven todas las campañas')

  linea(conDeclaracion > 0, `fotos con declaración: ${conDeclaracion} de ${fotos}`)
  if (conDeclaracion === 0) problemas.push('ninguna foto tiene declaración — la presencia va a dar 0%')

  linea(urlsMal === 0, `fotos con URL sin convertir: ${urlsMal}`)
  if (urlsMal > 0) problemas.push('hay URLs en formato uc?export=view — esas fotos no van a cargar')

  if (problemas.length > 0) {
    console.error(`\n✗ El ambiente quedó INCOMPLETO:\n`)
    for (const p of problemas) console.error(`    - ${p}`)
    console.error('')
    process.exit(1)
  }

  console.log(`\n✓ Ambiente completo — ${ENTORNO.ref} (${ENTORNO.nombre})\n`)
}

await preflight()
correrPasos()
await verificar()
