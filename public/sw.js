// Age of Steam PWA Service Worker
// Handles offline caching and PWA functionality

const CACHE_VERSION = 'aos-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const BASE_PATH = '/aos-showcase';

// Assets to precache during service worker installation
const PRECACHE_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icons/icon-192x192.png`,
  `${BASE_PATH}/icons/icon-512x512.png`,
];

// Maximum number of items in dynamic cache
const MAX_DYNAMIC_CACHE_SIZE = 50;

/**
 * Install Event - Precache critical assets
 * Triggered when service worker is first installed
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[ServiceWorker] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[ServiceWorker] Installation complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[ServiceWorker] Installation failed:', error);
      })
  );
});

/**
 * Activate Event - Clean up old caches
 * Triggered when service worker takes control
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Remove old caches that don't match current version
              return cacheName.startsWith('aos-') &&
                     cacheName !== STATIC_CACHE &&
                     cacheName !== DYNAMIC_CACHE;
            })
            .map((cacheName) => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activation complete');
        return self.clients.claim(); // Take control immediately
      })
  );
});

/**
 * Fetch Event - Serve from cache with fallback strategies
 * Implements cache-first for static assets, network-first for pages
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    handleFetchRequest(request, url)
  );
});

/**
 * Handle fetch request with appropriate caching strategy
 */
async function handleFetchRequest(request, url) {
  // Strategy 1: Cache-first for static assets (_next/static/*, icons, manifest)
  if (isStaticAsset(url.pathname)) {
    return cacheFirst(request, STATIC_CACHE);
  }

  // Strategy 2: Network-first for HTML pages and dynamic content
  if (isPageRequest(url.pathname)) {
    return networkFirst(request, DYNAMIC_CACHE);
  }

  // Strategy 3: Cache-first for other assets (images, etc.)
  return cacheFirst(request, DYNAMIC_CACHE);
}

/**
 * Check if request is for static assets
 */
function isStaticAsset(pathname) {
  return pathname.includes('/_next/static/') ||
         pathname.includes('/icons/') ||
         pathname.endsWith('.png') ||
         pathname.endsWith('.jpg') ||
         pathname.endsWith('.jpeg') ||
         pathname.endsWith('.svg') ||
         pathname.endsWith('.webp') ||
         pathname.endsWith('.woff') ||
         pathname.endsWith('.woff2') ||
         pathname.endsWith('manifest.json');
}

/**
 * Check if request is for a page (HTML)
 */
function isPageRequest(pathname) {
  // Next.js pages end with / or .html, or have no extension
  const hasExtension = pathname.includes('.') && !pathname.endsWith('/');
  return !hasExtension || pathname.endsWith('.html');
}

/**
 * Cache-first strategy: Serve from cache, fallback to network
 * Best for static assets that rarely change
 */
async function cacheFirst(request, cacheName) {
  try {
    // Try to get from cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[ServiceWorker] Cache hit:', request.url);
      return cachedResponse;
    }

    // If not in cache, fetch from network
    console.log('[ServiceWorker] Cache miss, fetching:', request.url);
    const networkResponse = await fetch(request);

    // Cache the new response for future use
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      await limitCacheSize(cacheName, MAX_DYNAMIC_CACHE_SIZE);
    }

    return networkResponse;
  } catch (error) {
    console.error('[ServiceWorker] Cache-first failed:', error);
    return new Response('Offline - Asset not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain',
      }),
    });
  }
}

/**
 * Network-first strategy: Try network, fallback to cache
 * Best for dynamic content that should be fresh
 */
async function networkFirst(request, cacheName) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    // Cache successful response
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      await limitCacheSize(cacheName, MAX_DYNAMIC_CACHE_SIZE);
    }

    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    console.log('[ServiceWorker] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Both failed - return offline page
    return new Response('Offline - Page not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/html',
      }),
    });
  }
}

/**
 * Limit cache size by removing oldest entries
 */
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxSize) {
    // Remove oldest entries (first in array)
    const entriesToDelete = keys.length - maxSize;
    for (let i = 0; i < entriesToDelete; i++) {
      await cache.delete(keys[i]);
    }
    console.log(`[ServiceWorker] Trimmed ${entriesToDelete} old entries from ${cacheName}`);
  }
}

/**
 * Message handler for commands from the app
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[ServiceWorker] Clearing all caches');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
