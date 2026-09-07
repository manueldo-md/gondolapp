/**
 * Seed completo de demo — GondolApp
 * Ejecutar: npx tsx --env-file=.env.local scripts/seed-demo-completo.ts
 *
 * Idempotente: usa ON CONFLICT DO NOTHING / upsert en todo.
 * No borra datos existentes.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolverEntorno } from './lib/entorno.mjs'

// ── Proyecto destino ─────────────────────────────────────────────────────────
// Este script crea usuarios y escribe en 20 tablas, así que el proyecto se
// declara en el comando con --ref y se valida contra las credenciales antes de
// tocar nada. Ya no lee .env.local por su cuenta. Ver scripts/lib/entorno.mjs.
const ENTORNO = resolverEntorno(process.argv)

const PASSWORD = 'Demo1234!'

const db = createClient(ENTORNO.url, ENTORNO.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Contadores de progreso ────────────────────────────────────────────────────
const stats = {
  marcas: 0, distris: 0, repos: 0,
  usuarios: 0, gondoleros: 0, fixers: 0,
  relaciones: 0, comercios: 0, campanas: 0,
  misiones: 0, fotos: 0, puntos: 0,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rnd(min: number, max: number) { return Math.random() * (max - min) + min }
function jitter(base: number, delta = 0.008) { return +(base + rnd(-delta, delta)).toFixed(6) }

async function upsertIgnore<T extends object>(table: string, rows: T[], conflict: string) {
  if (!rows.length) return []
  const { data, error } = await (db as any)
    .from(table)
    .upsert(rows, { onConflict: conflict, ignoreDuplicates: true })
    .select('id')
  if (error) console.warn(`  ⚠️  ${table}: ${error.message}`)
  return data ?? []
}

// Cache de usuarios auth ya existentes
const authMap = new Map<string, string>() // email → user_id

async function loadAuthUsers() {
  let page = 1
  while (true) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (!data?.users?.length) break
    for (const u of data.users) if (u.email) authMap.set(u.email, u.id)
    if (data.users.length < 1000) break
    page++
  }
  console.log(`  → ${authMap.size} usuarios auth existentes cacheados`)
}

async function getOrCreateUser(email: string, nombre: string, tipoActor: string): Promise<string> {
  if (authMap.has(email)) return authMap.get(email)!
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nombre, tipo_actor: tipoActor },
  })
  if (error) {
    console.warn(`  ⚠️  No se pudo crear ${email}: ${error.message}`)
    return ''
  }
  const id = data.user.id
  authMap.set(email, id)
  stats.usuarios++
  return id
}

// ── Datos: Ciudades y coords ──────────────────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  'cdelu':                   [-32.4833, -58.2333],
  'concepción del uruguay':  [-32.4833, -58.2333],
  'concordia':               [-31.3933, -58.0167],
  'gualeguaychú':            [-33.0167, -59.0833],
  'gualeguaychú ':           [-33.0167, -59.0833],
  'villaguay':               [-31.8667, -59.0167],
  'colón':                   [-32.2333, -58.1333],
  'colon':                   [-32.2333, -58.1333],
  'rosario del tala':        [-32.3000, -59.1333],
  'chajari':                 [-30.7667, -57.9833],
  'chajari ':                [-30.7667, -57.9833],
  'san salvador':            [-31.6167, -58.5000],
  'general campos':          [-31.6167, -58.3833],
  'general campos ':         [-31.6167, -58.3833],
  'villa domínguez':         [-32.2333, -58.9667],
  'villa domínguez ':        [-32.2333, -58.9667],
  // Ficticios
  'córdoba':                 [-31.4135, -64.1811],
  'rosario':                 [-32.9442, -60.6505],
}

function cityCoords(ciudad: string): [number, number] {
  const key = ciudad.toLowerCase().trim()
  return CITY_COORDS[key] ?? [-32.5, -58.5]
}

function tipoComercio(raw: string): string {
  const m: Record<string, string> = {
    'supermercado':       'autoservicio',
    'almacen / despensa': 'almacen',
    'almacen':            'almacen',
    'kiosco':             'kiosco',
    'dietetica':          'dietetica',
    'dietética':          'dietetica',
  }
  return m[raw.toLowerCase().trim()] ?? 'otro'
}

function driveViewUrl(rawUrl: string): string {
  const match = rawUrl.match(/id=([^&\s]+)/)
  if (!match) return rawUrl
  return `https://drive.google.com/uc?export=view&id=${match[1]}`
}

// ── CSV del relevamiento Georgalos ────────────────────────────────────────────
// Leído de: Reporte Georgalos al 12032026.07.30hs.csv (encoding latin1, sep ;)
// Columnas: timestamp; VENDEDOR; tipo; dirección; ciudad; hayGeorgalos; foto1URL; foto2URL; másfotos; comentario; email

interface CsvRow {
  tipo: string; direccion: string; ciudad: string
  hayGeorgalos: boolean
  foto1: string; foto2: string
  email: string
}

function parseCsv(): CsvRow[] {
  const paths = [
    join(process.cwd(), 'data', 'georgalos-muestra.csv'),
    'C:/Users/manue/OneDrive/LABORAL.OL/Biomega/Georgalos/Reporte Georgalos al 12032026.07.30hs.csv',
  ]
  let raw = ''
  for (const p of paths) {
    try { raw = readFileSync(p).toString('latin1'); break } catch { /* next */ }
  }
  if (!raw) {
    console.warn('  ⚠️  CSV de Georgalos no encontrado — usando datos embebidos')
    return EMBEDDED_CSV
  }
  const lines = raw.split('\n').slice(1) // skip header
  return lines
    .map(l => {
      const c = l.split(';')
      if (c.length < 7) return null
      const tipo = c[2]?.trim()
      const dir  = c[3]?.trim()
      const ciu  = c[4]?.trim()
      if (!tipo || !dir) return null
      return {
        tipo: tipoComercio(tipo),
        direccion: dir,
        ciudad: ciu,
        hayGeorgalos: (c[5]?.trim() ?? '').toUpperCase() === 'SI',
        foto1: driveViewUrl(c[6]?.trim() ?? ''),
        foto2: driveViewUrl(c[7]?.trim() ?? ''),
        email: c[10]?.trim() ?? '',
      }
    })
    .filter(Boolean) as CsvRow[]
}

// Datos embebidos (fallback si no hay CSV)
const EMBEDDED_CSV: CsvRow[] = [
  { tipo:'dietetica',   direccion:'San martin 980',         ciudad:'Colon',         hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1BIDdfVpos1zhNsdyfHmlxpFysHgqKCS7', foto2:'https://drive.google.com/uc?export=view&id=1ReGo3aMMOhgURH4492eYaMq25G84tOFj', email:'' },
  { tipo:'almacen',     direccion:'Todo de campo fiambreria', ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=12qubn11Evew_vzqOQC_-vs4xDKDYb74c', foto2:'https://drive.google.com/uc?export=view&id=1zjpCqIczq0xoyfcEWlig36nZy1CFJxkd', email:'raulyschanton@gmail.com' },
  { tipo:'autoservicio',direccion:'Lauria y suipacha',       ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1vAxSLivyDPmoePJtPv3oSHzwdXcNOF9F', foto2:'https://drive.google.com/uc?export=view&id=15-3O35noax1LmkjIqbKUD3-smjnnl1Xu', email:'agustinpenonalvarez@gmail.com' },
  { tipo:'autoservicio',direccion:'Hipolito yrigoyen 526',   ciudad:'General Campos', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1vb85jV6uksGZM1HZYIU-NXqmdct1gNQb', foto2:'https://drive.google.com/uc?export=view&id=1lhy9ouS3LQUsnfOTFlQgPv_VOqq8GsXc', email:'arraldegonzalo@gmail.com' },
  { tipo:'almacen',     direccion:'San Martín 197',          ciudad:'Villa Domínguez', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=14RLRM16pkiimD-l_fg7hgVaM4Yuf7x4E', foto2:'https://drive.google.com/uc?export=view&id=1W456NpI9FmWf_ZtANRrYtNCyz0ELGbnb', email:'camaralmiron@gmail.com' },
  { tipo:'autoservicio',direccion:'Centenario y colon',      ciudad:'Rosario del tala', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1GsMKXXxvGjHQNrud-MDH2MK33auVR8yA', foto2:'https://drive.google.com/uc?export=view&id=10Z0cc5M2JID_Kq8qC6sHnFi09lAHT7sL', email:'gdt.garciaj@gmail.com' },
  { tipo:'dietetica',   direccion:'Congreso de tucuman 210', ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1WzhuUkhGryWcvgZK7Wucfy2SbLI6GIWG', foto2:'https://drive.google.com/uc?export=view&id=1UJxSrbZfZzQoCWATT7GTSPjIC6I5QJMM', email:'raulyschanton@gmail.com' },
  { tipo:'autoservicio',direccion:'1ro de mayo 217',         ciudad:'Rosario del tala', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1OoNwxO_3XxyrVjC03ULqrkHvgHah2Bk-', foto2:'https://drive.google.com/uc?export=view&id=16LhyR_9zy-WYlP0mHQoMXhiSC4HG7qHL', email:'gdt.garciaj@gmail.com' },
  { tipo:'dietetica',   direccion:'25 de mayo 110 punto saludable', ciudad:'Cdelu', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1AxRdkTV5Y8Qj9rbROAo9FdIWwW2jMI_a', foto2:'https://drive.google.com/uc?export=view&id=1DsCiQ09hMJ0QtGgQLG99UGvAEIv-LnZj', email:'raulyschanton@gmail.com' },
  { tipo:'kiosco',      direccion:'25 de mayo 90',           ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1QDkwKtAwAdSbRgPXtT0nh4kdXf-B6K82', foto2:'https://drive.google.com/uc?export=view&id=124xLF-gI_t6w1hayuVNHPFhuMlFsxGAQ', email:'raulyschanton@gmail.com' },
  { tipo:'kiosco',      direccion:'Moulins 82',              ciudad:'Concordia',   hayGeorgalos:false, foto1:'https://drive.google.com/uc?export=view&id=1C1_LN0v8-xPolK9_qsrgGlxjmghbbykq', foto2:'https://drive.google.com/uc?export=view&id=1olu_m3POl4YnWVf4GvHnEsQL7dht96dS', email:'martinbiomega@gmail.com' },
  { tipo:'kiosco',      direccion:'25 de mayo 148',          ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1SbFl_Eqie49h4gFSKKdRKh4tmf2c1TjS', foto2:'https://drive.google.com/uc?export=view&id=1TGHVi1rxIXyjT_QXWe15NKHv2L8_9926', email:'raulyschanton@gmail.com' },
  { tipo:'autoservicio',direccion:'Artigas 1772',            ciudad:'Gualeguaychú', hayGeorgalos:false, foto1:'https://drive.google.com/uc?export=view&id=16rjxLVwZYiuIF8twnSWsyrv45j1d8lCp', foto2:'https://drive.google.com/uc?export=view&id=1cQZAPO7v2bP2QYYBYEI9cwhqrlj2uozr', email:'guillepombo5@gmail.com' },
  { tipo:'almacen',     direccion:'Damian P Garat 1666',     ciudad:'Concordia',   hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1czwjN0v24vv5Y6N_zklC-pVugk-ji-j-', foto2:'https://drive.google.com/uc?export=view&id=1PLmqRWDI3YgUW2i_EuHvdstRkseG5NaO', email:'martinbiomega@gmail.com' },
  { tipo:'almacen',     direccion:'Michelena 624',           ciudad:'Villaguay',   hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1lMOmQ5kyai-4-M23WqWvY9T2uMzdgRNk', foto2:'https://drive.google.com/uc?export=view&id=178VzV3UgUVJRxt51WkT0f12nQ3Kp9RlE', email:'camaralmiron@gmail.com' },
  { tipo:'autoservicio',direccion:'25 de agosto 891',        ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1nq7XNr2jhxThOR8QKMYaXA0Rm6xZoq-Z', foto2:'https://drive.google.com/uc?export=view&id=1v3cr6p8_gcYjxlYLYJoT5n7YMjTESKL6', email:'raulyschanton@gmail.com' },
  { tipo:'almacen',     direccion:'Antonio de Luque 815',    ciudad:'Concordia',   hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1sDc_u4Um_pHafYVuSdiUOPqDJf4ym2qk', foto2:'https://drive.google.com/uc?export=view&id=1DuxIbfSnoM4Jm38BBj-rVDA9zXFiqHOZ', email:'martinbiomega@gmail.com' },
  { tipo:'autoservicio',direccion:'Colon 1046',              ciudad:'Villaguay',   hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1jxMjwztr3330lC_2L-wL3fxLuT_Q0hGj', foto2:'https://drive.google.com/uc?export=view&id=1PW6T2Z2n-hJtQ_K_31EhJcNfTz5_U-4d', email:'camaralmiron@gmail.com' },
  { tipo:'kiosco',      direccion:'Del valle y moreno',      ciudad:'Gualeguaychú', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1MrvTfZaU2D8DIIYNffNKqaPS9z2v0xx0', foto2:'https://drive.google.com/uc?export=view&id=1sNeP4U6181sfGqNyKnQaW1rEaZzcnFai', email:'guillepombo5@gmail.com' },
  { tipo:'almacen',     direccion:'Blanchet 299',            ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1kjp9nCmIw39AJ03QsJQQ-1T_Z0-SPjH7', foto2:'https://drive.google.com/uc?export=view&id=1bRCAMs_9tojPziAqdKPXojfJ0EfmnNKG', email:'agustinpenonalvarez@gmail.com' },
  { tipo:'autoservicio',direccion:'Gervasio Méndez 2172',    ciudad:'Gualeguaychú', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1tTJP72sjs2qxhyoVui6IE-b3foqTc9l3', foto2:'https://drive.google.com/uc?export=view&id=1yPCKb_pXZoyZfEedSyCNdEz7x3Xg0Vt', email:'guillepombo5@gmail.com' },
  { tipo:'kiosco',      direccion:'Gerardo Yoya 49',         ciudad:'Concordia',   hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1UIJp74u6itst62oRCPW21R_R2hlT98dX', foto2:'https://drive.google.com/uc?export=view&id=1VcvsSplHj2-rhQS8_KGVb3qmyQyptj-r', email:'martinbiomega@gmail.com' },
  { tipo:'almacen',     direccion:'12 de octubre 95',        ciudad:'Rosario del tala', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=166AbRfuvzYvETCsJxGWIGHCujnhyL5bV', foto2:'https://drive.google.com/uc?export=view&id=1KIomoVawCQXveTMukrH2FJM1a3RkB2a0', email:'gdt.garciaj@gmail.com' },
  { tipo:'almacen',     direccion:'Urquiza al oeste parada 7', ciudad:'Gualeguaychú', hayGeorgalos:false, foto1:'https://drive.google.com/uc?export=view&id=1fgn1DcbSvceQy1qwD6y2jRhC-Fh0-IIu', foto2:'https://drive.google.com/uc?export=view&id=1TjwRKtF31OM0trBq0Gfcv8kz3AqkfNvr', email:'guillepombo5@gmail.com' },
  { tipo:'almacen',     direccion:'Balcarce y Lavandeira',   ciudad:'Villaguay',   hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1kMKIP7dVtl2HRrXxa8I6Er7wr5Fabs0C', foto2:'https://drive.google.com/uc?export=view&id=1VBsMGV8XatshccCMjEneh933o01esPBx', email:'camaralmiron@gmail.com' },
  { tipo:'kiosco',      direccion:'Larroque y pablo lorentz',ciudad:'Cdelu',       hayGeorgalos:false, foto1:'https://drive.google.com/uc?export=view&id=1CvUJiIFihacRAn6EvF_RjAVQGTO0p5Cx', foto2:'https://drive.google.com/uc?export=view&id=1MEeapmYGWaH2WBnK7V-HdJPIF15JYI8A', email:'agustinpenonalvarez@gmail.com' },
  { tipo:'autoservicio',direccion:'Av 9 de Julio 3590',      ciudad:'Chajari',     hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1j_ajNvd9GhFTdc03SJN8XFioHGFEBgXU', foto2:'https://drive.google.com/uc?export=view&id=1XPlmyhYOj3tTKt-nuiluhHpbIcfcrWDR', email:'josemenendezurruzola@gmail.com' },
  { tipo:'autoservicio',direccion:'Urquiza 1926',            ciudad:'Gualeguaychú', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1yegvQS0OakSN81VOqa2DpEgNwnpvcOdH', foto2:'https://drive.google.com/uc?export=view&id=1DNsGXwB0l53gZxJgktZzvwwYAUgAKcXy', email:'guillepombo5@gmail.com' },
  { tipo:'almacen',     direccion:'Av 9 de Julio 2770',      ciudad:'Chajari',     hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1nKuwiMV2gp8_jrDWMJBasW1-GoSCoaUE7', foto2:'https://drive.google.com/uc?export=view&id=1-GoSCoaUE7AJk8E7vnShcgZQtzeJl2W9', email:'josemenendezurruzola@gmail.com' },
  { tipo:'almacen',     direccion:'Paysandú 423',            ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1oFdSQyVOIqfJDTRqJVkOFBaW4d8v5UKh', foto2:'https://drive.google.com/uc?export=view&id=1kV6GEgvgx5JlRv1Q5JHTE7K3yLH8Wm3L', email:'malgormarisol@gmail.com' },
  { tipo:'kiosco',      direccion:'Tte Gutierrez 172',       ciudad:'San salvador', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1hrYrlArUxMZ8dAIEEE1qLe7I7lMmIrOs', foto2:'https://drive.google.com/uc?export=view&id=18iEEE1qLe7I7lMmIrOs1hrYrlArUxMZ8', email:'arraldegonzalo@gmail.com' },
  { tipo:'dietetica',   direccion:'Siburu y Av 9 de Julio',  ciudad:'Chajari',     hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1Rn6Dk9WxpY5lcQ10WGsoKBOSWEjhKuRN', foto2:'https://drive.google.com/uc?export=view&id=10WGsoKBOSWEjhKuRN1Rn6Dk9WxpY5lcQ', email:'josemenendezurruzola@gmail.com' },
  { tipo:'dietetica',   direccion:'Tte Gutierrez 240',       ciudad:'San salvador', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1bYmZQx1GXDTIaGwlDm7AISGOnKLxbYm', foto2:'https://drive.google.com/uc?export=view&id=1wlDm7AISGOnKLxbYmZQx1GXDTIaGwlDm', email:'arraldegonzalo@gmail.com' },
  { tipo:'almacen',     direccion:'Maipú 265',               ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1E_RsSPh_BdGfv_17kFVRXEtoQvPA_uXjv', foto2:'https://drive.google.com/uc?export=view&id=17kFVRXEtoQvPA_uXjvE_RsSPh_BdGfv_1', email:'' },
  { tipo:'almacen',     direccion:'Urquiza 1581',            ciudad:'Gualeguaychú', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1xYXh7LlB3asatK12ARon53IjMZg00gYx', foto2:'https://drive.google.com/uc?export=view&id=12ARon53IjMZg00gYx1xYXh7LlB3asatK1', email:'guillepombo5@gmail.com' },
  { tipo:'autoservicio',direccion:'3 de febrero 277',        ciudad:'San salvador', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1CHz7akyRZWsM6s11Kw4QlJ93ruPmG0Hz', foto2:'https://drive.google.com/uc?export=view&id=11Kw4QlJ93ruPmG0Hz1CHz7akyRZWsM6s1', email:'arraldegonzalo@gmail.com' },
  { tipo:'autoservicio',direccion:'Av malaria y bv concordia',ciudad:'San salvador',hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=174TUQAgGMtRgQm1zPbb5ixoehYCPdU74T', foto2:'https://drive.google.com/uc?export=view&id=1zPbb5ixoehYCPdU74TUQAgGMtRgQm1zPb', email:'arraldegonzalo@gmail.com' },
  { tipo:'autoservicio',direccion:'Tomas de rocamora 344',   ciudad:'San salvador', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1rQtHw1m9RysNaS16V3iTDtMHZiZ3irQtH', foto2:'https://drive.google.com/uc?export=view&id=16V3iTDtMHZiZ3irQtHw1m9RysNaS16V3i', email:'arraldegonzalo@gmail.com' },
  { tipo:'kiosco',      direccion:'Urquiza 49',              ciudad:'San salvador', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=13x9XWLfc0zpO3h1qCIvtNtpQlhL_n3x9X', foto2:'https://drive.google.com/uc?export=view&id=1qCIvtNtpQlhL_n3x9XWLfc0zpO3h1qCIv', email:'arraldegonzalo@gmail.com' },
  { tipo:'autoservicio',direccion:'Balbin 2132',             ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1vMPQRGvsfN6o1n1tSmG3cJIHFByQj1vMP', foto2:'https://drive.google.com/uc?export=view&id=1tSmG3cJIHFByQj1vMPQRGvsfN6o1ntSmG', email:'agustinpenonalvarez@gmail.com' },
  { tipo:'almacen',     direccion:'Moreno y Laprida',        ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1P3fVkRekldnYhu1UdNYXKmfhAnVtaP3fV', foto2:'https://drive.google.com/uc?export=view&id=1UdNYXKmfhAnVtaP3fVkRekldnYhu1UdNY', email:'' },
  { tipo:'autoservicio',direccion:'San Luis 274',            ciudad:'Gualeguaychú', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1wZ2fvA8HlIK8lV1qsHZ6NcUEBD6wlwZ2f', foto2:'https://drive.google.com/uc?export=view&id=1qsHZ6NcUEBD6wlwZ2fvA8HlIK8lV1qsHZ', email:'guillepombo5@gmail.com' },
  { tipo:'autoservicio',direccion:'Av sarmiento 151',        ciudad:'San salvador', hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1SYqNAbm6jLW36Y1rXjcdWGBwEhgOqSYqN', foto2:'https://drive.google.com/uc?export=view&id=1rXjcdWGBwEhgOqSYqNAbm6jLW36YrXjcd', email:'arraldegonzalo@gmail.com' },
  { tipo:'kiosco',      direccion:'Presidente Perón 247',    ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1JUkWQD0IDQIOsg1_WuLe_ndazDg67JUkW', foto2:'https://drive.google.com/uc?export=view&id=1_WuLe_ndazDg67JUkWQD0IDQIOsg1_WuL', email:'' },
  { tipo:'kiosco',      direccion:'Av sarmiento y san martín',ciudad:'San salvador',hayGeorgalos:true, foto1:'https://drive.google.com/uc?export=view&id=1fiWySDsFbwqN9B1eQJdMBfD_Nru-2fiWy', foto2:'https://drive.google.com/uc?export=view&id=1eQJdMBfD_Nru-2fiWySDsFbwqN9BeQJdM', email:'arraldegonzalo@gmail.com' },
  { tipo:'almacen',     direccion:'Piamonte 317',            ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=176rVb9lXw2eWYm1WbrQ_IW6IDVgOd76rV', foto2:'https://drive.google.com/uc?export=view&id=1WbrQ_IW6IDVgOd76rVb9lXw2eWYm1WbrQ', email:'' },
  { tipo:'almacen',     direccion:'Reborde 246',             ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=198doVzum64Dhuy1jddVL4v2EWzSwX98do', foto2:'https://drive.google.com/uc?export=view&id=1jddVL4v2EWzSwX98doVzum64Dhuy1jddV', email:'' },
  { tipo:'almacen',     direccion:'Bb. Ferrari y Rebord',    ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1qEog1bU5GGOaa21kCITYN39ib3zQzqEog', foto2:'https://drive.google.com/uc?export=view&id=1kCITYN39ib3zQzqEog1bU5GGOaa21kCIT', email:'malgormarisol@gmail.com' },
  { tipo:'almacen',     direccion:'Alberdi 1373',            ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1dhIXq4NqIvO3nW1M-RX76EJ4SpZ-sdhIX', foto2:'https://drive.google.com/uc?export=view&id=1M-RX76EJ4SpZ-sdhIXq4NqIvO3nW1M-RX', email:'' },
  { tipo:'autoservicio',direccion:'Alberdi y cabo Pereyra',  ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=17zT378I9h7d8Ms1gqot2EsNyQKzFL7zT3', foto2:'https://drive.google.com/uc?export=view&id=1gqot2EsNyQKzFL7zT378I9h7d8Ms1gqot', email:'malgormarisol@gmail.com' },
  { tipo:'almacen',     direccion:'Bv. Sanguinetti 146',     ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1vmX7mJfRP-gViN1llFaPhNfhlOTizvmX7', foto2:'https://drive.google.com/uc?export=view&id=1llFaPhNfhlOTizvmX7mJfRP-gViN1llFa', email:'malgormarisol@gmail.com' },
  { tipo:'kiosco',      direccion:'San Martin 552',          ciudad:'Colón',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1QDIokJSeOc4yYc1iZfPha_GCh01I6QDIo', foto2:'https://drive.google.com/uc?export=view&id=1iZfPha_GCh01I6QDIokJSeOc4yYc1iZfP', email:'malgormarisol@gmail.com' },
  { tipo:'autoservicio',direccion:'Balbin 335',              ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1kWG0nufg4LuIrd18DntcCulHXdhYTkWG0', foto2:'https://drive.google.com/uc?export=view&id=18DntcCulHXdhYTkWG0nufg4LuIrd18Dnt', email:'agustinpenonalvarez@gmail.com' },
  { tipo:'kiosco',      direccion:'Allais 2719',             ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=13W7NI2wcRZa_Re1l1ia34cVhVHV2G3W7N', foto2:'https://drive.google.com/uc?export=view&id=1l1ia34cVhVHV2G3W7NI2wcRZa_Re1l1ia', email:'agustinpenonalvarez@gmail.com' },
  { tipo:'almacen',     direccion:'Sarmiento 1730',          ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=1XM3ghitjZeT9jb1B2R2oI27cZlVPpXM3g', foto2:'https://drive.google.com/uc?export=view&id=1B2R2oI27cZlVPpXM3ghitjZeT9jb1B2R2', email:'agustinpenonalvarez@gmail.com' },
  { tipo:'almacen',     direccion:'Bv constituyentes 283',   ciudad:'Cdelu',       hayGeorgalos:true,  foto1:'https://drive.google.com/uc?export=view&id=17q1cBQQzGX5kyK1SZW9Snwut5igjB7q1c', foto2:'https://drive.google.com/uc?export=view&id=1SZW9Snwut5igjB7q1cBQQzGX5kyK1SZW9', email:'agustinpenonalvarez@gmail.com' },
]

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 GondolApp — Seed Demo Completo\n')

  await loadAuthUsers()

  // ════════════════════════════════════════════════════════════
  // PASO 1 — MARCAS
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 1: Marcas ────')
  const marcasDef = [
    { razon_social: 'Georgalos S.A.',     email: 'georgalos@demo.gondolapp.com' },
    { razon_social: 'ACME S.A.',          email: 'acme@demo.gondolapp.com'      },
    { razon_social: 'Suprante SRL',       email: 'suprante@demo.gondolapp.com'  },
    { razon_social: 'TecnoAlimentos SL',  email: 'tecno@demo.gondolapp.com'     },
  ]

  // Insertar marcas (buscar primero por razon_social)
  const marcaIds: Record<string, string> = {}
  for (const m of marcasDef) {
    const { data: exist } = await (db as any).from('marcas').select('id').eq('razon_social', m.razon_social).maybeSingle()
    let id: string
    if (exist) {
      id = exist.id
    } else {
      const { data: ins } = await (db as any).from('marcas').insert({ razon_social: m.razon_social, validada: true, tokens_disponibles: 5000 }).select('id').single()
      if (!ins) { console.warn(`  ⚠️  No se insertó marca ${m.razon_social}`); continue }
      id = ins.id; stats.marcas++
    }
    marcaIds[m.razon_social] = id
    // Asegurar tokens y validada
    await (db as any).from('marcas').update({ tokens_disponibles: 5000, validada: true }).eq('id', id)

    const uid = await getOrCreateUser(m.email, m.razon_social, 'marca')
    if (uid) {
      await (db as any).from('profiles').upsert({ id: uid, tipo_actor: 'marca', nombre: m.razon_social, marca_id: id }, { onConflict: 'id' })
    }
  }
  console.log(`  ✓ Marcas: ${Object.keys(marcaIds).join(', ')}`)

  // ════════════════════════════════════════════════════════════
  // PASO 2 — DISTRIBUIDORAS
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 2: Distribuidoras ────')
  const distrisDef = [
    { razon_social: 'Biomega S.A.',           email: 'biomega@demo.gondolapp.com'      },
    { razon_social: 'Distri Norte S.R.L.',    email: 'distrinorte@demo.gondolapp.com'  },
    { razon_social: 'Distribuidora Del Valle', email: 'distrivalle@demo.gondolapp.com' },
  ]

  const distriIds: Record<string, string> = {}
  for (const d of distrisDef) {
    const { data: exist } = await (db as any).from('distribuidoras').select('id').eq('razon_social', d.razon_social).maybeSingle()
    let id: string
    if (exist) {
      id = exist.id
    } else {
      const { data: ins } = await (db as any).from('distribuidoras').insert({ razon_social: d.razon_social, validada: true, tokens_disponibles: 500 }).select('id').single()
      if (!ins) { console.warn(`  ⚠️  No se insertó distri ${d.razon_social}`); continue }
      id = ins.id; stats.distris++
    }
    distriIds[d.razon_social] = id
    await (db as any).from('distribuidoras').update({ validada: true }).eq('id', id)
    const uid = await getOrCreateUser(d.email, d.razon_social, 'distribuidora')
    if (uid) {
      await (db as any).from('profiles').upsert({ id: uid, tipo_actor: 'distribuidora', nombre: d.razon_social, distri_id: id }, { onConflict: 'id' })
    }
  }
  console.log(`  ✓ Distribuidoras: ${Object.keys(distriIds).join(', ')}`)

  const biomegaId    = distriIds['Biomega S.A.']
  const distriNorteId = distriIds['Distri Norte S.R.L.']
  const distriValleId = distriIds['Distribuidora Del Valle']

  // ════════════════════════════════════════════════════════════
  // PASO 3 — REPOSITORAS
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 3: Repositoras ────')
  const reposDef = [
    { razon_social: 'RepoSur S.A.',  email: 'reposur@demo.gondolapp.com'  },
    { razon_social: 'RepoNorte SRL', email: 'reponorte@demo.gondolapp.com' },
  ]

  const repoIds: Record<string, string> = {}
  for (const r of reposDef) {
    const { data: exist } = await (db as any).from('repositoras').select('id').eq('razon_social', r.razon_social).maybeSingle()
    let id: string
    if (exist) {
      id = exist.id
    } else {
      const { data: ins } = await (db as any).from('repositoras').insert({ razon_social: r.razon_social, validada: true }).select('id').single()
      if (!ins) { console.warn(`  ⚠️  No se insertó repositora ${r.razon_social}`); continue }
      id = ins.id; stats.repos++
    }
    repoIds[r.razon_social] = id
    await (db as any).from('repositoras').update({ validada: true }).eq('id', id)
    const uid = await getOrCreateUser(r.email, r.razon_social, 'repositora')
    if (uid) {
      await (db as any).from('profiles').upsert({ id: uid, tipo_actor: 'repositora', nombre: r.razon_social, repositora_id: id }, { onConflict: 'id' })
    }
  }
  console.log(`  ✓ Repositoras: ${Object.keys(repoIds).join(', ')}`)

  const repoSurId   = repoIds['RepoSur S.A.']
  const repoNorteId = repoIds['RepoNorte SRL']
  const georgalosId = marcaIds['Georgalos S.A.']
  const acmeId      = marcaIds['ACME S.A.']
  const supranteId  = marcaIds['Suprante SRL']
  const tecnoId     = marcaIds['TecnoAlimentos SL']

  // ════════════════════════════════════════════════════════════
  // PASO 4 — RELACIONES
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 4: Relaciones ────')

  // marca_distri_relaciones
  const marcaDistriRels = [
    { marca_id: georgalosId, distri_id: biomegaId },
    { marca_id: acmeId,      distri_id: distriNorteId },
    { marca_id: supranteId,  distri_id: biomegaId },
    { marca_id: tecnoId,     distri_id: distriValleId },
    { marca_id: acmeId,      distri_id: biomegaId },
  ].filter(r => r.marca_id && r.distri_id)
  for (const r of marcaDistriRels) {
    await (db as any).from('marca_distri_relaciones')
      .upsert({ ...r, estado: 'activa', acepto_tyc_marca: true, acepto_tyc_distri: true }, { onConflict: 'marca_id,distri_id', ignoreDuplicates: true })
  }

  // marca_repo_relaciones
  const marcaRepoRels = [
    { marca_id: acmeId,     repositora_id: repoSurId   },
    { marca_id: supranteId, repositora_id: repoNorteId },
  ].filter(r => r.marca_id && r.repositora_id)
  for (const r of marcaRepoRels) {
    await (db as any).from('marca_repo_relaciones')
      .upsert({ ...r, estado: 'activa' }, { onConflict: 'marca_id,repositora_id', ignoreDuplicates: true })
  }

  // distri_repo_relaciones
  const distriRepoRels = [
    { distri_id: biomegaId,    repositora_id: repoSurId   },
    { distri_id: distriNorteId, repositora_id: repoNorteId },
  ].filter(r => r.distri_id && r.repositora_id)
  for (const r of distriRepoRels) {
    await (db as any).from('distri_repo_relaciones')
      .upsert({ ...r, estado: 'activa' }, { onConflict: 'distri_id,repositora_id', ignoreDuplicates: true })
  }

  stats.relaciones = marcaDistriRels.length + marcaRepoRels.length + distriRepoRels.length
  console.log(`  ✓ ${stats.relaciones} relaciones creadas`)

  // ════════════════════════════════════════════════════════════
  // PASO 5 — GONDOLEROS
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 5: Gondoleros ────')

  // Email del CSV → email demo y nombre
  const csvEmailToDemo: Record<string, { demo: string; nombre: string; distriId: string }> = {
    'agustinpenonalvarez@gmail.com': { demo: 'agustin@demo.gondolapp.com',   nombre: 'Agustín',   distriId: biomegaId },
    'raulyschanton@gmail.com':       { demo: 'raul@demo.gondolapp.com',      nombre: 'Raúl',      distriId: biomegaId },
    'arraldegonzalo@gmail.com':      { demo: 'gonzalo@demo.gondolapp.com',   nombre: 'Gonzalo',   distriId: biomegaId },
    'camaralmiron@gmail.com':        { demo: 'alejandro@demo.gondolapp.com', nombre: 'Alejandro', distriId: biomegaId },
    'gdt.garciaj@gmail.com':         { demo: 'juan@demo.gondolapp.com',      nombre: 'Juan',      distriId: biomegaId },
    'martinbiomega@gmail.com':       { demo: 'martin@demo.gondolapp.com',    nombre: 'Martín',    distriId: biomegaId },
    'guillepombo5@gmail.com':        { demo: 'guillermo@demo.gondolapp.com', nombre: 'Guillermo', distriId: biomegaId },
    'josemenendezurruzola@gmail.com':{ demo: 'jose@demo.gondolapp.com',      nombre: 'José',      distriId: biomegaId },
    'malgormarisol@gmail.com':       { demo: 'marisol@demo.gondolapp.com',   nombre: 'Marisol',   distriId: biomegaId },
    '':                              { demo: 'marisol@demo.gondolapp.com',   nombre: 'Marisol',   distriId: biomegaId }, // anónimos CSV → Marisol
  }

  // Gondolero 10: Mariano (no aparece en CSV)
  const gondolerosDef = [
    ...Object.values(csvEmailToDemo).filter((v, i, a) => a.findIndex(x => x.demo === v.demo) === i),
    { demo: 'mariano@demo.gondolapp.com', nombre: 'Mariano', distriId: biomegaId },
    // Ficticios adicionales
    { demo: 'carlos@demo.gondolapp.com',   nombre: 'Carlos',   distriId: distriNorteId },
    { demo: 'diana@demo.gondolapp.com',    nombre: 'Diana',    distriId: distriNorteId },
    { demo: 'eduardo@demo.gondolapp.com',  nombre: 'Eduardo',  distriId: distriNorteId },
    { demo: 'fernanda@demo.gondolapp.com', nombre: 'Fernanda', distriId: distriValleId },
    { demo: 'gabriel@demo.gondolapp.com',  nombre: 'Gabriel',  distriId: distriValleId },
    { demo: 'helena@demo.gondolapp.com',   nombre: 'Helena',   distriId: biomegaId },
    { demo: 'ignacio@demo.gondolapp.com',  nombre: 'Ignacio',  distriId: biomegaId },
    { demo: 'julia@demo.gondolapp.com',    nombre: 'Julia',    distriId: biomegaId },
  ]

  const gondoleroIds: Record<string, string> = {} // email demo → user_id
  for (const g of gondolerosDef) {
    const uid = await getOrCreateUser(g.demo, g.nombre, 'gondolero')
    if (!uid) continue
    gondoleroIds[g.demo] = uid
    await (db as any).from('profiles').upsert({
      id: uid, tipo_actor: 'gondolero', nombre: g.nombre,
      distri_id: g.distriId, nivel: 'activo',
      puntos_disponibles: 0, puntos_totales_ganados: 0,
    }, { onConflict: 'id' })
    if (g.distriId) {
      await (db as any).from('gondolero_distri_solicitudes')
        .upsert({ gondolero_id: uid, distri_id: g.distriId, estado: 'aprobada' }, { onConflict: 'gondolero_id,distri_id', ignoreDuplicates: true })
    }
    stats.gondoleros++
  }

  // Helper: csvEmail → gondolero user_id
  const csvEmailToUserId = (email: string): string => {
    const info = csvEmailToDemo[email] ?? csvEmailToDemo['']
    return gondoleroIds[info.demo] ?? ''
  }

  console.log(`  ✓ ${stats.gondoleros} gondoleros`)

  // ════════════════════════════════════════════════════════════
  // PASO 6 — FIXERS
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 6: Fixers ────')
  const fixersDef = [
    { email: 'pedro@demo.gondolapp.com',   nombre: 'Pedro',   repoId: repoSurId   },
    { email: 'laura@demo.gondolapp.com',   nombre: 'Laura',   repoId: repoSurId   },
    { email: 'miguel@demo.gondolapp.com',  nombre: 'Miguel',  repoId: repoSurId   },
    { email: 'ana@demo.gondolapp.com',     nombre: 'Ana',     repoId: repoNorteId },
    { email: 'roberto@demo.gondolapp.com', nombre: 'Roberto', repoId: repoNorteId },
    { email: 'claudia@demo.gondolapp.com', nombre: 'Claudia', repoId: repoNorteId },
  ]

  const fixerIds: string[] = []
  for (const f of fixersDef) {
    const uid = await getOrCreateUser(f.email, f.nombre, 'fixer')
    if (!uid) continue
    fixerIds.push(uid)
    await (db as any).from('profiles').upsert({
      id: uid, tipo_actor: 'fixer', nombre: f.nombre,
      repositora_id: f.repoId,
    }, { onConflict: 'id' })
    if (f.repoId) {
      await (db as any).from('fixer_repo_solicitudes')
        .upsert({ fixer_id: uid, repositora_id: f.repoId, estado: 'aprobada' }, { onConflict: 'fixer_id,repositora_id', ignoreDuplicates: true })
    }
    stats.fixers++
  }
  console.log(`  ✓ ${stats.fixers} fixers`)

  // ════════════════════════════════════════════════════════════
  // PASO 7 — COMERCIOS
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 7: Comercios ────')
  const csvRows = parseCsv()

  // Comercios del CSV
  const csvComercioIds: string[] = []
  const demoUserId = gondoleroIds['agustin@demo.gondolapp.com'] ?? null

  for (const row of csvRows) {
    const [baseLat, baseLng] = cityCoords(row.ciudad)
    const nombre = row.direccion.split(/[,\d]/)[0].trim().substring(0, 50) || row.direccion.substring(0, 50)
    const { data: exist } = await (db as any).from('comercios').select('id').eq('direccion', row.direccion).maybeSingle()
    let id: string
    if (exist) {
      id = exist.id
    } else {
      const { data: ins } = await (db as any).from('comercios').insert({
        nombre:          nombre,
        direccion:       row.direccion,
        tipo:            row.tipo,
        lat:             jitter(baseLat),
        lng:             jitter(baseLng),
        validado:        true,
        estado:          'activo',
        registrado_por:  demoUserId,
      }).select('id').single()
      if (!ins) { console.warn(`  ⚠️  No se pudo insertar comercio: ${row.direccion}`); csvComercioIds.push(''); continue }
      id = ins.id; stats.comercios++
    }
    csvComercioIds.push(id)
  }

  // Comercios ficticios — 15 en Córdoba + 15 en Rosario
  const ficticios = [
    ...Array.from({length: 15}, (_, i) => ({
      nombre: ['Almacén Don Pedro','Kiosco Central','Super Las Palmas','Almacén La Esquina','Kiosco El Sol',
                'Super Belgrano','Almacén Norte','Kiosco La Plaza','Super Mitre','Almacén Del Centro',
                'Kiosco Roca','Super La Familia','Almacén San Martín','Kiosco Las Flores','Super Rivadavia'][i],
      tipo:   ['almacen','kiosco','autoservicio','almacen','kiosco','autoservicio','almacen','kiosco','autoservicio','almacen','kiosco','autoservicio','almacen','kiosco','autoservicio'][i],
      ciudad: 'Córdoba', lat: jitter(-31.4135, 0.03), lng: jitter(-64.1811, 0.03),
    })),
    ...Array.from({length: 15}, (_, i) => ({
      nombre: ['Almacén Rosarino','Kiosco Sargento','Super Del Parque','Almacén La Ceiba','Kiosco Corrientes',
                'Super Pellegrini','Almacén Balcarce','Kiosco Santa Fe','Super Oroño','Almacén Zeballos',
                'Kiosco Moreno','Super Buenos Aires','Almacén Wheelwright','Kiosco Lavalle','Super Libertad'][i],
      tipo:   ['almacen','kiosco','autoservicio','almacen','kiosco','autoservicio','almacen','kiosco','autoservicio','almacen','kiosco','autoservicio','almacen','kiosco','autoservicio'][i],
      ciudad: 'Rosario', lat: jitter(-32.9442, 0.03), lng: jitter(-60.6505, 0.03),
    })),
  ]

  const ficticiosIds: string[] = []
  for (const c of ficticios) {
    const { data: exist } = await (db as any).from('comercios').select('id').eq('nombre', c.nombre).eq('ciudad' as any, c.ciudad).maybeSingle()
    let id: string
    if (exist) {
      id = exist.id
    } else {
      const { data: ins } = await (db as any).from('comercios').insert({
        nombre: c.nombre, tipo: c.tipo, lat: c.lat, lng: c.lng,
        validado: true, estado: 'activo',
        registrado_por: demoUserId,
      }).select('id').single()
      if (!ins) { ficticiosIds.push(''); continue }
      id = ins.id; stats.comercios++
    }
    ficticiosIds.push(id)
  }

  console.log(`  ✓ ${stats.comercios} comercios nuevos (${csvRows.length} CSV + ${ficticios.length} ficticios)`)

  // ════════════════════════════════════════════════════════════
  // PASO 8 — CAMPAÑA 1: Relevamiento real Georgalos (CERRADA)
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 8: Campaña 1 — Relevamiento Georgalos (cerrada) ────')
  const { data: campana1Exist } = await (db as any).from('campanas').select('id').eq('nombre', 'Relevamiento snacks · Entre Ríos Q1 2026').maybeSingle()
  let campana1Id: string

  if (campana1Exist) {
    campana1Id = campana1Exist.id
    console.log('  → Campaña 1 ya existe')
  } else {
    const { data: c1 } = await (db as any).from('campanas').insert({
      nombre:              'Relevamiento snacks · Entre Ríos Q1 2026',
      tipo:                'relevamiento',
      actor_campana:       'gondolero',
      estado:              'cerrada',
      financiada_por:      'marca',
      fecha_inicio:        '2026-03-11',
      fecha_fin:           '2026-03-14',
      puntos_por_mision:   100,
      marca_id:            georgalosId,
      distri_id:           biomegaId,
      tope_total_comercios: csvRows.length,
      comercios_relevados: csvRows.length,
    }).select('id').single()
    campana1Id = c1?.id
    stats.campanas++
  }

  if (campana1Id) {
    // Bloque foto para campana 1
    const { data: b1Exist } = await (db as any).from('bloques_foto').select('id').eq('campana_id', campana1Id).order('orden').limit(1).maybeSingle()
    let bloque1aId: string, bloque1bId: string

    if (b1Exist) {
      bloque1aId = b1Exist.id
      const { data: b2 } = await (db as any).from('bloques_foto').select('id').eq('campana_id', campana1Id).order('orden').limit(2)
      bloque1bId = b2?.[1]?.id ?? bloque1aId
    } else {
      const { data: ba } = await (db as any).from('bloques_foto').insert({ campana_id: campana1Id, orden: 1, instruccion: 'Fotografiá la góndola completa', tipo_contenido: 'ambos' }).select('id').single()
      const { data: bb } = await (db as any).from('bloques_foto').insert({ campana_id: campana1Id, orden: 2, instruccion: 'Fotografiá los productos Georgalos', tipo_contenido: 'propios' }).select('id').single()
      bloque1aId = ba?.id; bloque1bId = bb?.id ?? ba?.id
    }

    // Participaciones por gondolero
    const partMap = new Map<string, { id: string; count: number }>()
    // Misiones + fotos
    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i]
      const comercioId = csvComercioIds[i]
      if (!comercioId) continue
      const gondoleroId = csvEmailToUserId(row.email)
      if (!gondoleroId) continue

      // Participación
      if (!partMap.has(gondoleroId)) {
        const { data: pExist } = await (db as any).from('participaciones').select('id, comercios_completados').eq('campana_id', campana1Id).eq('gondolero_id', gondoleroId).maybeSingle()
        if (pExist) {
          partMap.set(gondoleroId, { id: pExist.id, count: pExist.comercios_completados ?? 0 })
        } else {
          const { data: pIns } = await (db as any).from('participaciones').insert({ campana_id: campana1Id, gondolero_id: gondoleroId, estado: 'completada', comercios_completados: 0, puntos_acumulados: 0 }).select('id').single()
          partMap.set(gondoleroId, { id: pIns?.id, count: 0 })
        }
      }

      // Misión
      const { data: mExist } = await (db as any).from('misiones').select('id').eq('campana_id', campana1Id).eq('comercio_id', comercioId).eq('gondolero_id', gondoleroId).maybeSingle()
      let misionId: string
      if (mExist) {
        misionId = mExist.id
      } else {
        const { data: mIns } = await (db as any).from('misiones').insert({
          campana_id: campana1Id, comercio_id: comercioId, gondolero_id: gondoleroId,
          estado: 'aprobada', puntos_total: 100, bounty_estado: 'acreditado',
        }).select('id').single()
        misionId = mIns?.id
        if (misionId) stats.misiones++
      }
      if (!misionId) continue

      // Fotos
      for (const [url, bloqueId] of [[row.foto1, bloque1aId], [row.foto2, bloque1bId]] as [string, string][]) {
        if (!url || url.includes('undefined')) continue
        const { data: fExist } = await (db as any).from('fotos').select('id').eq('mision_id', misionId).eq('bloque_id', bloqueId).maybeSingle()
        if (!fExist) {
          await (db as any).from('fotos').insert({
            campana_id: campana1Id, bloque_id: bloqueId, gondolero_id: gondoleroId,
            comercio_id: comercioId, mision_id: misionId,
            url, storage_path: `seed/${misionId}/${bloqueId}.jpg`,
            lat: jitter(-32.4, 0.05), lng: jitter(-58.2, 0.05),
            timestamp_dispositivo: '2026-03-11T10:00:00Z',
            device_id: 'seed-device',
            estado: 'aprobada', puntos_otorgados: 50, bounty_estado: 'acreditado',
          })
          stats.fotos++
        }
      }

      // Actualizar participación count
      const part = partMap.get(gondoleroId)!
      part.count++
    }

    // Actualizar participaciones con conteos finales
    for (const [gId, p] of partMap.entries()) {
      await (db as any).from('participaciones').update({ comercios_completados: p.count, puntos_acumulados: p.count * 100 }).eq('id', p.id)
    }
    console.log(`  ✓ Campaña 1: ${stats.misiones} misiones, ${stats.fotos} fotos`)
  }

  // ════════════════════════════════════════════════════════════
  // PASO 9 — CAMPAÑA 2: Auditoría precios (ACTIVA)
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 9: Campaña 2 — Auditoría precios Mantecol (activa) ────')
  await crearCampanaConMisiones({
    campana: {
      nombre: 'Auditoría precios Mantecol - Q2 2026',
      tipo: 'precio', actor_campana: 'gondolero', estado: 'activa',
      financiada_por: 'marca', fecha_inicio: '2026-04-01', fecha_fin: '2026-04-30',
      puntos_por_mision: 150, marca_id: georgalosId, distri_id: biomegaId,
      tope_total_comercios: 50, comercios_relevados: 23,
    },
    bloque: { instruccion: 'Fotografiá el producto con el precio visible', tipo_contenido: 'propios' },
    campos: [{ tipo: 'numero', pregunta: '¿Cuál es el precio del Mantecol?', obligatorio: true, orden: 1 }],
    misiones: 23,
    gondolerosPool: Object.values(gondoleroIds).filter((_, i) => i < 10).filter(Boolean),
    comerciosPool:  csvComercioIds.filter(Boolean).slice(0, 40),
    fotoUrlFn: (n) => `https://picsum.photos/seed/precio${n}/800/600`,
    puntosXMision: 150,
    respuestasFn: (campoId) => [{ campo_id: campoId, valor: String(Math.floor(rnd(1800, 5800))) }],
  })
  console.log('  ✓ Campaña 2 OK')

  // ════════════════════════════════════════════════════════════
  // PASO 10 — CAMPAÑA 3: Relevamiento ACME (ACTIVA)
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 10: Campaña 3 — Relevamiento ACME (activa) ────')
  const distriNorteGondoleros = [
    gondoleroIds['carlos@demo.gondolapp.com'],
    gondoleroIds['diana@demo.gondolapp.com'],
    gondoleroIds['eduardo@demo.gondolapp.com'],
  ].filter(Boolean)
  await crearCampanaConMisiones({
    campana: {
      nombre: 'Relevamiento ACME - Entre Ríos',
      tipo: 'relevamiento', actor_campana: 'gondolero', estado: 'activa',
      financiada_por: 'marca', puntos_por_mision: 120,
      marca_id: acmeId, distri_id: distriNorteId,
      tope_total_comercios: 40, comercios_relevados: 12,
    },
    bloque: { instruccion: 'Fotografiá la sección ACME en góndola', tipo_contenido: 'propios' },
    campos: [],
    misiones: 12,
    gondolerosPool: distriNorteGondoleros,
    comerciosPool:  ficticiosIds.slice(0, 20).filter(Boolean),
    fotoUrlFn: (n) => `https://picsum.photos/seed/acme${n}/800/600`,
    puntosXMision: 120,
  })
  console.log('  ✓ Campaña 3 OK')

  // ════════════════════════════════════════════════════════════
  // PASO 11 — CAMPAÑA 4: Encuesta presencia Suprante (ACTIVA con preguntas)
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 11: Campaña 4 — Encuesta Suprante (activa) ────')
  const biomegaGondoleros10 = Object.values(gondoleroIds).filter((_, i) => i < 10).filter(Boolean)
  await crearCampanaConMisiones({
    campana: {
      nombre: 'Encuesta presencia Suprante',
      tipo: 'relevamiento', actor_campana: 'gondolero', estado: 'activa',
      financiada_por: 'marca', puntos_por_mision: 80,
      marca_id: supranteId, distri_id: biomegaId,
    },
    bloque: { instruccion: 'Completá la encuesta de presencia y sacá foto de la góndola', tipo_contenido: 'ambos' },
    campos: [
      { tipo: 'binaria',            pregunta: '¿Hay productos Suprante en góndola?',         obligatorio: true,  orden: 1 },
      { tipo: 'numero',             pregunta: '¿Cuántos facings tiene Suprante?',             obligatorio: false, orden: 2 },
      { tipo: 'seleccion_multiple', pregunta: '¿Qué competidores están presentes?',          obligatorio: false, orden: 3, opciones: ['Arcor','Molinos','Georgalos','Otros'] },
      { tipo: 'foto',               pregunta: 'Sacá foto de la góndola',                     obligatorio: true,  orden: 4 },
    ],
    misiones: 8,
    gondolerosPool: biomegaGondoleros10,
    comerciosPool:  csvComercioIds.filter(Boolean).slice(10, 30),
    fotoUrlFn: (n) => `https://picsum.photos/seed/suprante${n}/800/600`,
    puntosXMision: 80,
    respuestasFn: (campoId, orden) => {
      if (orden === 1) return [{ campo_id: campoId, valor: Math.random() > 0.3 ? 'si' : 'no' }]
      if (orden === 2) return [{ campo_id: campoId, valor: String(Math.floor(rnd(1, 6))) }]
      if (orden === 3) return [{ campo_id: campoId, valor: JSON.stringify(['Arcor', 'Georgalos'].slice(0, Math.ceil(rnd(1, 3)))) }]
      return []
    },
  })
  console.log('  ✓ Campaña 4 OK')

  // ════════════════════════════════════════════════════════════
  // PASO 12 — CAMPAÑA 5: Alta comercios (ACTIVA tipo COMERCIOS)
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 12: Campaña 5 — Alta comercios zona norte ────')
  const { data: c5Exist } = await (db as any).from('campanas').select('id').eq('nombre', 'Alta comercios zona norte').maybeSingle()
  if (!c5Exist) {
    const { data: c5 } = await (db as any).from('campanas').insert({
      nombre: 'Alta comercios zona norte',
      tipo: 'comercios', actor_campana: 'gondolero', estado: 'activa',
      financiada_por: 'gondolapp', puntos_por_mision: 200,
      min_comercios_para_cobrar: 3,
    }).select('id').single()
    if (c5?.id) {
      stats.campanas++
      const { data: b5 } = await (db as any).from('bloques_foto').insert({ campana_id: c5.id, orden: 1, instruccion: 'Fotografiá la fachada del comercio', tipo_contenido: 'ambos' }).select('id').single()
      // 5 comercios pendiente_validacion
      for (let i = 0; i < 5; i++) {
        const gId = Object.values(gondoleroIds)[i % Object.values(gondoleroIds).length]
        const [baseLat, baseLng] = cityCoords('Concordia')
        const { data: newComercio } = await (db as any).from('comercios').insert({
          nombre: `Comercio Nuevo ${i + 1}`,
          tipo: ['almacen','kiosco','autoservicio','almacen','kiosco'][i],
          lat: jitter(baseLat), lng: jitter(baseLng),
          validado: false, estado: 'pendiente_validacion',
          registrado_por: gId,
        }).select('id').single()
        if (!newComercio || !gId) continue
        const { data: m } = await (db as any).from('misiones').insert({
          campana_id: c5.id, comercio_id: newComercio.id, gondolero_id: gId,
          estado: 'pendiente', puntos_total: 200, bounty_estado: 'retenido',
        }).select('id').single()
        if (m?.id && b5?.id) {
          await (db as any).from('fotos').insert({
            campana_id: c5.id, bloque_id: b5.id, gondolero_id: gId,
            comercio_id: newComercio.id, mision_id: m.id,
            url: `https://picsum.photos/seed/altacomer${i}/400/300`,
            storage_path: `seed/${m.id}/fachada.jpg`,
            lat: jitter(baseLat), lng: jitter(baseLng),
            timestamp_dispositivo: '2026-04-10T12:00:00Z',
            device_id: 'seed-device',
            estado: 'pendiente', puntos_otorgados: 200, bounty_estado: 'retenido',
          })
          stats.misiones++; stats.fotos++
        }
      }
    }
  }
  console.log('  ✓ Campaña 5 OK')

  // ════════════════════════════════════════════════════════════
  // PASO 13 — CAMPAÑA 6: Auditoría exhibidores fixers (ACTIVA)
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 13: Campaña 6 — Auditoría exhibidores ACME (fixers) ────')
  const fixersSurIds = fixersDef.filter(f => f.repoId === repoSurId).map(f => gondoleroIds[f.email] ?? fixerIds[fixersDef.findIndex(x => x.email === f.email)])
  // Note: fixers don't have gondoleroIds, they have separate auth but same approach
  const allFixerIds = (await (db as any).from('profiles').select('id').eq('tipo_actor', 'fixer').eq('repositora_id', repoSurId)).data?.map((p: any) => p.id) ?? []

  await crearCampanaFixers({
    campana: {
      nombre: 'Auditoría exhibidores ACME',
      tipo: 'pop', actor_campana: 'fixer', estado: 'activa',
      financiada_por: 'marca', puntos_por_mision: 300,
      marca_id: acmeId, repositora_id: repoSurId,
    },
    misiones: 10,
    fixersPool: allFixerIds,
    comerciosPool: csvComercioIds.filter(Boolean).slice(30, 50),
    fotoUrlFn: (n) => `https://picsum.photos/seed/fixer${n}/800/600`,
  })
  console.log('  ✓ Campaña 6 OK')

  // ════════════════════════════════════════════════════════════
  // PASO 14 — CAMPAÑA 7: POP Suprante fixers (CERRADA)
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 14: Campaña 7 — POP Suprante RepoNorte (cerrada) ────')
  const allFixerNorteIds = (await (db as any).from('profiles').select('id').eq('tipo_actor', 'fixer').eq('repositora_id', repoNorteId)).data?.map((p: any) => p.id) ?? []
  await crearCampanaFixers({
    campana: {
      nombre: 'Campaña POP Suprante - Q1 2026',
      tipo: 'pop', actor_campana: 'fixer', estado: 'cerrada',
      financiada_por: 'marca', puntos_por_mision: 250,
      marca_id: supranteId, repositora_id: repoNorteId,
      fecha_inicio: '2026-02-01', fecha_fin: '2026-03-31',
    },
    misiones: 15,
    fixersPool: allFixerNorteIds,
    comerciosPool: ficticiosIds.slice(15, 30).filter(Boolean),
    fotoUrlFn: (n) => `https://picsum.photos/seed/suprfixer${n}/800/600`,
  })
  console.log('  ✓ Campaña 7 OK')

  // ════════════════════════════════════════════════════════════
  // PASO 15 — CAMPAÑA 8: TecnoAlimentos borrador
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 15: Campaña 8 — TecnoAlimentos (borrador) ────')
  const { data: c8Exist } = await (db as any).from('campanas').select('id').eq('nombre', 'Auditoría precios TecnoAlimentos').maybeSingle()
  if (!c8Exist) {
    await (db as any).from('campanas').insert({
      nombre: 'Auditoría precios TecnoAlimentos',
      tipo: 'precio', actor_campana: 'gondolero', estado: 'borrador',
      financiada_por: 'marca', marca_id: tecnoId, distri_id: distriValleId,
    })
    stats.campanas++
  }
  console.log('  ✓ Campaña 8 OK')

  // ════════════════════════════════════════════════════════════
  // PASO 16 — PUNTOS Y GAMIFICACIÓN
  // ════════════════════════════════════════════════════════════
  console.log('\n──── PASO 16: Puntos y gamificación ────')

  // Calcular puntos por gondolero desde misiones aprobadas
  const { data: misionesAprobadas } = await (db as any).from('misiones')
    .select('gondolero_id, puntos_total')
    .eq('estado', 'aprobada')
    .eq('bounty_estado', 'acreditado')

  const puntosMap = new Map<string, number>()
  for (const m of (misionesAprobadas ?? [])) {
    puntosMap.set(m.gondolero_id, (puntosMap.get(m.gondolero_id) ?? 0) + (m.puntos_total ?? 0))
  }

  for (const [gondoleroId, puntos] of puntosMap.entries()) {
    const { data: existMov } = await (db as any).from('movimientos_puntos').select('id').eq('gondolero_id', gondoleroId).eq('tipo', 'credito').eq('concepto', 'Seed demo — misiones aprobadas').maybeSingle()
    if (!existMov) {
      await (db as any).from('movimientos_puntos').insert({
        gondolero_id: gondoleroId,
        tipo: 'credito',
        monto: puntos,
        concepto: 'Seed demo — misiones aprobadas',
      })
      stats.puntos++
    }
    // Nivel según puntos
    const nivel = puntos >= 1500 ? 'pro' : puntos >= 500 ? 'activo' : 'casual'
    await (db as any).from('profiles').update({
      puntos_disponibles: puntos,
      puntos_totales_ganados: puntos,
      nivel,
    }).eq('id', gondoleroId)
  }

  // Logros para gondoleros con misiones
  const logrosCandidatos: Array<{ gondolero_id: string; logro_clave: string }> = []
  for (const [gId, puntos] of puntosMap.entries()) {
    // primera_foto: todos los que tienen al menos 1 foto aprobada
    logrosCandidatos.push({ gondolero_id: gId, logro_clave: 'primera_foto' })
    // primera_campana: todos los que tienen al menos 1 mision
    logrosCandidatos.push({ gondolero_id: gId, logro_clave: 'primera_campana' })
    // explorador: 10+ comercios
    const misionCount = puntosMap.get(gId)! / 100 // aprox
    if (misionCount >= 10) logrosCandidatos.push({ gondolero_id: gId, logro_clave: 'explorador' })
    if (misionCount >= 10) logrosCandidatos.push({ gondolero_id: gId, logro_clave: 'decacampeon' })
  }

  for (const l of logrosCandidatos) {
    await (db as any).from('gondolero_logros')
      .upsert({ ...l, desbloqueado_at: new Date().toISOString() }, { onConflict: 'gondolero_id,logro_clave', ignoreDuplicates: true })
  }

  console.log(`  ✓ Puntos actualizados para ${puntosMap.size} gondoleros`)
  console.log(`  ✓ ${logrosCandidatos.length} logros procesados`)

  // ════════════════════════════════════════════════════════════
  // PASO 17 — ZONAS DE LAS CAMPAÑAS (campana_localidades)
  // ════════════════════════════════════════════════════════════
  // Agregado el 7/9/2026. Antes el seed no poblaba esta tabla, y con
  // campana_localidades vacía el filtro por zona de
  // app/(gondolero)/gondolero/campanas/page.tsx queda inerte: trata a toda
  // campaña sin zona como "abierta por defecto", así que todos los gondoleros
  // ven todas las campañas.
  //
  // La localidad de una campaña se deriva de los comercios efectivamente
  // relevados en ella. Es el dato más fiel — dice dónde se trabajó — y sirve
  // igual para Entre Ríos, Córdoba o Rosario sin lógica por provincia.
  //
  // Requiere que los comercios tengan localidad_id. Si venís de una
  // restauración, corré antes fix-localidad-comercios.mjs; si no, esta tabla
  // queda a medias y el paso lo avisa.
  console.log('\n──── PASO 17: Zonas de las campañas ────')

  const { data: misionesConComercio } = await (db as any)
    .from('misiones')
    .select('campana_id, comercio_id')

  const comercioIds = [...new Set((misionesConComercio ?? []).map((m: any) => m.comercio_id).filter(Boolean))]
  const localidadPorComercio = new Map<string, number>()
  if (comercioIds.length) {
    const { data: comerciosLoc } = await (db as any)
      .from('comercios')
      .select('id, localidad_id')
      .in('id', comercioIds)
    for (const c of comerciosLoc ?? []) {
      if (c.localidad_id != null) localidadPorComercio.set(c.id, c.localidad_id)
    }
  }

  const paresCampanaLocalidad = new Set<string>()
  let sinLocalidad = 0
  for (const m of misionesConComercio ?? []) {
    const loc = localidadPorComercio.get(m.comercio_id)
    if (loc == null) { sinLocalidad++; continue }
    paresCampanaLocalidad.add(`${m.campana_id}|${loc}`)
  }

  let zonasOk = 0
  for (const par of paresCampanaLocalidad) {
    const [campanaId, locStr] = par.split('|')
    const { error } = await (db as any)
      .from('campana_localidades')
      .upsert(
        { campana_id: campanaId, localidad_id: Number(locStr) },
        { onConflict: 'campana_id,localidad_id', ignoreDuplicates: true }
      )
    if (!error) zonasOk++
  }

  console.log(`  ✓ ${zonasOk} pares campaña→localidad asignados`)
  if (sinLocalidad > 0) {
    console.log(`  ⚠️  ${sinLocalidad} misiones con comercio sin localidad_id — corré fix-localidad-comercios.mjs y volvé a correr este paso`)
  }

  // ════════════════════════════════════════════════════════════
  // RESUMEN
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(55))
  console.log('✅ SEED COMPLETADO')
  console.log('═'.repeat(55))
  console.log(`  Marcas:        ${stats.marcas} nuevas`)
  console.log(`  Distris:       ${stats.distris} nuevas`)
  console.log(`  Repositoras:   ${stats.repos} nuevas`)
  console.log(`  Usuarios auth: ${stats.usuarios} nuevos`)
  console.log(`  Gondoleros:    ${stats.gondoleros}`)
  console.log(`  Fixers:        ${stats.fixers}`)
  console.log(`  Relaciones:    ${stats.relaciones}`)
  console.log(`  Comercios:     ${stats.comercios} nuevos`)
  console.log(`  Campañas:      ${stats.campanas} nuevas`)
  console.log(`  Misiones:      ${stats.misiones} nuevas`)
  console.log(`  Fotos:         ${stats.fotos} nuevas`)
  console.log(`  Créditos pts:  ${stats.puntos}`)
  console.log('═'.repeat(55))
  console.log('\nCredenciales: email = *@demo.gondolapp.com | password = Demo1234!\n')
}

// ── Helper: crear campaña gondolero con misiones ──────────────────────────────
async function crearCampanaConMisiones({
  campana, bloque, campos, misiones, gondolerosPool, comerciosPool,
  fotoUrlFn, puntosXMision, respuestasFn,
}: {
  campana: Record<string, any>
  bloque: Record<string, any>
  campos: Array<{ tipo: string; pregunta: string; obligatorio: boolean; orden: number; opciones?: string[] }>
  misiones: number
  gondolerosPool: string[]
  comerciosPool: string[]
  fotoUrlFn: (n: number) => string
  puntosXMision: number
  respuestasFn?: (campoId: string, orden: number) => Array<{ campo_id: string; valor: any }>
}) {
  const { data: exist } = await (db as any).from('campanas').select('id').eq('nombre', campana.nombre).maybeSingle()
  if (exist) return
  const { data: c } = await (db as any).from('campanas').insert(campana).select('id').single()
  if (!c?.id) return
  stats.campanas++
  const { data: b } = await (db as any).from('bloques_foto').insert({ campana_id: c.id, orden: 1, ...bloque }).select('id').single()
  if (!b?.id) return

  const campoIds: Array<{ id: string; orden: number }> = []
  for (const campo of campos) {
    const { data: cf } = await (db as any).from('bloque_campos').insert({
      bloque_id: b.id, tipo: campo.tipo, pregunta: campo.pregunta,
      obligatorio: campo.obligatorio, orden: campo.orden,
      opciones: campo.opciones ?? null,
    }).select('id').single()
    if (cf?.id) campoIds.push({ id: cf.id, orden: campo.orden })
  }

  for (let i = 0; i < misiones; i++) {
    const gondoleroId = gondolerosPool[i % gondolerosPool.length]
    const comercioId  = comerciosPool[i % comerciosPool.length]
    if (!gondoleroId || !comercioId) continue

    const { data: m } = await (db as any).from('misiones').insert({
      campana_id: c.id, comercio_id: comercioId, gondolero_id: gondoleroId,
      estado: 'aprobada', puntos_total: puntosXMision, bounty_estado: 'acreditado',
    }).select('id').single()
    if (!m?.id) continue
    stats.misiones++

    const { data: f } = await (db as any).from('fotos').insert({
      campana_id: c.id, bloque_id: b.id, gondolero_id: gondoleroId,
      comercio_id: comercioId, mision_id: m.id,
      url: fotoUrlFn(i),
      storage_path: `seed/${c.id}/${i}.jpg`,
      lat: -32.4 + rnd(-0.1, 0.1), lng: -58.2 + rnd(-0.1, 0.1),
      timestamp_dispositivo: '2026-04-05T10:00:00Z', device_id: 'seed-device',
      estado: 'aprobada', puntos_otorgados: puntosXMision, bounty_estado: 'acreditado',
    }).select('id').single()
    if (f?.id) stats.fotos++

    // Respuestas
    if (respuestasFn && campoIds.length > 0) {
      for (const cp of campoIds) {
        const respuestas = respuestasFn(cp.id, cp.orden)
        for (const r of respuestas) {
          if (f?.id) { try { await (db as any).from('foto_respuestas').insert({ foto_id: f.id, campo_id: r.campo_id, valor: r.valor }) } catch {} }
          try { await (db as any).from('mision_respuestas').insert({ mision_id: m.id, campo_id: r.campo_id, valor: r.valor }) } catch {}
        }
      }
    }

    // Participación
    await (db as any).from('participaciones').upsert({
      campana_id: c.id, gondolero_id: gondoleroId,
      estado: 'activa', comercios_completados: 1, puntos_acumulados: puntosXMision,
    }, { onConflict: 'campana_id,gondolero_id', ignoreDuplicates: true })
  }
}

// ── Helper: crear campaña de fixers ──────────────────────────────────────────
async function crearCampanaFixers({
  campana, misiones, fixersPool, comerciosPool, fotoUrlFn,
}: {
  campana: Record<string, any>
  misiones: number
  fixersPool: string[]
  comerciosPool: string[]
  fotoUrlFn: (n: number) => string
}) {
  const { data: exist } = await (db as any).from('campanas').select('id').eq('nombre', campana.nombre).maybeSingle()
  if (exist) return
  const { data: c } = await (db as any).from('campanas').insert(campana).select('id').single()
  if (!c?.id) return
  stats.campanas++
  const { data: b } = await (db as any).from('bloques_foto').insert({ campana_id: c.id, orden: 1, instruccion: 'Fotografiá el exhibidor antes y después', tipo_contenido: 'propios' }).select('id').single()
  if (!b?.id) return

  const pool = fixersPool.length ? fixersPool : [null]
  for (let i = 0; i < misiones; i++) {
    const fixerId    = pool[i % pool.length]
    const comercioId = comerciosPool[i % comerciosPool.length]
    if (!fixerId || !comercioId) continue

    const { data: m } = await (db as any).from('misiones').insert({
      campana_id: c.id, comercio_id: comercioId, gondolero_id: fixerId,
      estado: campana.estado === 'cerrada' ? 'aprobada' : 'aprobada',
      puntos_total: campana.puntos_por_mision, bounty_estado: 'acreditado',
    }).select('id').single()
    if (!m?.id) continue
    stats.misiones++

    await (db as any).from('fotos').insert({
      campana_id: c.id, bloque_id: b.id, gondolero_id: fixerId,
      comercio_id: comercioId, mision_id: m.id,
      url: fotoUrlFn(i),
      storage_path: `seed/${c.id}/fixer${i}.jpg`,
      lat: -32.4 + rnd(-0.1, 0.1), lng: -58.2 + rnd(-0.1, 0.1),
      timestamp_dispositivo: '2026-03-15T09:00:00Z', device_id: 'seed-fixer',
      estado: 'aprobada', puntos_otorgados: campana.puntos_por_mision, bounty_estado: 'acreditado',
    })
    stats.fotos++
  }
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err)
  process.exit(1)
})
