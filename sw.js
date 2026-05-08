/* ══════════════════════════════════════════════
   ATHStudios Verify — Service Worker
   Cache-first for app shell, CDN stale-while-revalidate
   ══════════════════════════════════════════════ */

const SHELL_CACHE = 'athverify-shell-v1';
const CDN_CACHE   = 'athverify-cdn-v1';

/* Derive base path from sw.js location so this works in any subdirectory */
const BASE = self.location.pathname.replace(/\/sw\.js$/, '/');

const PRECACHE_URLS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
];

/* ── Install: precache app shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: purge old caches ── */
self.addEventListener('activate', e => {
  const CURRENT = [SHELL_CACHE, CDN_CACHE];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !CURRENT.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: routing strategy ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Firebase Realtime DB & Auth — always network, never cache */
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com')
  ) {
    return; /* fall through to browser default */
  }

  /* App shell (same origin) — cache first, fallback to network */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(e.request, clone));
          return res;
        }))
    );
    return;
  }

  /* CDN assets (fonts, ZXing, Firebase SDK scripts) — stale-while-revalidate */
  const isCDN =
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')    ||
    url.hostname.includes('unpkg.com')             ||
    url.hostname.includes('gstatic.com')           ||
    url.hostname.includes('cdnjs.cloudflare.com');

  if (isCDN) {
    e.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const networkFetch = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached); /* if network fails, return stale */
          return cached || networkFetch;
        })
      )
    );
  }
});

/* ── Push: native notification handler ── */
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'ATHStudios Verify', {
      body:  data.body  || '',
      icon:  BASE + 'icons/icon-192.png',
      badge: BASE + 'icons/icon-192.png',
      tag:   data.tag   || 'ath-verify',
      data:  data,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(BASE));
});
