// =============================================================================
// conexion.mjs — resolución y validación de la conexión para los scripts de schema
// =============================================================================
// Compartido por aplicar-migraciones.mjs y comparar-schema.mjs.
//
// Resuelve la conexión de dos maneras:
//   1. PGURL con la connection string completa
//   2. Variables discretas PGHOST / PGUSER / PGPASSWORD / PGDATABASE / PGPORT
//
// La opción 2 existe porque la 1 tiene una trampa real: si la password
// contiene '#', '/' o '?', la connection string deja de ser una URL válida y
// `pg` falla con "TypeError: Invalid URL" sin decir por qué. Esos caracteres
// hay que percent-encodearlos. Con variables discretas el problema no existe.
//
// Nada de acá imprime nunca la password.
// =============================================================================

import { readFileSync } from 'node:fs'
import { credencialesDeRef } from './entorno.mjs'

export function salirCon(mensaje) {
  console.error(`\n✗ ${mensaje}\n`)
  process.exit(1)
}

// Parte una connection string sin usar `new URL`, que tira excepción justo en
// los casos que queremos diagnosticar.
function partirCrudo(url) {
  const m = url.match(/^([a-zA-Z0-9+.-]+:\/\/)(.*)$/s)
  if (!m) return null
  const [, esquema, resto] = m
  const corteArroba = resto.lastIndexOf('@')
  if (corteArroba === -1) return { esquema, usuario: resto, password: '', cola: '' }
  const userinfo = resto.slice(0, corteArroba)
  const cola = resto.slice(corteArroba + 1)
  const corteDosPuntos = userinfo.indexOf(':')
  return {
    esquema,
    usuario: corteDosPuntos === -1 ? userinfo : userinfo.slice(0, corteDosPuntos),
    password: corteDosPuntos === -1 ? '' : userinfo.slice(corteDosPuntos + 1),
    cola,
  }
}

/** Versión segura para logs: nunca revela la password. */
export function enmascararUrl(url) {
  const p = partirCrudo(url)
  if (!p) return '<connection string con formato no reconocido>'
  return p.password ? `${p.esquema}${p.usuario}:****@${p.cola}` : `${p.esquema}${p.usuario}${p.cola ? '@' + p.cola : ''}`
}

const PROBLEMATICOS = ['#', '/', '?']

/**
 * Valida que PGURL sea parseable, y si no lo es explica por qué.
 * Devuelve la URL intacta — no la modifica.
 */
export function validarPgurl(pgurl) {
  if (pgurl.trim() !== pgurl) {
    salirCon(
      'PGURL tiene espacios o saltos de línea al principio o al final.\n' +
      '  Suele pasar al copiarla del dashboard. Volvé a exportarla sin el sobrante.'
    )
  }
  if (/^['"].*['"]$/s.test(pgurl)) {
    salirCon(
      'PGURL incluye las comillas como parte del valor.\n' +
      "  En bash: export PGURL='...' — las comillas delimitan, no van adentro."
    )
  }

  try {
    // Mismo parseo que hace pg-connection-string internamente.
    new URL(pgurl, 'postgres://base')
    return pgurl
  } catch {
    const p = partirCrudo(pgurl)
    const encontrados = p ? PROBLEMATICOS.filter((c) => p.password.includes(c)) : []

    let detalle
    if (encontrados.length > 0) {
      const encodeados = encontrados.map((c) => `${c} → ${encodeURIComponent(c)}`).join(', ')
      detalle =
        `  La password contiene ${encontrados.map((c) => `'${c}'`).join(', ')}, que corta el parseo de la URL.\n` +
        `  Hay que percent-encodearlos: ${encodeados}\n\n` +
        '  Podés generar la versión encodeada sin exponer la password:\n' +
        `    node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$TU_PASSWORD"\n\n` +
        '  O evitar el problema entero usando variables discretas:\n' +
        '    export PGHOST=... PGPORT=5432 PGUSER=postgres.<ref> PGDATABASE=postgres\n' +
        '    export PGPASSWORD=...   # sin encodear, va tal cual'
    } else {
      detalle =
        '  No pude identificar el carácter exacto. Los que rompen el parseo en la\n' +
        "  password son '#', '/' y '?'. Alternativa sin encoding:\n" +
        '    export PGHOST=... PGPORT=5432 PGUSER=postgres.<ref> PGDATABASE=postgres PGPASSWORD=...'
    }

    salirCon(`PGURL no es una URL válida.\n  Recibido (enmascarado): ${enmascararUrl(pgurl)}\n\n${detalle}`)
  }
}

/** SSL: Supabase exige TLS. Con PGSSLROOTCERT se verifica la cadena. */
function configSsl() {
  return process.env.PGSSLROOTCERT
    ? { ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8') }
    : { rejectUnauthorized: false }
}

/**
 * Resuelve la configuración del cliente y valida el --ref contra ella.
 * El --ref es la guarda contra tocar el proyecto equivocado.
 */
export function resolverConexion(argv) {
  const indiceRef = argv.indexOf('--ref')
  const refEsperado = indiceRef !== -1 ? argv[indiceRef + 1] : null
  if (!refEsperado) {
    salirCon('Falta --ref <project-ref>. Es obligatorio: evita correr esto sobre el proyecto equivocado.')
  }

  // La connection string se busca, en orden:
  //   1. PGURL del entorno (override para un one-off)
  //   2. PGURL dentro del .env*.local que corresponde a ese --ref
  //   3. variables discretas PGHOST/PGUSER/...
  //
  // El punto 2 es lo que hace que no haya que exportar PGURL a mano en cada
  // shell: se resuelve por ref, igual que el resto de las credenciales.
  let pgurl = process.env.PGURL
  let origenPgurl = 'variable de entorno PGURL'
  if (!pgurl) {
    const cred = credencialesDeRef(refEsperado)
    if (cred?.vars?.PGURL) {
      pgurl = cred.vars.PGURL
      origenPgurl = cred.archivo
    }
  }
  const usaDiscretas = !pgurl && process.env.PGHOST && process.env.PGUSER

  if (!pgurl && !usaDiscretas) {
    const cred = credencialesDeRef(refEsperado)
    salirCon(
      `Falta la connection string de Postgres para "${refEsperado}".\n\n` +
      '  RECOMENDADO — agregar la línea PGURL al archivo de ese proyecto:\n' +
      `    ${cred ? cred.archivo : '.env.<nombre>.local'}\n` +
      "    PGURL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres\n\n" +
      '    Así se resuelve por --ref igual que el resto de las credenciales, sin\n' +
      '    exportar nada a mano en cada shell. Los .env*.local están gitignoreados.\n\n' +
      '  Alternativas para un one-off:\n' +
      "    export PGURL='postgresql://...'   (si la password tiene # / o ?, encodearlos)\n" +
      '    export PGHOST=... PGPORT=5432 PGUSER=postgres.<ref> PGDATABASE=postgres PGPASSWORD=...\n\n' +
      '  Usar el Session pooler o la conexión directa — NO el Transaction pooler de 6543.'
    )
  }

  let config
  let descripcion
  if (pgurl) {
    // validarPgurl devuelve la URL intacta; no se reasigna ni se enmascara acá.
    const urlValidada = validarPgurl(pgurl)
    if (!urlValidada.includes(refEsperado)) {
      salirCon(
        `PGURL no apunta al proyecto "${refEsperado}".\n` +
        `  Recibido (enmascarado): ${enmascararUrl(urlValidada)}\n` +
        '  Verificá cuál proyecto estás por tocar antes de seguir: esto aplica DDL y no es reversible.'
      )
    }
    config = { connectionString: urlValidada, ssl: configSsl() }
    descripcion = `${enmascararUrl(urlValidada)}  [origen: ${origenPgurl}]`
  } else {
    const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env
    if (!`${PGUSER}${PGHOST}`.includes(refEsperado)) {
      salirCon(
        `Ni PGUSER ni PGHOST mencionan el proyecto "${refEsperado}".\n` +
        `  PGUSER=${PGUSER}  PGHOST=${PGHOST}\n` +
        '  Verificá cuál proyecto estás por tocar antes de seguir.'
      )
    }
    config = {
      host: PGHOST,
      port: PGPORT ? Number(PGPORT) : 5432,
      user: PGUSER,
      password: PGPASSWORD,
      database: PGDATABASE || 'postgres',
      ssl: configSsl(),
    }
    descripcion = `${PGUSER}:****@${PGHOST}:${config.port}/${config.database}`
  }

  return { config, refEsperado, descripcion, verificaSsl: Boolean(process.env.PGSSLROOTCERT) }
}

/**
 * Conecta explicando el fallo en vez de tirar el stack crudo de pg-protocol.
 * Compartido: todo script que abra una conexión debería usar esto.
 */
export async function conectar(client, refEsperado, descripcion) {
  try {
    await client.connect()
  } catch (error) {
    console.error(`\n✗ No se pudo conectar a "${refEsperado}".`)
    console.error(`  ${error.code ?? 'sin código'}: ${error.message}`)
    console.error(`  Conexión (enmascarada): ${descripcion}`)

    if (error.code === '28P01') {
      // El pooler de Supabase (Supavisor) usa postgres.<ref> solo para enrutar
      // y después conecta upstream como `postgres`, así que el error habla de
      // un usuario que vos no escribiste. No es que falte el sufijo: si el
      // ruteo hubiera fallado, ni siquiera se llegaría a autenticar.
      console.error('\n  El mensaje dice user "postgres" aunque tu PGURL diga postgres.<ref>:')
      console.error('  el pooler enruta por el sufijo y después conecta upstream como postgres.')
      console.error('  Que llegue a autenticar significa que el ruteo funcionó: lo que no coincide')
      console.error('  es la password.\n')
      console.error('  Revisá que sea la del proyecto correcto — es fácil pegar la de otro — o')
      console.error('  generá una nueva en Settings → Database → Reset database password.')
      console.error('  Resetearla NO afecta las API keys (anon / service_role), así que la app')
      console.error('  sigue funcionando: solo cambia el acceso por protocolo Postgres.')
    } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      console.error('\n  No se resolvió el host. Revisá la región del pooler en la connection string.')
    }
    console.error('')
    process.exit(1)
  }
}

export async function cargarClient() {
  try {
    const { Client } = await import('pg')
    return Client
  } catch {
    salirCon('Falta el paquete `pg`. Instalalo sin tocar el repo:\n  npm install --no-save pg')
  }
}
