'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 디자인 시스템 확인 다이얼로그 — window.confirm 대체.
 * 네이티브 confirm은 크림 페이퍼 디자인과 안 맞고, 브라우저 자동화/E2E를
 * 완전히 블로킹한다(다이얼로그가 열리면 페이지 이벤트가 전부 멈춤).
 * 페이퍼 카드 + 버밀리언 확인 버튼 (TranscontinentalModal과 동일한 모달 패턴).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // 다이얼로그가 떠 있는 동안 배경 페이지 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="glass-card relative max-w-sm w-full p-6"
            initial={{ scale: 0.9, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            {title && <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>}
            <p className="text-sm text-foreground-secondary leading-relaxed mb-5">{message}</p>
            <div className="flex gap-2">
              <button onClick={onCancel} className="btn-secondary flex-1" aria-label={cancelLabel}>
                {cancelLabel}
              </button>
              <button onClick={onConfirm} className="btn-primary flex-1" aria-label={confirmLabel}>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
