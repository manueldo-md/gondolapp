const CACHE_NAME = 'gondolapp-v7'
const STATIC_URLS = [
  '/',
  '/gondolero/campanas',
  '/gondolero/misiones',
  '/gondolero/actividad',
  '/gondolero/logros',
  '/gondolero/perfil',
  '/gondolero/captura',
  '/offline',          // fallback siempre disponible
]

// Instalar y cachear páginas principales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_URLS)
    })
  )
  self.skipWaiting()
})

// Activar y limpiar caches viejos
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
  if (new URL(event.request.url).origin !== self.location.origin) return

  // ── Navegación: stale-while-revalidate ──────────────────────────────────
  // Sirve desde cache inmediatamente (si existe) y en paralelo hace el fetch
  // para actualizar el cache para la próxima visita.
  //
  // ignoreSearch: true — /gondolero/captura?campana=X matchea el cache de
  // /gondolero/captura. Seguro porque esa página es un Client Component puro:
  // el HTML que sirve el servidor es idéntico sin importar los query params.
  // Los datos de la campaña los carga el cliente desde IndexedDB o Supabase.
  if (event.request.mode === 'navigate') {
    event.respondWith(navegacionSWR(event.request))
    return
  }

  // ── Assets estáticos: cache-first ────────────────────────────────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request)
    })
  )
})

// ── Precache bajo demanda (postMessage desde la app) ─────────────────────────
// La app manda { type: 'PRECACHE_URLS', urls: ['/gondolero/campanas/123', ...] }
// cuando el gondolero abre la lista de campañas con señal. El SW descarga cada
// URL en cache para que esté disponible offline sin que el usuario tenga que
// haberla visitado antes.
self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'PRECACHE_URLS') return
  const cache = await caches.open(CACHE_NAME)
  for (const url of (event.data.urls ?? [])) {
    try {
      const already = await cache.match(url)
      if (already) continue   // ya está en cache — no volver a bajar
      const response = await fetch(url)
      if (response.ok) await cache.put(url, response.clone())
    } catch { /* sin red — se reintentará la próxima vez */ }
  }
})

async function navegacionSWR(request) {
  const cache = await caches.open(CACHE_NAME)

  // Buscar en cache ignorando query params (seguro solo para navegación —
  // ver comentario en el handler de fetch arriba).
  const cached = await cache.match(request, { ignoreSearch: true })

  // Revalidación en background: fetch + actualizar cache + notificar clientes
  const revalidacion = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone())

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
