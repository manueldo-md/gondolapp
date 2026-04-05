const CACHE_NAME = 'gondolapp-v3'
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
