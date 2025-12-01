const CACHE_NAME = 'tide-pwa-v1';
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
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
});

// 對靜態檔案：cache 優先；對 API：網路優先
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 你的 GitHub Pages 網站 (同源) → 靜態檔案 cache 優先
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  } else {
    // 其他來源（例如中央氣象署 API）→ 網路優先
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
