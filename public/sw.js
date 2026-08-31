// Canalside service worker — web-push receiver only (no caching).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

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
