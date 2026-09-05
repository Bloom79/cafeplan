// Canalside service worker: web-push receiver, and the cache that opens the
// app on a phone with no signal — the shell, the last listings file, the
// photos already seen. Navigations and the data go network-first (a deploy
// or a data refresh wins the moment there is a connection); the hashed
// build assets are immutable and come cache-first; photos and map tiles are
// served from cache while a fresh copy is fetched in the background.
const VERSION = 'canalside-v2'
const SHELL = `${VERSION}-shell`
const DATA = `${VERSION}-data`
const MEDIA = `${VERSION}-media`
const MEDIA_MAX = 240

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, DATA, MEDIA])
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

const trim = async (name, max) => {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k)
}

const networkFirst = async (req, cacheName) => {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone())
    return res
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true })
    if (hit) return hit
    throw new Error('offline')
  }
}

const cacheFirst = async (req, cacheName) => {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res && res.ok) cache.put(req, res.clone())
  return res
}

const staleWhileRevalidate = async (req, cacheName, max) => {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  const refresh = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).then(() => trim(cacheName, max))
    return res
  }).catch(() => null)
  return hit || (await refresh) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL).catch(async () => (await caches.match(new URL('./', self.registration.scope).href)) || (await caches.match(req)) || Response.error()))
    return
  }
  if (sameOrigin && /\/assets\//.test(url.pathname)) {
    event.respondWith(cacheFirst(req, SHELL))
    return
  }
  if (/listings\.json$/.test(url.pathname)) {
    event.respondWith(networkFirst(req, DATA).catch(() => Response.error()))
    return
  }
  if (req.destination === 'image' || /tile\.openstreetmap\.org/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, MEDIA, MEDIA_MAX))
    return
  }
  if (sameOrigin && /\.(css|js|webmanifest|png)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, SHELL, 60))
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch { /* plain-text push */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Canalside ☕', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: data.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || './'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const t of tabs) if (t.url.includes('/cafeplan/')) { t.focus(); return t.navigate(url) }
      return self.clients.openWindow(url)
    }),
  )
})
