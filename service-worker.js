// 版本號改成 v13，強迫啟用新 cache
const CACHE_NAME = 'tide-pwa-v13';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const isNavigationRequest = request => {
  return request.mode === 'navigate' || request.destination === 'document';
};

const isCoreAsset = url => {
  return url.pathname === '/' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/app.js');
};

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.origin === location.origin) {
    if (isCoreAsset(url) || isNavigationRequest(event.request)) {
      // index.html / app.js / page navigation: network-first for latest code
      event.respondWith(
        fetch(event.request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            return response;
          })
          .catch(() => caches.match(event.request))
      );
    } else {
      // 其餘靜態資源：cache-first
      event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
      );
    }
  } else {
    // 外部 API → 網路優先，離線時才用 cache
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});