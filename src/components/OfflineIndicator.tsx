'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Event handlers
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="glass-card px-6 py-3 flex items-center gap-3 border border-steam-red/30 shadow-lg">
            <WifiOff className="w-5 h-5 text-steam-red" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                오프라인 모드
              </span>
              <span className="text-xs text-foreground-secondary">
                일부 기능이 제한될 수 있습니다
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
