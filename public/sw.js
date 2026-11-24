/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function showNonIntrusiveNotification(payload) {
  const title = payload.title || 'נפגשים';
  const options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || 'nifgashim-update',
    renotify: false,
    requireInteraction: false,
    silent: Boolean(payload.silent),
    dir: 'rtl',
    lang: 'he',
    actions: [
      { action: 'open', title: 'פתח חדר' },
      { action: 'dismiss', title: 'סגור' },
    ],
    data: {
      url: payload.url || '/',
      roomId: payload.roomId || null,
      type: payload.type || 'general',
    },
  };
  return self.registration.showNotification(title, options);
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'נפגשים',
    body: 'יש עדכון חדש בחדר המפגש שלך',
    url: '/',
    tag: 'nifgashim-push',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(showNonIntrusiveNotification(payload));
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_LOCAL_NOTIFICATION') {
    return;
  }
  event.waitUntil(showNonIntrusiveNotification(event.data.payload || {}));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if (client.url.includes(targetUrl) || targetUrl === '/') {
              return client.focus();
            }
            if ('navigate' in client) {
              return client.navigate(targetUrl).then((navigated) => navigated?.focus());
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
