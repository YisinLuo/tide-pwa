// 版本號改成 v5，強迫啟用新 cache
const CACHE_NAME = 'tide-pwa-v8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // 安裝完就立刻啟用新的 SW
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
  // 讓新的 SW 立刻接管所有 client
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 同網域的靜態檔（GitHub Pages）→ cache 優先
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  } else {
    // 外部 API → 網路優先，離線時才用 cache
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});