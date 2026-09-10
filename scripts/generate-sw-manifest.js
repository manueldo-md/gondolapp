#!/usr/bin/env node
/**
 * scripts/generate-sw-manifest.js
 *
 * Genera public/sw-manifest.json con los chunks JS de las rutas del gondolero
 * que deben estar disponibles offline. Se ejecuta automáticamente después de
 * `next build` mediante el script "build" en package.json.
 *
 * Si el manifest de Next.js no existe o tiene un formato inesperado, el script
 * termina con exit 1 para que el build falle de forma visible. Un manifest
 * vacío significaría offline roto sin que nadie se entere.
 */

const fs   = require('fs')
const path = require('path')

const MANIFEST_PATH = path.join(process.cwd(), '.next', 'app-build-manifest.json')
const OUTPUT_PATH   = path.join(process.cwd(), 'public', 'sw-manifest.json')

// Rutas cuyo contenido debe estar disponible offline para el gondolero.
// Incluye el layout del grupo para capturar sus chunks compartidos.
// Si cambia la estructura de rutas del App Router, actualizar esta lista.
const OFFLINE_ROUTES = [
  '/(gondolero)/layout',
  '/(gondolero)/gondolero/campanas/page',
  '/(gondolero)/gondolero/captura/page',
  '/(gondolero)/gondolero/perfil/page',
  '/offline/page',
]

// ── Leer el manifest ──────────────────────────────────────────────────────────

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
} catch (err) {
  console.error('[generate-sw-manifest] ERROR: No se pudo leer .next/app-build-manifest.json')
  console.error('  Verificá que next build terminó correctamente.')
  console.error('  Detalle:', err.message)
  process.exit(1)
}

const pages = manifest?.pages
if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
  console.error('[generate-sw-manifest] ERROR: .next/app-build-manifest.json no tiene la forma esperada.')
  console.error('  Esperaba { pages: { [ruta]: [chunks] } }. Recibido:', JSON.stringify(manifest).slice(0, 200))
  console.error('  Verificá si la versión de Next.js cambió el formato del manifest.')
  process.exit(1)
}

// ── Recolectar chunks ─────────────────────────────────────────────────────────

const chunks      = new Set()
const missingRoutes = []

for (const route of OFFLINE_ROUTES) {
  const files = pages[route]
  if (!Array.isArray(files) || files.length === 0) {
    missingRoutes.push(route)
    continue
  }
  for (const f of files) {
    if (typeof f === 'string' && f.endsWith('.js')) {
      chunks.add('/_next/' + f)
    }
  }
}

if (missingRoutes.length > 0) {
  console.error('[generate-sw-manifest] ERROR: Las siguientes rutas no se encontraron en el manifest:')
  missingRoutes.forEach(r => console.error('  -', r))
  console.error('  Si cambiaron los paths del App Router, actualizá OFFLINE_ROUTES en scripts/generate-sw-manifest.js')
  process.exit(1)
}

if (chunks.size === 0) {
  console.error('[generate-sw-manifest] ERROR: Se encontraron las rutas pero el manifest no listó ningún chunk JS.')
  console.error('  Revisá el formato de .next/app-build-manifest.json')
  process.exit(1)
}

// ── Escribir output ───────────────────────────────────────────────────────────

fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ chunks: Array.from(chunks) }, null, 2))

console.log(`[generate-sw-manifest] OK — ${chunks.size} chunks escritos en public/sw-manifest.json`)
for (const route of OFFLINE_ROUTES) {
  const count = (pages[route] || []).filter(f => typeof f === 'string' && f.endsWith('.js')).length
  console.log(`  ${route.padEnd(52)} ${count} chunks`)
}
