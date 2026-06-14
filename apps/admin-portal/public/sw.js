/* SwiftShip Admin — Service Worker
 *
 * NOTE: This is a manual fallback service worker. The `@ducanh2912/next-pwa`
 * plugin generates a fully featured Workbox-based worker in `next build` and
 * registers it automatically. This file is committed to `public/` so that
 * `next dev` and the static export also have a working SW for local testing
 * and Lighthouse audits. In production the file emitted by next-pwa takes
 * precedence at `/sw.js`.
 *
 * Cache strategies:
 *   - stale-while-revalidate: JS/CSS/font bundles (_next/static/*)
 *   - cache-first:            images and fonts
 *   - network-first:          /api/* and /graphql (with offline fallback)
 *   - network-first with SWR: navigations (HTML pages)
 */

/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

const SW_VERSION = 'swiftship-admin-v1';
const STATIC_CACHE = `${SW_VERSION}-static-v1`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime-v1`;
const IMAGE_CACHE = `${SW_VERSION}-images-v1`;
const API_CACHE = `${SW_VERSION}-api-v1`;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/static/')
  );
}

function isImage(url) {
  return /\.(png|jpg|jpeg|svg|gif|webp|avif|ico)$/i.test(url.pathname);
}

function isApi(url) {
  return (
    url.pathname.startsWith('/api/') || url.pathname.startsWith('/graphql')
  );
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return cached || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'SwiftShip Admin is offline and this response is not cached.',
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first with offline fallback to cached "/"
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isApi(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (isImage(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (isAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Default: network falling back to cache
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      return cached || Response.error();
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
