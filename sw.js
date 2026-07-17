// ============================================================
// 奶油日记 · Service Worker
// v2.0: stale-while-revalidate 策略 — 自动更新
// ============================================================

const CACHE_NAME = 'cream-diary-v2.2.0';
const CACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/chat.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];

// ---------- 安装事件：预缓存核心资源 ----------
self.addEventListener('install', (event) => {
  console.log('🍰 SW v2.0 installing…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('🍰 Caching core assets');
        return cache.addAll(CACHE_URLS).catch(err => {
          console.warn('Some assets failed to cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ---------- 激活事件：清理旧缓存 ----------
self.addEventListener('activate', (event) => {
  console.log('🍰 SW v2.0 activating…');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('🍰 Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ---------- 请求事件：缓存优先返回 + 后台更新 ----------
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        // 后台发起网络请求更新缓存
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // 网络失败，忽略（用缓存即可）
        });

        // 如果有缓存，立即返回缓存，同时后台更新
        // 如果没有缓存，等待网络响应
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// ---------- 通知点击事件 ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('./index.html');
        }
      })
  );
});
