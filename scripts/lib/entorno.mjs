// =============================================================================
// entorno.mjs — resolución explícita del proyecto Supabase para los scripts
// =============================================================================
// Todo script que ESCRIBA datos tiene que pasar por acá.
//
// EL PROBLEMA QUE RESUELVE
// Antes cada script hacía dotenv.config({ path: '.env.local' }) y usaba lo que
// hubiera ahí. El comando no decía a qué base apuntaba: la respuesta estaba en
// un archivo que no ves al escribirlo. Y para trabajar contra dev había que
// editar .env.local y volver a dejarlo como estaba — exactamente el tipo de
// maniobra que termina en un DROP SCHEMA sobre producción.
//
// CÓMO LO RESUELVE
// 1. El objetivo se declara en el comando: --ref <project-ref>, obligatorio y
//    sin default. Un default convierte un olvido en un accidente.
// 2. Las credenciales se buscan POR ref, no al revés: se escanean todos los
//    .env*.local, se extrae el ref real de cada uno y se usa el que coincide.
//    Da igual qué archivo tenga qué; editar .env.local deja de ser necesario.
// 3. El ref se valida contra DOS señales independientes: el host de
//    NEXT_PUBLIC_SUPABASE_URL y el claim `ref` del JWT de la service_role. Eso
//    detecta el caso traicionero de un archivo con la URL de un proyecto y la
//    key de otro, que ninguna validación de un solo lado agarra.
// 4. Producción exige además GONDOLAPP_PROD=1. Dev no exige nada: el camino
//    peligroso pide dos actos deliberados, el cotidiano ninguno.
//
// Nunca imprime claves.
// =============================================================================

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Refs conocidos. Lo que NO esté acá se trata como producción: ante la duda,
// el default seguro es pedir la confirmación extra, no saltearla.
const ENTORNOS_CONOCIDOS = {
  xzznzustgsacmfwsupux: 'produccion',
  mqeymmprvpclpyjpujvf: 'dev',
}

function salirCon(mensaje) {
  console.error(`\n✗ ${mensaje}\n`)
  process.exit(1)
}

/** Parser de .env sin dependencias: una sola ruta de código para .ts y .mjs. */
function leerEnv(ruta) {
  const vars = {}
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const t = linea.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return vars
}

/** Ref según el host: https://<ref>.supabase.co */
function refDesdeUrl(url) {
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null
}

/** Ref según el claim del JWT de la service_role. No expone la clave. */
function refDesdeJwt(key) {
  try {
    const payload = key?.split('.')[1]
    if (!payload) return null
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json).ref ?? null
  } catch {
    return null
  }
}

/** Todos los .env*.local de la raíz, con el ref que declara cada uno. */
function candidatos() {
  return readdirSync(RAIZ)
    .filter((f) => /^\.env.*\.local$/.test(f))
    .map((archivo) => {
      const ruta = join(RAIZ, archivo)
      if (!existsSync(ruta)) return null
      const vars = leerEnv(ruta)
      const url = vars.NEXT_PUBLIC_SUPABASE_URL
      const key = vars.SUPABASE_SERVICE_ROLE_KEY
      return { archivo, url, key, refUrl: refDesdeUrl(url), refJwt: refDesdeJwt(key) }
    })
    .filter(Boolean)
}

/** Nombre del entorno. Lo desconocido se trata como producción. */
export function nombreDeRef(ref) {
  return ENTORNOS_CONOCIDOS[ref] ?? 'DESCONOCIDO'
}

/**
 * Credenciales del archivo .env*.local que corresponde a ese ref, o null.
 * Lo usa conexion.mjs para encontrar la connection string sin que haya que
 * exportar PGURL a mano en cada shell.
 */
export function credencialesDeRef(ref) {
  const c = candidatos().find((x) => x.refUrl === ref || x.refJwt === ref)
  if (!c) return null
  return { archivo: c.archivo, vars: leerEnv(join(RAIZ, c.archivo)) }
}

/**
 * Corta si el ref es de producción y no está GONDOLAPP_PROD=1.
 * Fuente única del criterio, compartida por entorno.mjs y conexion.mjs.
 */
export function exigirConfirmacionProd(ref, accion = 'Esta operación escribe datos') {
  const nombre = nombreDeRef(ref)
  if (nombre === 'dev') return nombre
  if (process.env.GONDOLAPP_PROD !== '1') {
    salirCon(
      `${accion} y "${ref}" es ${nombre === 'DESCONOCIDO' ? 'un proyecto no reconocido (se trata como PRODUCCIÓN)' : 'PRODUCCIÓN'}.\n\n` +
      '  Para operar sobre producción hace falta un segundo acto deliberado:\n\n' +
      `    GONDOLAPP_PROD=1 <comando> --ref ${ref}\n\n` +
      '  Si querías dev, corregí el --ref.'
    )
  }
  return nombre
}

/**
 * Resuelve contra qué proyecto va a trabajar el script, o corta.
 * Devuelve { ref, nombre, archivo, url, serviceKey }.
 */
export function resolverEntorno(argv) {
  const i = argv.indexOf('--ref')
  const refPedido = i !== -1 ? argv[i + 1] : null

  const disponibles = candidatos()

  if (!refPedido) {
    const lista = disponibles
      .map((c) => `    --ref ${c.refUrl ?? '???'}   (${ENTORNOS_CONOCIDOS[c.refUrl] ?? 'desconocido'}, desde ${c.archivo})`)
      .join('\n')
    salirCon(
      'Falta --ref <project-ref>. Es obligatorio y no tiene default.\n\n' +
      '  Este script escribe datos: el proyecto se declara en el comando, no\n' +
      '  en un archivo. Opciones detectadas:\n\n' +
      (lista || '    (no se encontró ningún .env*.local con credenciales)')
    )
  }

  const coincidencias = disponibles.filter((c) => c.refUrl === refPedido || c.refJwt === refPedido)

  if (coincidencias.length === 0) {
    const lista = disponibles.map((c) => `    ${c.archivo}: ${c.refUrl ?? '???'}`).join('\n')
    salirCon(
      `No hay credenciales para el proyecto "${refPedido}".\n\n` +
      '  Refs encontrados en los .env*.local:\n' +
      (lista || '    (ninguno)') +
      '\n\n  Si el proyecto es nuevo, creá un .env.<nombre>.local con su URL y su\n' +
      '  service_role key. No edites uno existente para apuntarlo a otro lado.'
    )
  }

  if (coincidencias.length > 1) {
    salirCon(
      `Hay ${coincidencias.length} archivos con credenciales de "${refPedido}":\n` +
      coincidencias.map((c) => `    ${c.archivo}`).join('\n') +
      '\n  Ambiguo. Dejá uno solo antes de seguir.'
    )
  }

  const elegido = coincidencias[0]

  // Cruce de las dos señales: URL y JWT tienen que apuntar al mismo proyecto.
  if (!elegido.refUrl || !elegido.refJwt) {
    salirCon(
      `${elegido.archivo} está incompleto: falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY,\n` +
      '  o no se pudo leer el ref de alguno de los dos.'
    )
  }
  if (elegido.refUrl !== elegido.refJwt) {
    salirCon(
      `${elegido.archivo} mezcla credenciales de dos proyectos distintos:\n` +
      `    NEXT_PUBLIC_SUPABASE_URL  → ${elegido.refUrl}\n` +
      `    SUPABASE_SERVICE_ROLE_KEY → ${elegido.refJwt}\n` +
      '  Escribir con esa combinación es impredecible. Arreglá el archivo.'
    )
  }

  const nombre = ENTORNOS_CONOCIDOS[elegido.refUrl] ?? 'DESCONOCIDO'
  const esProduccion = nombre !== 'dev'

  if (esProduccion && process.env.GONDOLAPP_PROD !== '1') {
    salirCon(
      `Este script escribe datos y "${elegido.refUrl}" es ${nombre === 'DESCONOCIDO' ? 'un proyecto no reconocido (se trata como PRODUCCIÓN)' : 'PRODUCCIÓN'}.\n\n` +
      '  Para escribir en producción hace falta un segundo acto deliberado:\n\n' +
      `    GONDOLAPP_PROD=1 <comando> --ref ${elegido.refUrl}\n\n` +
      '  Si querías dev, corregí el --ref.'
    )
  }

  console.log('─'.repeat(60))
  console.log(`Proyecto:    ${elegido.refUrl}  (${nombre})`)
  console.log(`Credenciales: ${elegido.archivo}`)
  console.log(`Host:        ${elegido.url}`)
  if (esProduccion) console.log('⚠️  PRODUCCIÓN — confirmado con GONDOLAPP_PROD=1')
  console.log('─'.repeat(60) + '\n')

  return {
    ref: elegido.refUrl,
    nombre,
    archivo: elegido.archivo,
    url: elegido.url,
    serviceKey: elegido.key,
  }
}
