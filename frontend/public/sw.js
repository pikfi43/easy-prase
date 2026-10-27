const CACHE_NAME = 'easyprice-v2'
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin || !['http:', 'https:'].includes(requestUrl.protocol)) return

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(event.request, response.clone())
      }
      return response
    } catch {
      const cachedResponse = await caches.match(event.request)
      if (cachedResponse) return cachedResponse
      if (event.request.mode === 'navigate') {
        const appShell = await caches.match('/')
        if (appShell) return appShell
      }
      return new Response('', { status: 503, statusText: 'Offline' })
    }
  })())
})
