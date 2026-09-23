// ── La versión ya no se bumpea a mano ────────────────────────────────────────
//
// Antes era una constante `gondolapp-v<NN>` que alguien tenía que acordarse de
// subir. Entre el 11/9 y el 15/9 entraron 39 commits sin bumpearla y ninguno
// reinstaló nada. Y el 23/9 pasó lo caro: el deploy que arreglaba el KPI de
// Presencia no tocó el número, así que `activate` no borró nada y el HTML
// viejo del panel de marca se siguió sirviendo desde el cache.
//
// Ahora sale del query string con el que `sw-registrar.tsx` registra el SW:
// `/sw.js?v=<commit>`. Cambiar el scriptURL es lo que el browser mira para
// decidir que hay un SW nuevo, así que la reinstalación queda atada al deploy
// y no a la memoria de nadie. `?v=dev` en local, donde no hay commit.
//
// El precio, dicho de frente: cada deploy estrena cache y borra el anterior.
// Los chunks se vuelven a bajar solos en el install —y los viejos, con hash en
// el nombre, ya no servían para nada— pero las páginas de campaña que el
// gondolero tenía guardadas vía PRECACHE_URLS se pierden hasta que vuelva a
// abrir la lista con señal.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE_NAME = `gondolapp-${VERSION}`

// ── Qué rutas pasan por el cache de navegación ───────────────────────────────
// ─── INICIO RUTAS OFFLINE (scripts/probar-sw-rutas.mjs lee entre estas marcas) ───
//
// SOLO las del gondolero. Es para lo único que se escribió el stale-while-
// revalidate y lo único que el precache contempla.
//
// ── POR QUÉ ES UNA ALLOWLIST Y NO UNA BLOCKLIST ─────────────────────────────
// Hasta el 23/9/2026 `navegacionSWR` agarraba TODA navegación del mismo
// origen, y el comentario que la justificaba decía —con razón— que era seguro
// "porque esa página es un Client Component puro: el HTML que sirve el
// servidor es idéntico sin importar los query params". Eso es cierto de
// /gondolero/captura, para la que se escribió. No lo es de /marca/dashboard,
// que es un Server Component cuyo HTML SON los números de una marca.
//
// El resultado era que el HTML de un panel privado quedaba en el disco del
// dispositivo, sin sesión, indexado solo por pathname. Hay UNA entrada por
// ruta: quien abriera ese navegador después —otra cuenta, otra persona— lo
// recibía servido del cache antes de que la revalidación lo echara. Aplicaba a
// /marca, /distribuidora, /repositora y /admin.
//
// Con una blocklist, cada ruta nueva nace cacheada y hay que acordarse de
// excluirla. Con una allowlist nace yendo a red, que es el lado seguro: lo
// peor que pasa es que algo del gondolero no ande offline hasta que se agregue
// acá, y eso se nota. Lo otro no se nota.
const RUTAS_OFFLINE = ['/gondolero', '/offline']

/**
 * `true` si esta ruta puede servirse desde el cache de navegación.
 *
 * Compara por SEGMENTO y no con un startsWith pelado: `/offline` no puede
 * matchear `/offline-report`, ni `/gondolero` matchear `/gondoleros-admin`.
 * Un prefijo ingenuo mete rutas ajenas al cache por parecerse en las letras,
 * que es la forma más barata de reabrir el mismo agujero.
 */
function necesitaOffline(pathname) {
  return RUTAS_OFFLINE.some(base => pathname === base || pathname.startsWith(base + '/'))
}
// ─── FIN RUTAS OFFLINE ───

// ── Rutas a precachear en install ─────────────────────────────────────────────
//
// SOLO rutas públicas son confiables aquí.
//
// El install puede correr en cualquier momento — primera apertura de la app,
// actualización del SW — y NO hay garantía de que el usuario esté autenticado.
// Si el middleware redirige una ruta protegida a /auth, el guard !response.redirected
// la descarta silenciosamente y NUNCA queda en cache desde install.
//
// Las rutas /gondolero/* son TODAS protegidas por el middleware. Agregarlas aquí
// da una falsa sensación de seguridad: funcionan si el SW instala con sesión
// activa (casualidad), y fallan si instala sin sesión (muy común en primera carga).
//
// Las rutas protegidas que necesiten estar offline se precachean por dos vías:
//   1. navegacionSWR: las cachea la primera vez que el usuario las visita con señal.
//   2. PRECACHE_URLS postMessage desde campanas-sections: las descarga con sesión
//      garantizada cuando el gondolero abre la lista de campañas.
//
// Regla: solo agregar a STATIC_URLS rutas que el middleware deja pasar sin sesión.
const STATIC_URLS = [
  '/offline',   // única ruta pública — siempre disponible como fallback
]

// Instalar y cachear páginas principales + chunks JS de rutas offline-críticas
//
// IMPORTANTE: NO usar cache.addAll() — sigue los redirects de forma transparente
// y guarda el HTML del destino (ej. /auth) bajo la URL original (ej. /gondolero/campanas).
// El browser no puede usar esa respuesta como navegación y la app queda rota
// para todos los usuarios después del primer load sin sesión.
//
// El loop manual con !response.redirected lo previene: si el middleware redirige
// la URL (sesión vencida o inexistente durante el install), simplemente no la
// cacheamos. Se cacheará en la primera visita real con sesión activa.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {

      // 1. Páginas principales (HTML de navegación)
      for (const url of STATIC_URLS) {
        try {
          const response = await fetch(url)
          if (response.ok && !response.redirected) {
            await cache.put(url, response)
          }
        } catch { /* sin red al instalar — se cachea en la primera visita con señal */ }
      }

      // 2. Chunks JS de rutas offline-críticas desde sw-manifest.json
      //    generado en build time por scripts/generate-sw-manifest.js.
      //
      //    Si falla (archivo no existe, sin red, formato inesperado): loguear y
      //    continuar. La instalación del SW no se cancela. Peor caso: sin chunks
      //    precacheados, pero el fetch handler los cacheará en la primera visita.
      try {
        const manifestRes = await fetch('/sw-manifest.json')
        if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status}`)
        const manifest = await manifestRes.json()
        if (!Array.isArray(manifest?.chunks)) throw new Error('formato inesperado — chunks no es array')

        let cacheados = 0
        for (const url of manifest.chunks) {
          try {
            const already = await cache.match(url)
            if (already) { cacheados++; continue }
            const res = await fetch(url)
            if (res.ok && !res.redirected) {
              await cache.put(url, res.clone())
              cacheados++
            }
          } catch { /* chunk individual sin red — continuar con los demás */ }
        }
        console.log(`[SW ${VERSION}] Precacheados ${cacheados}/${manifest.chunks.length} chunks de /sw-manifest.json`)
      } catch (err) {
        console.warn(`[SW ${VERSION}] /sw-manifest.json no disponible — instalación continúa sin precache de chunks:`, err.message)
      }

    })
  )
  self.skipWaiting()
})

// Activar y limpiar caches viejos
//
// Como CACHE_NAME sale del commit del deploy, cada deploy estrena cache y este
// handler borra TODOS los anteriores, incluido cualquiera envenenado con
// redirects o con HTML de un panel privado. Con clients.claim() el SW nuevo toma
// control de todas las pestañas abiertas sin esperar recarga.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// Interceptar requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // ── Solo el propio origen ───────────────────────────────────────────────
  // Sin esto, el SW interceptaba TODOS los requests y los re-emitía con
  // fetch(event.request), incluidos los <img> cross-origin. Eso convierte una
  // carga de imagen en un Fetch API, y ahí deja de gobernarla `img-src` de la
  // CSP y pasa a gobernarla `connect-src` — que es por qué las fotos de Drive
  // y de picsum daban "Refused to connect" aunque estuvieran permitidas en
  // img-src.
  //
  // Cachear recursos de otros dominios tampoco aportaba nada: son inmutables
  // y el browser ya los cachea solo. Al no llamar a respondWith(), el request
  // sigue su curso normal y no pasa por el SW.
  //
  // Además de arreglar el síntoma, esto evita que cada dominio de imágenes
  // nuevo (Storage de Supabase, un CDN, lo que venga) obligue a tocar la CSP.
  if (url.origin !== self.location.origin) return

  // ── Chunks de Next.js: cache-first con escritura automática ─────────────
  // Los archivos en /_next/static/ tienen hash en el nombre → son inmutables.
  // Los cacheamos agresivamente: una vez descargados, están disponibles offline
  // para siempre (hasta que cambie CACHE_NAME en el próximo deploy y activate
  // limpie este cache).
  //
  // Esto complementa el precache del install: cualquier chunk que el browser
  // descargue en-session queda también en cache, sin depender de sw-manifest.json.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone())
            return res
          })
        )
      )
    )
    return
  }

  // ── Navegación: stale-while-revalidate ──────────────────────────────────
  // Sirve desde cache inmediatamente (si existe) y en paralelo hace el fetch
  // para actualizar el cache para la próxima visita.
  //
  // ignoreSearch: true — /gondolero/captura?campana=X matchea el cache de
  // /gondolero/captura. Seguro porque esa página es un Client Component puro:
  // el HTML que sirve el servidor es idéntico sin importar los query params.
  // Los datos de la campaña los carga el cliente desde IndexedDB o Supabase.
  //
  // Y solo las rutas del gondolero: ver RUTAS_OFFLINE. Una navegación que no
  // está en la lista NO pasa por respondWith, así que sigue su curso normal a
  // la red y nunca se escribe en cache.
  if (event.request.mode === 'navigate') {
    if (!necesitaOffline(url.pathname)) return
    event.respondWith(navegacionSWR(event.request))
    return
  }

  // ── Otros assets del mismo origen: cache-first sin escritura ─────────────
  // (favicon, imágenes de /public, íconos, etc.)
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  )
})

// ── Precache bajo demanda (postMessage desde la app) ─────────────────────────
// La app manda { type: 'PRECACHE_URLS', urls: ['/gondolero/campanas/123', ...] }
// cuando el gondolero abre la lista de campañas con señal. El SW descarga cada
// URL en cache para que esté disponible offline sin que el usuario la haya
// visitado antes. El guard !response.redirected previene cachear el HTML de
// /auth bajo una URL protegida (mismo bug que en install y navegacionSWR).
self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'PRECACHE_URLS') return
  const cache = await caches.open(CACHE_NAME)
  for (const url of (event.data.urls ?? [])) {
    try {
      // La misma regla que la navegación, y por el mismo motivo: hoy el único
      // que manda este mensaje es campanas-sections con URLs del gondolero,
      // pero la lista de rutas cacheables tiene que vivir en UN solo lugar. Si
      // algún día una pantalla de empresa manda un postMessage, no alcanza con
      // que nadie lo haya escrito todavía.
      if (!necesitaOffline(new URL(url, self.location.origin).pathname)) continue
      const already = await cache.match(url)
      if (already) continue   // ya está en cache — no volver a bajar
      const response = await fetch(url)
      if (response.ok && !response.redirected) await cache.put(url, response.clone())
    } catch { /* sin red — se reintentará la próxima vez */ }
  }
})

async function navegacionSWR(request) {
  const cache = await caches.open(CACHE_NAME)

  // Normalizar la URL: guardar y buscar SIEMPRE bajo pathname sin query string.
  // Razón: si guardamos bajo la URL completa (con ?campana=X), cada combinación
  // de query params genera una entrada distinta. El primer hit de cache.match
  // con ignoreSearch devuelve la primera entrada en orden de inserción —
  // no necesariamente la más reciente — y el HTML nuevo nunca llega al usuario.
  // Guardando bajo pathname exacto hay una sola entrada por ruta, siempre fresca.
  const urlSinQuery = new URL(request.url)
  urlSinQuery.search = ''
  const claveCache = urlSinQuery.toString()

  const cached = await cache.match(claveCache)

  // Revalidación en background: fetch + actualizar cache + notificar clientes
  const revalidacion = fetch(request)
    .then(async (response) => {
      // NUNCA cachear una respuesta que llegó vía redirect.
      // response.redirected=true cuando fetch siguió un 302/301 (ej: el middleware
      // redirigió /gondolero/campanas → /auth por sesión vencida). Guardarlo bajo
      // la URL original haría que el SW sirva el HTML de /auth cuando el usuario
      // pide /gondolero/campanas — la app queda rota hasta que se borre el cache.
      if (response.ok && !response.redirected) {
        await cache.put(claveCache, response.clone())

        // Avisar a todas las pestañas abiertas para que actualicen sus datos.
        // Cada pestaña decide si hace router.refresh() según su propia ruta
        // (ver SwUpdater en components/shared/sw-updater.tsx).
        const clientes = await self.clients.matchAll({ type: 'window' })
        const { pathname } = new URL(request.url)
        for (const cliente of clientes) {
          cliente.postMessage({ type: 'SW_UPDATED', pathname })
        }
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    // Cache hit → servir inmediatamente, revalidar en background (fire-and-forget)
    return cached
  }

  // Sin cache → esperar al network
  const networkResponse = await revalidacion
  if (networkResponse) return networkResponse

  // Sin cache y sin red → fallback a /offline
  const offline = await cache.match('/offline')
  return offline ?? new Response(
    'Sin conexión. Abrí la app con señal para continuar.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
