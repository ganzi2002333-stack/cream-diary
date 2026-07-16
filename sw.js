// ============================================================
// 奶油日记 · Service Worker
// Phase 2: 缓存优先策略骨架
// ============================================================

const CACHE_NAME = 'cream-diary-v1.0.0';
const CACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];

// ---------- 安装事件：预缓存核心资源 ----------
self.addEventListener('install', (event) => {
  console.log('🍰 SW installing…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('🍰 Caching core assets');
        return cache.addAll(CACHE_URLS).catch(err => {
          // 允许部分失败（如 CDN 不可用）
          console.warn('Some assets failed to cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ---------- 激活事件：清理旧缓存 ----------
self.addEventListener('activate', (event) => {
  console.log('🍰 SW activating…');
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

// ---------- 请求事件：缓存优先 ----------
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // 跳过 chrome-extension 等非 http(s) 请求
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // 缓存命中：直接返回
      if (cachedResponse) {
        return cachedResponse;
      }

      // 缓存未命中：发起网络请求并动态缓存
      return fetch(event.request).then(networkResponse => {
        // 只缓存成功的 GET 响应
        if (!networkResponse || networkResponse.status !== 200 ||
            networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }

        // 克隆响应（响应流只能消费一次）
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });

        return networkResponse;
      }).catch(() => {
        // 网络失败 + 无缓存 → 返回离线页面（后续 Phase 8 细化）
        // 暂时返回空响应
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// ---------- 通知点击事件（Phase 7 使用） ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // 如果已有打开的窗口，聚焦它
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // 否则打开新窗口
        if (clients.openWindow) {
          return clients.openWindow('./index.html');
        }
      })
  );
});