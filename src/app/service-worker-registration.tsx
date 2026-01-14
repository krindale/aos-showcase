'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/utils/pwaUtils';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Register service worker with proper basePath handling
    registerServiceWorker({
      onSuccess: (registration) => {
        console.log('[PWA] Service worker registered successfully');
        console.log('[PWA] Scope:', registration.scope);
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onUpdate: (registration) => {
        console.log('[PWA] New service worker available');
        console.log('[PWA] Reload the page to get the latest version');
        // Optional: Could show a notification to user here
      },
      onError: (error) => {
        console.error('[PWA] Service worker registration failed:', error);
      },
    });
  }, []);

  return null;
}
