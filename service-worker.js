// ============================================================
// Service Worker - نظام الرصد الإلكتروني (نسخة محلية بالكامل)
// ============================================================

// ⚠️ مهم جداً: غيّر هذا الرقم (v6 إلى v7 أو v8...) عند كل تحديث جديد تجريه
const CACHE_NAME = 'rasd-app-v6.0.0';
const CACHE_VERSION = '6.0.0';

// قائمة الملفات المحلية التي سيتم تخزينها مؤقتاً للعمل بدون إنترنت
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './exceljs.min.js',
  './xlsx.full.min.js', // تأكد أن هذا هو الاسم الصحيح للملف (بدون مسافات)
  './cairo-arabic-400-normal.woff2',
  './cairo-arabic-700-normal.woff2'
];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  console.log('📦 تثبيت Service Worker - الإصدار:', CACHE_VERSION);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('⚠️ فشل تخزين:', url, err))
        )
      );
    })
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  console.log('✅ تنشيط Service Worker - الإصدار:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('🗑️ حذف كاش قديم:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION
          });
        });
      });
    })
  );
});

// ==================== FETCH ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  if (request.method !== 'GET') return;
  if (request.url.startsWith('chrome-extension://')) return;
  
  // طلبات صفحة HTML (Network-First)
  if (request.destination === 'document' || request.url.endsWith('.html') || request.url.endsWith('/')) {
    event.respondWith(
      fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // في حال انقطاع الإنترنت، جلب الصفحة من الذاكرة المؤقتة
        return caches.match(request).then(cached => cached || caches.match('./index.html'));
      })
    );
    return;
  }
  
  // باقي الملفات (المكتبات، الخطوط، الصور) - Cache-First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // تحديث الملف في الخلفية إذا كان هناك إنترنت
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
            caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse.clone()));
          }
        }).catch(() => {});
        
        return cachedResponse;
      }
      
      // إذا لم يكن الملف محفوظاً، قم بجلبه من الشبكة
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        return new Response('⚠️ لا يوجد اتصال بالإنترنت', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});

// ==================== MESSAGE ====================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION') event.ports[0].postMessage({ version: CACHE_VERSION });
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      Promise.all(keys.map(k => caches.delete(k))).then(() => {
        event.ports[0].postMessage({ success: true });
      });
    });
  }
});