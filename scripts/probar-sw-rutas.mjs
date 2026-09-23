/**
 * probar-sw-rutas.mjs — SOLO LÓGICA, sin base y sin browser.
 *
 * ESTE ARCHIVO EXISTE PARA QUE FALLE SI EL HTML DE UN PANEL PRIVADO VUELVE A
 * QUEDAR EN EL DISCO DEL DISPOSITIVO.
 *
 * Hasta el 23/9/2026, `navegacionSWR` cacheaba TODA navegación del mismo
 * origen, indexada solo por pathname y sin ninguna clave de sesión. Hay UNA
 * entrada por ruta: el HTML de /marca/dashboard de una cuenta se le servía a la
 * siguiente que abriera ese navegador, antes de que la revalidación lo echara.
 * Lo mismo para /distribuidora, /repositora y /admin.
 *
 * El bug no se ve en ninguna pantalla: la app funciona, los números son los de
 * otro. Por eso la regla se prueba acá y no mirando.
 *
 * ── LEE EL ARCHIVO QUE SE DESPLIEGA, NO UNA COPIA ───────────────────────────
 * `public/sw.js` no es importable —es un script de service worker, con
 * `self` y sin exports— así que el test extrae la función entre las marcas
 * INICIO/FIN RUTAS OFFLINE y la evalúa. Copiar la regla acá sería tener dos, y
 * la que corre sería la otra. Si las marcas no están, el test CORTA en vez de
 * pasar en verde sobre nada.
 *
 *   node scripts/probar-sw-rutas.mjs
 */
import fs from 'fs'

const ARCHIVO = 'public/sw.js'
const fuente = fs.readFileSync(ARCHIVO, 'utf8')

const bloque = fuente.match(
  /─── INICIO RUTAS OFFLINE[^\n]*\n([\s\S]*?)\/\/ ─── FIN RUTAS OFFLINE/
)
if (!bloque) {
  console.error(`\n✗ No encontré las marcas INICIO/FIN RUTAS OFFLINE en ${ARCHIVO}.\n` +
    `  Sin eso este test no prueba nada, así que corta en vez de dar verde.\n` +
    `  Si renombraste el bloque, actualizá el regex.\n`)
  process.exit(1)
}

// eslint-disable-next-line no-new-func
const { necesitaOffline, RUTAS_OFFLINE } = new Function(
  `${bloque[1]}\nreturn { necesitaOffline, RUTAS_OFFLINE }`
)()

let fallos = 0
function caso(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

console.log('\n▸ LO QUE NUNCA MÁS PUEDE ENTRAR AL CACHE')
// Son las cuatro familias de paneles privados. Cada una es un HTML con los
// datos de UNA cuenta, servido bajo un pathname que todas comparten.
const PRIVADAS = [
  '/marca/dashboard', '/marca/campanas', '/marca/gondolas', '/marca/cuenta',
  '/distribuidora/dashboard', '/distribuidora/gondolas', '/distribuidora/campanas',
  '/repositora/fixers', '/repositora/gondolas', '/repositora/marcas',
  '/admin/tablero', '/admin/metricas', '/admin/fotos',
]
for (const ruta of PRIVADAS) caso(ruta, necesitaOffline(ruta), false)

console.log('\n▸ Tampoco la raíz ni el login')
// `/` es un redirect del middleware al destino según el actor: cachearlo
// mandaría al próximo usuario al panel del anterior. Y /auth cacheado deja a
// alguien mirando un formulario viejo cuando ya hay sesión.
for (const ruta of ['/', '/auth', '/auth/callback', '/auth/recuperar', '/auth/nueva-password',
                    '/vinculacion', '/vinculacion-marca', '/vinculacion-repo',
                    '/vinculacion-distri-repo', '/fixer-vinculacion', '/distri', '/repo']) {
  caso(ruta, necesitaOffline(ruta), false)
}

console.log('\n▸ Y lo que SÍ tiene que seguir andando offline')
// Si esto se rompe, un gondolero sin señal se queda sin poder capturar — que
// es el caso de uso por el que existe todo el service worker.
for (const ruta of ['/gondolero/campanas', '/gondolero/captura', '/gondolero/perfil',
                    '/gondolero/comercios/nuevo', '/gondolero/campanas/abc-123',
                    '/offline']) {
  caso(ruta, necesitaOffline(ruta), true)
}

console.log('\n▸ Los bordes del prefijo')
caso('/gondolero sin barra final también entra', necesitaOffline('/gondolero'), true)
caso('/offline/ con barra', necesitaOffline('/offline/'), true)
// El que importaría de verdad: una ruta que EMPIEZA parecido pero es otra.
caso('/gondoleros-admin NO entra por parecerse', necesitaOffline('/gondoleros-admin'), false)
caso('/admin/gondoleros NO entra por contener la palabra', necesitaOffline('/admin/gondoleros'), false)
caso('/offline-report NO entra', necesitaOffline('/offline-report'), false)

console.log('\n▸ CONTROL — la lista es lo que decimos que es')
caso('exactamente dos prefijos', RUTAS_OFFLINE, ['/gondolero', '/offline'])
caso('y ninguno es la raíz, que dejaría todo adentro otra vez',
  RUTAS_OFFLINE.includes('/'), false)

console.log('\n▸ CONTROL — el archivo aplica la regla donde tiene que aplicarla')
// Que la función exista y esté bien no sirve de nada si el handler no la llama.
// Esto mira el archivo, no la función.
caso('la navegación consulta necesitaOffline antes de respondWith',
  /mode === 'navigate'[\s\S]{0,300}?if \(!necesitaOffline\([\s\S]{0,120}?respondWith\(navegacionSWR/.test(fuente), true)
caso('el precache por postMessage también la consulta',
  /PRECACHE_URLS[\s\S]*?if \(!necesitaOffline\(/.test(fuente), true)
caso('CACHE_NAME sale del ?v= y no de una constante escrita a mano',
  /const VERSION = new URL\(self\.location\.href\)\.searchParams\.get\('v'\)/.test(fuente)
  && /const CACHE_NAME = `gondolapp-\$\{VERSION\}`/.test(fuente), true)
caso('no quedó ningún gondolapp-vNN hardcodeado', /gondolapp-v\d+/.test(fuente), false)

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
