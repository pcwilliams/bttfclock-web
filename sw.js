// Service worker: lets the installed app start without a connection.
//
// - Same-origin files: network-first (with a timeout), so online users
//   always get the latest deploy and nothing needs a version bump.
// - three.js (jsDelivr, version-pinned) and Google Fonts: cache-first,
//   because those URLs never change their content.
// - The page posts a "warm" message after it loads, listing every
//   resource it used, so the very first visit is enough for offline use
//   (the first load isn't controlled by the worker, so it can't see it).
//   Font files are found by reading the Google Fonts stylesheet, since
//   browsers leave them out of resource timing.

const CACHE = 'time-circuits-v1';
const CDN_HOSTS = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'warm' || !Array.isArray(event.data.urls)) return;
  event.waitUntil(warm(event.data.urls));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(event));
  else if (CDN_HOSTS.has(url.host)) event.respondWith(cacheFirst(req));
});

function cacheable(url) {
  const u = new URL(url, self.location.href);
  return u.origin === self.location.origin || CDN_HOSTS.has(u.host);
}

async function warm(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(urls.filter(cacheable).map((url) => warmOne(cache, url)));
}

async function warmOne(cache, url) {
  let res = await cache.match(url);
  if (!res) {
    try {
      const fetched = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!fetched.ok) return;
      await cache.put(url, fetched.clone());
      res = fetched;
    } catch {
      return; // best effort: anything missed is cached on the next visit
    }
  }
  // Font files don't show up in the page's resource timing, so read the
  // Google Fonts stylesheet and cache the files it points at.
  if (new URL(url).host === 'fonts.googleapis.com') {
    const css = await res.clone().text();
    const fonts = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/g)].map((m) => m[1]);
    await Promise.all(fonts.map((u) => warmOne(cache, u)));
  }
}

async function networkFirst(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) event.waitUntil(cache.put(req, res.clone()));
    return res;
  });
  network.catch(() => {}); // a late failure after the timeout isn't an error
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // Offline: fall through to the cache.
  }
  const cached = await cachedFor(cache, req);
  return cached ?? network; // still nothing cached: keep waiting on the network
}

/** Cache lookup that maps any navigation (e.g. ?cities=…) onto the app shell. */
async function cachedFor(cache, req) {
  if (req.mode === 'navigate') {
    return (await cache.match(req, { ignoreSearch: true }))
      ?? (await cache.match(new URL('./', self.registration.scope).href));
  }
  return cache.match(req);
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}
