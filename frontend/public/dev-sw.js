// Self-destroying service worker to clean up stale development service workers
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll();
    }).then((clients) => {
      clients.forEach((client) => {
        if (client.url && 'navigate' in client) {
          client.navigate(client.url);
        }
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
