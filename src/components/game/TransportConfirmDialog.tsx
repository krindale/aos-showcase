'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Train } from 'lucide-react';

/**
 * 화물 운송 확인 창 — 설정(gameSettingsStore.transportConfirmEnabled)이 on일 때,
 * 목적지 클릭 → 즉시 운송 대신 이 창으로 "출발 → 도착 (N링크)"와 링크별 수익 귀속
 * (누가 수입 +몇)을 보여주고 [운송/취소]를 받는다. 표시 전용 — 실제 커밋은 부모
 * (GameBoard)가 확인 시 selectDestinationCity를 호출한다. 후보 경로가 여럿인 경우
 * (타인 철도 경로 선택 모드)는 그 모드 자체가 확인 단계라 이 창을 거치지 않는다.
 */

export interface TransportPreview {
  from: string;
  to: string;
  linkCount: number;
  /** 링크 소유자별 수입 증가 (내 수입 포함 — isMe로 강조) */
  gains: { name: string; color: string; amount: number; isMe: boolean }[];
  /** 무수입 링크 수 (정부 링크·파산 해제 트랙) */
  noIncomeLinks: number;
}

export default function TransportConfirmDialog({
  preview,
  onConfirm,
  onCancel,
}: {
  preview: TransportPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const open = preview !== null;

  // 스크롤락 + ESC 취소 (ConfirmDialog 패턴)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {preview && (
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
            aria-label="화물 운송 확인"
          >
            <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              <Train size={18} className="text-accent" /> 화물 운송 확인
            </h3>
            <p className="text-sm text-foreground mb-3">
              <b>{preview.from}</b> <span className="text-foreground-muted">→</span> <b>{preview.to}</b>{' '}
              <span className="text-foreground-secondary">({preview.linkCount}링크)</span>
            </p>

            {/* 링크별 수익 귀속 — 수입 트랙 +n */}
            <div className="rounded-lg bg-background-tertiary p-3 mb-4 space-y-1.5">
              {preview.gains.length === 0 && preview.noIncomeLinks === 0 && (
                <p className="text-xs text-foreground-muted">수입 변동 없음</p>
              )}
              {preview.gains.map((g) => (
                <div key={g.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-black/20"
                    style={{ backgroundColor: g.color }}
                  />
                  <span className="text-foreground flex-1 truncate">
                    {g.name}
                    {g.isMe && <span className="text-accent text-xs"> (나)</span>}
                  </span>
                  <span className={`font-bold ${g.isMe ? 'text-positive' : 'text-foreground'}`}>
                    수입 +{g.amount}
                  </span>
                </div>
              ))}
              {preview.noIncomeLinks > 0 && (
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  <span className="w-3 h-3 rounded-full flex-shrink-0 bg-foreground/20" />
                  무수입 링크 (정부/공용) ×{preview.noIncomeLinks}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancel}
                className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold"
              >
                취소
              </button>
              <button
                onClick={onConfirm}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold"
              >
                운송
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
