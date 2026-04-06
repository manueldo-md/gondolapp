/**
 * Seed de zonas geográficas de Argentina.
 * Inserta Provincias → Departamentos → Localidades en las tablas nuevas.
 *
 * Requiere tsx instalado:
 *   npx tsx --env-file=.env.local scripts/seed-zonas.ts
 *
 * O si tsx no está instalado:
 *   npm i -D tsx && npx tsx --env-file=.env.local scripts/seed-zonas.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── Cargar .env.local si no hay env vars ya seteadas ─────────
try {
  const envPath = join(process.cwd(), '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !process.env[key]) process.env[key] = val
  }
} catch {
  // No hay .env.local — se asume que las vars ya están en el entorno
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Datos: Provincia → Departamento → [Localidades] ─────────
//   Entre Ríos: completo (17 departamentos)
//   Otras provincias: capital + ciudades principales
// ────────────────────────────────────────────────────────────

const DATA: Record<string, Record<string, string[]>> = {
  // ── Entre Ríos (completo) ──────────────────────────────────
  'Entre Ríos': {
    'Colón': [
      'Colón', 'San José', 'Villa Elisa', 'Pueblo Liebig', 'Ubajay',
    ],
    'Concordia': [
      'Concordia', 'Los Charrúas', 'Benito Legerén', 'Yuquerí', 'Calabacilla',
    ],
    'Diamante': [
      'Diamante', 'General Ramírez', 'Aldea Santa Rosa', 'Aldea Protestante',
    ],
    'Federación': [
      'Federación', 'Chajarí', 'San Jaime de la Frontera', 'Villa del Rosario',
      'Federación (Ciudad nueva)', 'Santa Ana',
    ],
    'Federal': [
      'Federal', 'Sauce de Luna', 'La Criolla',
    ],
    'Feliciano': [
      'San José de Feliciano', 'Colonia Ayuí', 'Alcaraz',
    ],
    'Gualeguay': [
      'Gualeguay', 'Urdinarrain', 'Médanos', 'Estación Lazo',
    ],
    'Gualeguaychú': [
      'Gualeguaychú', 'Larroque', 'Gilbert', 'Faustino M. Parera', 'Aldea Brasilera',
    ],
    'Islas del Ibicuy': [
      'Villa Paranacito', 'Ibicuy', 'Ceibas',
    ],
    'La Paz': [
      'La Paz', 'Bovril', 'Santa Elena', 'Alcaraz Norte', 'Villa del Rosario',
    ],
    'Nogoyá': [
      'Nogoyá', 'Aranguren', 'Gobernador Echagüe', 'Sauce Montrull',
    ],
    'Paraná': [
      'Paraná', 'Crespo', 'Oro Verde', 'San Benito', 'Colonia Avellaneda',
      'María Grande', 'Hernandarias', 'Aldea Santa María',
    ],
    'San Salvador': [
      'San Salvador', 'General Campos',
    ],
    'Tala': [
      'Rosario del Tala', 'Gobernador Mansilla', 'Maciá', 'Antelo',
    ],
    'Uruguay': [
      'Concepción del Uruguay', 'Basavilbaso', 'Pronunciamiento', 'Herrera',
      'Caseros', 'Ingeniero Miguel Sajaroff',
    ],
    'Victoria': [
      'Victoria', 'Irazusta', 'Gobernador Etchevehere', 'Molino Doll',
    ],
    'Villaguay': [
      'Villaguay', 'Bergmann', 'Jubileo', 'Ramirez', 'Paso de la Laguna',
    ],
  },

  // ── Buenos Aires ───────────────────────────────────────────
  'Buenos Aires': {
    'La Plata': ['La Plata', 'Berisso', 'Ensenada'],
    'General Pueyrredón': ['Mar del Plata', 'Batán'],
    'Quilmes': ['Quilmes', 'Berazategui', 'Ezpeleta'],
    'Lomas de Zamora': ['Lomas de Zamora', 'Banfield', 'Temperley'],
    'La Matanza': ['San Justo', 'Ramos Mejía', 'Isidro Casanova'],
    'Tigre': ['Tigre', 'Don Torcuato', 'General Pacheco'],
    'Bahía Blanca': ['Bahía Blanca', 'Cerri'],
    'Mar del Plata': ['Mar del Plata'],
    'Morón': ['Morón', 'Castelar', 'Ituzaingó'],
    'San Isidro': ['San Isidro', 'Martínez', 'Boulogne'],
  },

  // ── Ciudad Autónoma de Buenos Aires ────────────────────────
  'Ciudad Autónoma de Buenos Aires': {
    'Ciudad Autónoma de Buenos Aires': ['Buenos Aires'],
  },

  // ── Córdoba ───────────────────────────────────────────────
  'Córdoba': {
    'Capital': ['Córdoba'],
    'Río Cuarto': ['Río Cuarto', 'Las Higueras'],
    'San Justo': ['Villa María', 'Villa Nueva'],
    'Colón': ['Jesús María', 'Colonia Caroya'],
    'Punilla': ['Carlos Paz', 'Cosquín', 'La Falda'],
  },

  // ── Santa Fe ───────────────────────────────────────────────
  'Santa Fe': {
    'Rosario': ['Rosario', 'Villa Gobernador Gálvez', 'Pérez'],
    'La Capital': ['Santa Fe', 'Santo Tomé', 'Recreo'],
    'General López': ['Venado Tuerto', 'Murphy'],
    'Castellanos': ['Rafaela', 'Sunchales'],
  },

  // ── Mendoza ────────────────────────────────────────────────
  'Mendoza': {
    'Capital': ['Mendoza'],
    'General San Martín': ['San Martín', 'Palmira'],
    'San Rafael': ['San Rafael', 'Malargüe'],
    'Godoy Cruz': ['Godoy Cruz'],
    'Luján de Cuyo': ['Luján de Cuyo', 'Perdriel'],
  },

  // ── Tucumán ────────────────────────────────────────────────
  'Tucumán': {
    'Capital': ['San Miguel de Tucumán'],
    'Tafí Viejo': ['Tafí Viejo'],
    'Yerba Buena': ['Yerba Buena'],
  },

  // ── Salta ─────────────────────────────────────────────────
  'Salta': {
    'Capital': ['Salta'],
    'Orán': ['Orán', 'Pichanal'],
    'Rosario de la Frontera': ['Rosario de la Frontera'],
  },

  // ── Misiones ──────────────────────────────────────────────
  'Misiones': {
    'Capital': ['Posadas'],
    'Oberá': ['Oberá'],
    'Iguazú': ['Puerto Iguazú'],
  },

  // ── Chaco ─────────────────────────────────────────────────
  'Chaco': {
    'San Fernando': ['Resistencia', 'Barranqueras'],
    'General Güemes': ['Juan José Castelli'],
  },

  // ── Corrientes ────────────────────────────────────────────
  'Corrientes': {
    'Capital': ['Corrientes'],
    'Santo Tomé': ['Santo Tomé'],
    'Goya': ['Goya'],
  },

  // ── Formosa ───────────────────────────────────────────────
  'Formosa': {
    'Formosa': ['Formosa'],
    'Pilcomayo': ['Clorinda'],
  },

  // ── Jujuy ─────────────────────────────────────────────────
  'Jujuy': {
    'Doctor Manuel Belgrano': ['San Salvador de Jujuy'],
    'Palpalá': ['Palpalá'],
    'Ledesma': ['Libertador General San Martín'],
  },

  // ── San Juan ──────────────────────────────────────────────
  'San Juan': {
    'Capital': ['San Juan'],
    'Rivadavia': ['Rivadavia'],
  },

  // ── San Luis ──────────────────────────────────────────────
  'San Luis': {
    'Juan Martín de Pueyrredón': ['San Luis'],
    'General Pedernera': ['Villa Mercedes'],
  },

  // ── La Rioja ──────────────────────────────────────────────
  'La Rioja': {
    'Capital': ['La Rioja'],
    'Gral. Ángel Vicente Peñaloza': ['Chepes'],
  },

  // ── Catamarca ─────────────────────────────────────────────
  'Catamarca': {
    'Capital': ['San Fernando del Valle de Catamarca'],
    'Pomán': ['Fiambalá'],
  },

  // ── Santiago del Estero ───────────────────────────────────
  'Santiago del Estero': {
    'Capital': ['Santiago del Estero'],
    'Robles': ['Frías'],
    'La Banda': ['La Banda'],
  },

  // ── Neuquén ───────────────────────────────────────────────
  'Neuquén': {
    'Confluencia': ['Neuquén', 'Plottier'],
    'Los Lagos': ['Villa La Angostura', 'San Martín de los Andes'],
  },

  // ── Río Negro ─────────────────────────────────────────────
  'Río Negro': {
    'General Roca': ['General Roca', 'Allen', 'Cipolletti'],
    'Bariloche': ['San Carlos de Bariloche'],
    'Adolfo Alsina': ['Viedma'],
  },

  // ── Chubut ────────────────────────────────────────────────
  'Chubut': {
    'Rawson': ['Rawson', 'Trelew'],
    'Escalante': ['Comodoro Rivadavia'],
    'Biedma': ['Puerto Madryn'],
  },

  // ── Santa Cruz ────────────────────────────────────────────
  'Santa Cruz': {
    'Güer Aike': ['Río Gallegos'],
    'Magallanes': ['Puerto Natales (AR)'],
  },

  // ── Tierra del Fuego ──────────────────────────────────────
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur': {
    'Ushuaia': ['Ushuaia'],
    'Río Grande': ['Río Grande'],
  },

  // ── La Pampa ──────────────────────────────────────────────
  'La Pampa': {
    'Capital': ['Santa Rosa'],
    'Guatraché': ['Guatraché'],
    'Maracó': ['General Pico'],
  },
}

// ── Función principal ────────────────────────────────────────
async function seed() {
  console.log('🌱  Iniciando seed de zonas geográficas...\n')

  // Limpiar datos previos (en orden inverso de FK)
  console.log('🗑   Limpiando datos previos...')
  await admin.from('campana_localidades').delete().neq('localidad_id', 0)
  await admin.from('gondolero_localidades').delete().neq('localidad_id', 0)
  await admin.from('localidades').delete().neq('id', 0)
  await admin.from('departamentos').delete().neq('id', 0)
  await admin.from('provincias').delete().neq('id', 0)

  // Insertar provincias
  const provNames = Object.keys(DATA)
  const { data: provinciasData, error: errProv } = await admin
    .from('provincias')
    .insert(provNames.map(nombre => ({ nombre })))
    .select('id, nombre')

  if (errProv) { console.error('❌ Error insertando provincias:', errProv.message); process.exit(1) }
  console.log(`✅  ${provinciasData!.length} provincias insertadas`)

  const provMap: Record<string, number> = {}
  for (const p of provinciasData!) provMap[p.nombre] = p.id

  // Insertar departamentos
  const deptRows: { nombre: string; provincia_id: number }[] = []
  for (const [provNombre, depts] of Object.entries(DATA)) {
    for (const deptNombre of Object.keys(depts)) {
      deptRows.push({ nombre: deptNombre, provincia_id: provMap[provNombre] })
    }
  }

  const { data: deptsData, error: errDept } = await admin
    .from('departamentos')
    .insert(deptRows)
    .select('id, nombre, provincia_id')

  if (errDept) { console.error('❌ Error insertando departamentos:', errDept.message); process.exit(1) }
  console.log(`✅  ${deptsData!.length} departamentos insertados`)

  // Mapa: "provincia_id|nombre" → departamento_id
  const deptMap: Record<string, number> = {}
  for (const d of deptsData!) deptMap[`${d.provincia_id}|${d.nombre}`] = d.id

  // Insertar localidades en lotes
  const locRows: { nombre: string; departamento_id: number }[] = []
  for (const [provNombre, depts] of Object.entries(DATA)) {
    for (const [deptNombre, locs] of Object.entries(depts)) {
      const deptId = deptMap[`${provMap[provNombre]}|${deptNombre}`]
      if (!deptId) { console.warn(`⚠️  Departamento no encontrado: ${deptNombre} (${provNombre})`); continue }
      for (const loc of locs) {
        locRows.push({ nombre: loc, departamento_id: deptId })
      }
    }
  }

  // Insertar en lotes de 100
  let totalLoc = 0
  for (let i = 0; i < locRows.length; i += 100) {
    const batch = locRows.slice(i, i + 100)
    const { error: errLoc } = await admin.from('localidades').insert(batch)
    if (errLoc) { console.error(`❌ Error insertando localidades (lote ${i}):`, errLoc.message); process.exit(1) }
    totalLoc += batch.length
  }
  console.log(`✅  ${totalLoc} localidades insertadas`)

  console.log('\n🎉  Seed completado!')
}

seed().catch(err => { console.error(err); process.exit(1) })
