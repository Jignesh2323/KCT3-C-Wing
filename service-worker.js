const CACHE_NAME = 'cwing-shell-v6';
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './supabase-js-2.117.2.js',
];
// Google Fonts is the only third-party static content the page still
// loads; caching it here means a repeat open needs nothing from any
// other site before it can paint.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// How long opening the app waits for a fresh page before falling back to
// the saved copy (weak signal / offline).
const PAGE_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// The page itself (index.html) is NETWORK-FIRST: opening the app asks for
// a fresh copy, bypassing the browser's own HTTP cache (GitHub Pages
// marks pages cacheable for 10 min), so a new version shows on the very
// first open after it ships. Only if that takes longer than
// PAGE_TIMEOUT_MS or fails (offline) is the saved copy used. Before this,
// the page was stale-while-revalidate, which meant every update needed
// the app opened twice.
//
// Everything else in the shell (supabase-js, manifest, icons, fonts) stays
// stale-while-revalidate -- instant from cache, refreshed in the
// background. Supabase API calls are not intercepted at all; maintenance
// data must always be live.
function isPage(request, url) {
  return request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !FONT_HOSTS.includes(url.hostname)) return;

  if (url.origin === self.location.origin && isPage(event.request, url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const network = fetch(event.request, { cache: 'no-cache' }).then((response) => {
        if (response.ok) cache.put('./index.html', response.clone());
        return response;
      });
      const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS));
      try {
        const fresh = await Promise.race([network, timeout]);
        if (fresh) return fresh;
      } catch (e) { /* offline -- fall through to the saved copy */ }
      const cached = await cache.match('./index.html');
      return cached || network;
    })());
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          // Never let an error page replace a good cached copy. Opaque
          // (no-cors) responses hide their status, so those are kept.
          if (response.ok || response.type === 'opaque') cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
