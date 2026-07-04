'use client';

// 화면 상단 중앙 토스트 렌더러. useToastStore를 구독해 표시하고 일정 시간 후 자동 사라짐.

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Info } from 'lucide-react';
import { useToastStore, Toast } from '@/store/toastStore';
import { safeTimeout } from '@/utils/safeTimers';

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    // safeTimeout — 백그라운드 탭 스로틀 회피 규칙(CLAUDE.md)
    return safeTimeout(() => onDismiss(toast.id), 2800);
  }, [toast.id, onDismiss]);

  const isError = toast.kind === 'error';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      onClick={() => onDismiss(toast.id)}
      className={`pointer-events-auto cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-xl backdrop-blur-sm text-sm font-medium ${
        isError
          ? 'bg-steam-red/15 border-steam-red/40 text-steam-red'
          : 'bg-background-secondary/95 border-accent/40 text-foreground'
      }`}
    >
      {isError ? <AlertCircle size={16} className="flex-shrink-0" /> : <Info size={16} className="flex-shrink-0" />}
      <span>{toast.text}</span>
    </motion.div>
  );
}

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return (
    <div className="fixed top-[76px] left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none w-[calc(100%-2rem)] max-w-md">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
