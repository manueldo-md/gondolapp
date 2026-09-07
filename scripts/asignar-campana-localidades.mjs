#!/usr/bin/env node
// =============================================================================
// asignar-campana-localidades.mjs — deriva las zonas de cada campaña
// =============================================================================
// Uso:
//   npx tsx scripts/asignar-campana-localidades.mjs --ref <project-ref>
//
// POR QUÉ ES UN PASO APARTE
// Esta lógica vivía dentro de seed-demo-completo (PASO 17), y ahí nunca podía
// funcionar: el seed corre ANTES de fix-localidad-comercios, así que en ese
// momento los comercios todavía no tienen localidad_id y la derivación asigna
// cero. Lo detectó la verificación de poblar-ambiente.mjs.
//
// Con campana_localidades vacía el filtro por zona queda inerte: el código
// trata a toda campaña sin zona como "abierta por defecto" y todos los
// gondoleros ven todas las campañas.
//
// CRITERIO
// La localidad de una campaña sale de los comercios efectivamente relevados en
// ella. Es el dato más fiel —dice dónde se trabajó— y vale igual para Entre
// Ríos, Córdoba o Rosario sin lógica por provincia.
//
// Es idempotente: no duplica pares y limpia los que ya no tienen respaldo.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { resolverEntorno } from './lib/entorno.mjs'

const ENTORNO = resolverEntorno(process.argv)
const db = createClient(ENTORNO.url, ENTORNO.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function run() {
  // ── Pares que se justifican por algún comercio relevado ────────────────────
  const { data: misiones, error } = await db.from('misiones').select('campana_id, comercio_id')
  if (error) { console.error('❌ Error leyendo misiones:', error.message); process.exit(1) }

  const comercioIds = [...new Set((misiones ?? []).map(m => m.comercio_id).filter(Boolean))]
  const localidadPorComercio = new Map()
  if (comercioIds.length) {
    // De a 500 para no pasarse del límite de la query
    for (let i = 0; i < comercioIds.length; i += 500) {
      const { data } = await db.from('comercios').select('id, localidad_id').in('id', comercioIds.slice(i, i + 500))
      for (const c of data ?? []) if (c.localidad_id != null) localidadPorComercio.set(c.id, c.localidad_id)
    }
  }

  const deseados = new Set()
  let sinLocalidad = 0
  for (const m of misiones ?? []) {
    const loc = localidadPorComercio.get(m.comercio_id)
    if (loc == null) { sinLocalidad++; continue }
    deseados.add(`${m.campana_id}|${loc}`)
  }

  console.log(`Misiones: ${misiones?.length ?? 0}  |  pares derivados: ${deseados.size}`)
  if (sinLocalidad > 0) {
    console.log(`  ⚠️  ${sinLocalidad} misiones cuyo comercio no tiene localidad_id`)
    console.log('      Corré antes fix-localidad-comercios.mjs o esas campañas quedan sin zona.')
  }

  // ── Estado actual ──────────────────────────────────────────────────────────
  const { data: actuales } = await db.from('campana_localidades').select('id, campana_id, localidad_id')
  const existentes = new Map((actuales ?? []).map(r => [`${r.campana_id}|${r.localidad_id}`, r.id]))

  // ── Insertar los que faltan ────────────────────────────────────────────────
  const faltantes = [...deseados].filter(k => !existentes.has(k))
  if (faltantes.length) {
    const filas = faltantes.map(k => {
      const [campana_id, localidad_id] = k.split('|')
      return { campana_id, localidad_id: Number(localidad_id) }
    })
    const { error: e } = await db.from('campana_localidades').insert(filas)
    if (e) { console.error('❌ Error insertando:', e.message); process.exit(1) }
  }
  console.log(`  + ${faltantes.length} pares agregados`)

  // ── Borrar los que ya no se justifican ─────────────────────────────────────
  // Pasó en producción: un comercio mal ubicado dejó dos campañas de Entre Ríos
  // apuntando a Córdoba, y al corregir el comercio los pares quedaron colgados.
  const sobrantes = [...existentes.entries()].filter(([k]) => !deseados.has(k))
  for (const [, id] of sobrantes) {
    const { error: e } = await db.from('campana_localidades').delete().eq('id', id)
    if (e) console.error(`  ✗ no se pudo borrar ${id}:`, e.message)
  }
  console.log(`  - ${sobrantes.length} pares sin respaldo eliminados`)

  // ── Resumen ────────────────────────────────────────────────────────────────
  const { data: resumen } = await db
    .from('campanas')
    .select('nombre, campana_localidades(localidad_id)')
  const filas = (resumen ?? [])
    .map(c => ({ nombre: c.nombre, n: c.campana_localidades?.length ?? 0 }))
    .sort((a, b) => a.n - b.n)
  console.log('\nLocalidades por campaña:')
  for (const f of filas) console.log(`  ${String(f.n).padStart(3)}  ${f.nombre}`)
  const sinZona = filas.filter(f => f.n === 0)
  if (sinZona.length) {
    console.log(`\n  ${sinZona.length} campaña(s) sin zona: no tienen misiones todavía.`)
    console.log('  Se las trata como abiertas por defecto hasta que las tengan.')
  }
}

run().catch(err => { console.error(err); process.exit(1) })
