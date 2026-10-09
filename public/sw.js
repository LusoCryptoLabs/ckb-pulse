// Shows the notices the server sends for followed projects and people, and opens the page on what moved.
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data.json() } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'CKB Pulse', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag, data: { url: d.url || './' } }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'navigate' in c) return c.navigate(url).then((w) => (w || c).focus())
    return self.clients.openWindow(url)
  }))
})
