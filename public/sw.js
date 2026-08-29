// Service Worker - مرکز نشر آثار
const CACHE_NAME = 'nashr-asar-v55';
const STATIC_CACHE = 'nashr-static-v55';
const DYNAMIC_CACHE = 'nashr-dynamic-v55';

// صفحه اصلی و فونت‌ها را pre-cache می‌کنیم
// فایل‌های JS/CSS با استراتژی network-first بارگذاری می‌شوند (همیشه به‌روز)
const STATIC_ASSETS = [
  '/',
  '/vendor/fa/webfonts/fa-solid-900.woff2',
  '/vendor/fa/webfonts/fa-regular-400.woff2',
  '/vendor/fa/webfonts/fa-brands-400.woff2',
  '/vendor/fonts/vazir/Vazir-Thin.woff2',
  '/vendor/fonts/vazir/Vazir-Light.woff2',
  '/vendor/fonts/vazir/Vazir-Regular.woff2',
  '/vendor/fonts/vazir/Vazir-Medium.woff2',
  '/vendor/fonts/vazir/Vazir-Bold.woff2',
  '/vendor/fonts/vazir/Vazir-Black.woff2',
  '/vendor/fonts/shabnam/Shabnam-Thin.woff2',
  '/vendor/fonts/shabnam/Shabnam-Light.woff2',
  '/vendor/fonts/shabnam/Shabnam.woff2',
  '/vendor/fonts/shabnam/Shabnam-Medium.woff2',
  '/vendor/fonts/shabnam/Shabnam-Bold.woff2',
];

function offlineResponse(msg) {
  return new Response(JSON.stringify({ error: msg || 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Install: فقط فونت‌ها را pre-cache کن
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: کش‌های قدیمی را پاک کن و کنترل را بگیر.
// صفحات باز فقط وقتی reload می‌شوند که واقعاً نسخه قبلی SW وجود داشته باشد؛
// در نصب اولیه (بازدید اول) reload لازم نیست و باعث می‌شد کاربر جدید بلافاصله
// یک بار صفحه‌اش دوباره بارگذاری شود.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE);
    await Promise.all(stale.map(key => caches.delete(key)));
    const isUpgrade = stale.length > 0;
    await self.clients.claim();
    if (!isUpgrade) return;
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clientList.map(client => client.navigate(client.url).catch(() => {})));
  })());
});

// پیام skipWaiting از اپ برای فعال‌سازی فوری SW جدید
self.addEventListener('message', event => {
  // فقط پیام‌های same-origin پذیرفته می‌شوند
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and chrome-extension
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // API calls - network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => offlineResponse('api offline'))
    );
    return;
  }

  // فایل‌های JS و CSS: network-first (همیشه نسخه جدید، آفلاین از کش)
  if (url.hostname === self.location.hostname &&
      url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || offlineResponse('script offline')))
    );
    return;
  }

  // WP API - network first with cache fallback
  if (url.hostname.includes('dastgheibqoba.info') && url.pathname.includes('/wp-json/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || offlineResponse('wp offline')))
    );
    return;
  }

  // آیکون‌ها و تصاویر — network first
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/logos/') || url.pathname.startsWith('/banners/') || url.pathname.startsWith('/sliders/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(event.request).then(r => r || new Response('', { status: 404 })))
    );
    return;
  }

  // فونت‌ها و فایل‌های باینری — cache first (تغییر نمی‌کنند)
  if (url.pathname.match(/\.(woff|woff2|ttf|png|jpg|jpeg|gif|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        }).catch(() => offlineResponse('asset offline'));
      })
    );
    return;
  }

  // HTML pages - network first
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match('/').then(r => r || offlineResponse('page offline')))
  );
});

// Push notifications
async function broadcastToClients(msg) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach(c => { try { c.postMessage(msg); } catch(e) {} });
}

self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'مرکز نشر آثار', body: event.data.text() }; }
  const payload = data.data || { url: '/' };
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'مرکز نشر آثار', {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-72.png',
      tag: data.tag || 'notif',
      data: payload,
      dir: 'rtl',
      lang: 'fa',
      vibrate: [200, 100, 200]
    });
    // اگر اپ باز است، لیست اعلان‌های داخل برنامه را فوراً تازه کن؛ وگرنه
    // کاربر اعلان را روی گوشی می‌بیند ولی داخل برنامه تا ۶۰ ثانیه خبری نیست.
    await broadcastToClients({ type: 'PUSH_RECEIVED', payload });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const payload = event.notification.data || { url: '/' };
  const url = payload.url || '/';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = list.find(c => c.url.startsWith(self.location.origin));
    if (existing) {
      // بدون navigate — تا وضعیت اپ (SPA) از دست نرود؛ خودِ اپ صفحهٔ درست را باز می‌کند.
      try { await existing.focus(); } catch(e) {}
      try { existing.postMessage({ type: 'NOTIFICATION_CLICK', payload }); return; } catch(e) {}
      try { await existing.navigate(url); } catch(e) {}
      return;
    }
    await self.clients.openWindow(url);
  })());
});
