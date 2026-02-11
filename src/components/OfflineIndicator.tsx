'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [showSyncIndicator, setShowSyncIndicator] = useState(false);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Event handlers
    const handleOnline = () => {
      setIsOnline(true);
      // Start sync when coming back online
      setSyncStatus('syncing');
      setShowSyncIndicator(true);

      // Simulate sync completion
      setTimeout(() => {
        setSyncStatus('synced');
        setTimeout(() => {
          setShowSyncIndicator(false);
          setSyncStatus('idle');
        }, 2000);
      }, 1500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('idle');
      setShowSyncIndicator(false);
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Get sync icon and color based on status
  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <RefreshCw className="w-5 h-5 text-accent animate-spin" />;
      case 'synced':
        return <CheckCircle2 className="w-5 h-5 text-steam-green" />;
      case 'error':
        return <CloudOff className="w-5 h-5 text-steam-red" />;
      default:
        return <Cloud className="w-5 h-5 text-accent" />;
    }
  };

  const getSyncMessage = () => {
    switch (syncStatus) {
      case 'syncing':
        return { title: '동기화 중...', subtitle: '데이터를 동기화하고 있습니다' };
      case 'synced':
        return { title: '동기화 완료', subtitle: '모든 데이터가 최신 상태입니다' };
      case 'error':
        return { title: '동기화 오류', subtitle: '다시 시도해주세요' };
      default:
        return { title: '온라인', subtitle: '' };
    }
  };

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

      {isOnline && showSyncIndicator && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50"
        >
          <motion.div
            animate={syncStatus === 'syncing' ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 1, repeat: syncStatus === 'syncing' ? Infinity : 0 }}
            className={`glass-card px-6 py-3 flex items-center gap-3 shadow-lg ${
              syncStatus === 'synced'
                ? 'border border-steam-green/30'
                : syncStatus === 'error'
                ? 'border border-steam-red/30'
                : 'border border-accent/30'
            }`}
          >
            {getSyncIcon()}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {getSyncMessage().title}
              </span>
              {getSyncMessage().subtitle && (
                <span className="text-xs text-foreground-secondary">
                  {getSyncMessage().subtitle}
                </span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
