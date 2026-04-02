const CACHE_NAME = 'gondolapp-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) return

  // Navegación: network-first, fallback a caché
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
          }
          return response
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached ?? caches.match('/gondolero/captura')
          )
        )
    )
    return
  }

  // Assets estáticos: cache-first
  if (['script', 'style', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
          }
          return response
        }).catch(() => new Response('', { status: 408 }))
      })
    )
  }
})
