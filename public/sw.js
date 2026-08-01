// Age of Steam PWA Service Worker
// Handles offline caching and PWA functionality

// 빌드 시 scripts/version-sw.mjs 가 이 값을 빌드 ID로 치환한다(배포마다 유니크 → 옛 캐시 자동 무효화).
// 아래 'aos-v3' 는 치환 실패/로컬용 기본값일 뿐 — 실제 배포본은 'aos-<buildId>' 가 된다.
const CACHE_VERSION = 'aos-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
// basePath를 **자기 위치에서 유도**한다 — 이 파일은 번들을 거치지 않아
// NEXT_PUBLIC_BASE_PATH(src/utils/basePath.ts)를 읽을 수 없기 때문이다.
// self.location.pathname = '<basePath>/sw.js' 이므로 뒤의 '/sw.js'만 떼면 된다:
//   /aos-showcase/sw.js → '/aos-showcase'   (서브패스 배포)
//   /sw.js              → ''                (도메인 루트 배포)
// 하드코딩하지 않으므로 호스팅을 옮겨도 이 파일은 손댈 필요가 없다.
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '');

// Assets to precache during service worker installation
const PRECACHE_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icons/icon-192x192.png`,
  `${BASE_PATH}/icons/icon-512x512.png`,
];

// Maximum number of items in dynamic cache
const MAX_DYNAMIC_CACHE_SIZE = 50;

// 웹폰트 출처 — cross-origin이지만 캐싱한다 (아래 cacheFirstFont).
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
// ⚠️ 폰트는 **배포 버전과 무관한 별도 캐시**에 둔다. STATIC_CACHE는 이름에 빌드 ID가 들어가
// 배포마다 새로 만들어지고 activate가 옛것을 지우므로, 거기 두면 배포할 때마다 폰트를 다시
// 받아야 하고 그 사이 OS 폴백으로 렌더된다 — 이 수정이 없애려던 바로 그 구간이다 (리뷰 R5).
// 폰트 파일 URL은 내용이 바뀌면 URL도 바뀌므로 캐시를 오래 들고 있어도 안전하다. CSS(css2?…)는
// URL이 고정이라 Google이 폰트를 갱신해도 옛 CSS를 계속 쓰는데, 그 CSS가 가리키는 폰트 파일도
// 함께 캐시돼 있어 동작에는 문제가 없다. 강제로 새로 받아야 하면 이 v1을 올린다.
const FONT_CACHE = 'aos-fonts-v1';

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
              // Remove old caches that don't match current version.
              // FONT_CACHE는 배포 버전과 무관하게 유지한다 (위 주석 참조) — 지우면 배포마다
              // 폰트를 다시 받아 폴백 렌더 구간이 생긴다.
              return cacheName.startsWith('aos-') &&
                     cacheName !== STATIC_CACHE &&
                     cacheName !== DYNAMIC_CACHE &&
                     cacheName !== FONT_CACHE;
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

  // Google Fonts는 cross-origin이지만 캐싱한다 — 이게 없으면 재방문·오프라인·PWA 설치
  // 상태에서 웹폰트가 매번 네트워크에 의존하고, 못 받으면 OS 폴백으로 렌더된다.
  // 그 폴백은 맥(Apple SD Gothic Neo)과 윈도우(맑은 고딕)의 한글 폭이 달라, 같은 문장이
  // 윈도우에서만 2줄로 접힌다 (2026-07-29 사용자 보고).
  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(cacheFirstFont(request));
    return;
  }

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
 * 웹폰트 전용 cache-first — 일반 cacheFirst는 `networkResponse.ok`만 보고 캐싱하는데,
 * <link rel="stylesheet">로 나가는 cross-origin 요청은 no-cors라 응답이 opaque(status 0,
 * ok=false)다. 그대로 두면 폰트가 영영 캐시되지 않는다. opaque도 보관하고, 네트워크가
 * 실패하면 캐시본으로 버틴다. 용량 제한(limitCacheSize) 대상인 DYNAMIC이 아니라
 * 배포 버전과 무관한 FONT_CACHE에 넣는다 (위 FONT_CACHE 주석 참조).
 *
 * opaque가 되는 건 CSS 요청 하나뿐이다 — 폰트 파일(gstatic)은 @font-face src가 CORS 모드로
 * 요청하므로 정상 cors 응답(ok=true)이다. opaque는 Cache Storage에서 큰 padding이 붙지만
 * 1건이라 쿼터 영향은 미미하다.
 */
async function cacheFirstFont(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[ServiceWorker] 폰트 요청 실패:', request.url, error);
    return cached || Response.error();
  }
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
