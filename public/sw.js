// Fuego service worker: receives push messages and shows notifications.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// The number on the home screen icon = notifications that arrived and have not been opened yet
async function syncBadge() {
  try {
    const list = await self.registration.getNotifications();
    const nav = self.navigator;
    if (!nav || !nav.setAppBadge) return;
    if (list.length > 0) await nav.setAppBadge(list.length);
    else if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch (e) { /* not supported */ }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Fuego Youth Fellowship';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/fuegologo.png',
      badge: '/icons/fuegologo.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }).then(syncBadge)
  );
});

self.addEventListener('notificationclose', (event) => event.waitUntil(syncBadge()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          // Open the page the notification is about, then bring the app to the front
          if ('navigate' in client) { try { await client.navigate(url); } catch (e) { /* ignore */ } }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }).then(syncBadge)
  );
});