const CACHE_NAME = 'cwing-shell-v3';
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

// Stale-while-revalidate for the app shell: a repeat open shows the
// already-cached page INSTANTLY (no network round-trip before the first
// paint), while a fresh copy downloads in the background for next time --
// so residents never wait on the shell itself, and still get the latest
// build within a visit or two of it shipping. First-ever visit (nothing
// cached yet) falls through to a normal network fetch. Supabase API calls
// are left untouched (not intercepted) since maintenance data must always
// be live.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !FONT_HOSTS.includes(url.hostname)) return;

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
