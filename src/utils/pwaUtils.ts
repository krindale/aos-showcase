// PWA 유틸리티 함수 - Service Worker 등록 및 관리
// 이 파일의 모든 함수는 브라우저 환경에서만 동작합니다.

import { BASE_PATH } from '@/utils/basePath';

/**
 * Service Worker 등록 콜백 타입
 */
export type ServiceWorkerCallback = (registration: ServiceWorkerRegistration) => void;

/**
 * Service Worker 에러 콜백 타입
 */
export type ServiceWorkerErrorCallback = (error: Error) => void;

/**
 * Service Worker 등록 옵션
 */
export interface RegisterOptions {
  onSuccess?: ServiceWorkerCallback;
  onUpdate?: ServiceWorkerCallback;
  onError?: ServiceWorkerErrorCallback;
}

/**
 * Service Worker 지원 여부 확인
 * @returns Service Worker가 지원되면 true
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * 현재 환경의 basePath 가져오기
 * @returns basePath (서브패스 배포: /aos-showcase, 루트 배포·개발: '')
 *
 * 값 자체는 src/utils/basePath.ts가 단일 소스다 — Next.js가 라우팅·자산 경로엔
 * basePath를 자동으로 붙여 주지만 **Service Worker 등록 경로는 예외**라 여기서 직접 붙인다.
 */
export function getBasePath(): string {
  return BASE_PATH;
}

/**
 * Service Worker 파일 경로 생성
 * @returns Service Worker 파일의 전체 경로
 */
export function getServiceWorkerPath(): string {
  const basePath = getBasePath();
  return `${basePath}/sw.js`;
}

/**
 * Service Worker 등록
 * @param options 등록 옵션 (성공/업데이트/에러 콜백)
 * @returns 등록 성공 여부 Promise
 */
export async function registerServiceWorker(
  options: RegisterOptions = {}
): Promise<boolean> {
  const { onSuccess, onUpdate, onError } = options;

  // Service Worker 미지원 환경
  if (!isServiceWorkerSupported()) {
    console.log('[PWA] Service Worker not supported');
    return false;
  }

  // 개발 모드: SW를 등록하지 않고, 이전에 등록된 SW와 캐시를 제거
  // (dev에서 SW 캐시가 옛 페이지/JS를 서빙해 코드 변경이 화면에 반영되지 않는 문제 방지)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[PWA] Dev mode: unregistering service workers and clearing caches');
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      console.warn('[PWA] Dev cleanup failed:', e);
    }
    return false;
  }

  try {
    const swPath = getServiceWorkerPath();
    console.log('[PWA] Registering service worker:', swPath);

    const registration = await navigator.serviceWorker.register(swPath, {
      scope: `${getBasePath()}/`,
      // sw.js 자체를 HTTP 캐시에서 받지 않고 항상 네트워크로 확인 → 새 배포본 SW를 즉시 감지,
      // activate 훅이 옛 캐시(옛 JS 청크)를 지워 청크 불일치(a[e] is not a function)를 방지
      updateViaCache: 'none',
    });

    console.log('[PWA] Service worker registered:', registration);

    // 새로운 Service Worker가 설치되었을 때
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // 업데이트된 Service Worker 발견
            console.log('[PWA] New service worker available');
            onUpdate?.(registration);
          } else {
            // 첫 설치
            console.log('[PWA] Service worker installed for the first time');
            onSuccess?.(registration);
          }
        }
      });
    });

    // 이미 활성화된 경우
    if (registration.active && !navigator.serviceWorker.controller) {
      onSuccess?.(registration);
    }

    return true;
  } catch (error) {
    console.error('[PWA] Service worker registration failed:', error);
    onError?.(error as Error);
    return false;
  }
}

/**
 * Service Worker 등록 해제
 * @returns 해제 성공 여부 Promise
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    console.log('[PWA] Service Worker not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const unregistered = await registration.unregister();

    if (unregistered) {
      console.log('[PWA] Service worker unregistered successfully');
      // 모든 캐시 삭제
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
        console.log('[PWA] All caches cleared');
      }
    }

    return unregistered;
  } catch (error) {
    console.error('[PWA] Service worker unregistration failed:', error);
    return false;
  }
}

/**
 * Service Worker 업데이트 확인
 * @returns 업데이트 확인 성공 여부 Promise
 */
export async function checkForUpdates(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    console.log('[PWA] Service Worker not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    console.log('[PWA] Checking for service worker updates...');

    await registration.update();
    console.log('[PWA] Update check complete');

    return true;
  } catch (error) {
    console.error('[PWA] Update check failed:', error);
    return false;
  }
}

/**
 * 새 Service Worker로 즉시 전환 (SKIP_WAITING 메시지 전송)
 * @returns 전환 성공 여부 Promise
 */
export async function skipWaiting(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    console.log('[PWA] Service Worker not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const waitingWorker = registration.waiting;

    if (waitingWorker) {
      console.log('[PWA] Sending SKIP_WAITING message to service worker');
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });

      // 새 Service Worker가 활성화될 때까지 대기
      return new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[PWA] Controller changed, reloading page');
          window.location.reload();
          resolve(true);
        });
      });
    }

    console.log('[PWA] No waiting service worker found');
    return false;
  } catch (error) {
    console.error('[PWA] Skip waiting failed:', error);
    return false;
  }
}

/**
 * 모든 캐시 삭제 (CLEAR_CACHE 메시지 전송)
 * @returns 캐시 삭제 성공 여부 Promise
 */
export async function clearAllCaches(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    console.log('[PWA] Service Worker not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    if (registration.active) {
      console.log('[PWA] Sending CLEAR_CACHE message to service worker');
      registration.active.postMessage({ type: 'CLEAR_CACHE' });
    }

    // 클라이언트 측에서도 캐시 삭제
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
      console.log('[PWA] All caches cleared on client');
    }

    return true;
  } catch (error) {
    console.error('[PWA] Clear caches failed:', error);
    return false;
  }
}

/**
 * 현재 Service Worker 등록 상태 확인
 * @returns Service Worker 등록 정보 또는 null
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration || null;
  } catch (error) {
    console.error('[PWA] Failed to get service worker registration:', error);
    return null;
  }
}

/**
 * Service Worker 상태 정보
 */
export interface ServiceWorkerStatus {
  supported: boolean;
  registered: boolean;
  active: boolean;
  waiting: boolean;
  installing: boolean;
}

/**
 * Service Worker 현재 상태 가져오기
 * @returns Service Worker 상태 정보
 */
export async function getServiceWorkerStatus(): Promise<ServiceWorkerStatus> {
  const status: ServiceWorkerStatus = {
    supported: isServiceWorkerSupported(),
    registered: false,
    active: false,
    waiting: false,
    installing: false,
  };

  if (!status.supported) {
    return status;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();

    if (registration) {
      status.registered = true;
      status.active = !!registration.active;
      status.waiting = !!registration.waiting;
      status.installing = !!registration.installing;
    }
  } catch (error) {
    console.error('[PWA] Failed to get service worker status:', error);
  }

  return status;
}

/**
 * 온라인/오프라인 상태 변경 콜백 타입
 */
export type NetworkStatusCallback = (isOnline: boolean) => void;

/**
 * 현재 온라인 상태 확인
 * @returns 온라인이면 true, 오프라인이면 false
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true; // SSR 환경에서는 기본값으로 온라인으로 간주
  }
  return navigator.onLine;
}

/**
 * 온라인/오프라인 이벤트 리스너 등록
 * @param callback 상태 변경 시 호출될 콜백 함수
 * @returns 리스너 제거 함수
 */
export function addNetworkStatusListener(
  callback: NetworkStatusCallback
): (() => void) | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const onlineHandler = () => {
    console.log('[PWA] Network status: online');
    callback(true);
  };

  const offlineHandler = () => {
    console.log('[PWA] Network status: offline');
    callback(false);
  };

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  // 리스너 제거 함수 반환
  return () => {
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
}

/**
 * 온라인/오프라인 이벤트 리스너 제거
 * @param onlineHandler 온라인 이벤트 핸들러
 * @param offlineHandler 오프라인 이벤트 핸들러
 */
export function removeNetworkStatusListener(
  onlineHandler: () => void,
  offlineHandler: () => void
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.removeEventListener('online', onlineHandler);
  window.removeEventListener('offline', offlineHandler);
}
