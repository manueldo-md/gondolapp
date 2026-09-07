const CACHE_NAME = 'gondolapp-v4'
const STATIC_URLS = [
  '/',
  '/gondolero/campanas',
  '/gondolero/misiones',
  '/gondolero/actividad',
  '/gondolero/perfil',
  '/gondolero/captura',
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

  // Solo para navegación (páginas)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cachear la respuesta fresca
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone)
          })
          return response
        })
        .catch(() => {
          // Sin conexión → usar cache
          return caches.match(event.request)
            .then(cached => {
              if (cached) return cached
              // Si no hay cache, mostrar página offline
              return caches.match('/offline')
            })
        })
    )
    return
  }

  // Para assets estáticos: cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request)
    })
  )
})
