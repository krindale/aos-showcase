'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { useGameSettingsStore } from '@/store/gameSettingsStore';

/**
 * 게임 설정 창 (보드 헤더 ⚙ 버튼) — 개인 표시 설정 스위치 모음.
 * - 운송 가이드: 목적지 골드 링·최적 경로 점선 (방 설정이 금지면 off 고정 + 잠김 안내)
 * - 화물 운송 확인 창: 목적지 클릭 시 경로·수익 확인 후 운송 (기본 off = 즉시 운송)
 * - 좌표 표시: 헥스 좌표 디버그 오버레이
 * 전부 로컬 개인 설정(gameSettingsStore) — 게임 상태/스냅샷과 무관. ConfirmDialog와
 * 동일한 모달 패턴(스크롤락·백드롭 클릭 닫기·ESC).
 */

function SettingRow({
  label,
  description,
  on,
  disabled,
  disabledNote,
  onToggle,
}: {
  label: string;
  description: string;
  on: boolean;
  disabled?: boolean;
  disabledNote?: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-foreground/10 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <p className="text-xs text-foreground-secondary leading-snug mt-0.5">
          {disabled && disabledNote ? disabledNote : description}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => { if (!disabled) onToggle(); }}
        disabled={disabled}
        className="flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={`relative inline-block w-10 h-[22px] rounded-full transition-colors ${
            on ? 'bg-accent' : 'bg-foreground/25'
          }`}
        >
          <span
            className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${
              on ? 'translate-x-[18px]' : ''
            }`}
          />
        </span>
      </button>
    </div>
  );
}

export default function GameSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const moveGuideAllowed = useGameStore((s) => s.moveGuideAllowed ?? true);
  const { moveGuideEnabled, transportConfirmEnabled, showCoords, toggleMoveGuide, toggleTransportConfirm, toggleShowCoords } =
    useGameSettingsStore();

  // 스크롤락 + ESC 닫기 (ConfirmDialog 패턴)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="glass-card relative max-w-sm w-full p-6"
            initial={{ scale: 0.9, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="게임 설정"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-foreground">게임 설정</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground-secondary"
                aria-label="설정 닫기"
              >
                <X size={16} />
              </button>
            </div>

            <SettingRow
              label="운송 가이드"
              description="화물 선택 시 배달 가능한 도시(골드 링)와 최적 경로(점선)를 표시합니다"
              on={moveGuideAllowed && moveGuideEnabled}
              disabled={!moveGuideAllowed}
              disabledNote="방 설정에서 운송 가이드가 꺼진 게임입니다 (변경 불가)"
              onToggle={toggleMoveGuide}
            />
            <SettingRow
              label="화물 운송 확인 창"
              description="목적지 클릭 시 경로와 수익 배분을 확인한 뒤 운송합니다 (끄면 즉시 운송)"
              on={transportConfirmEnabled}
              onToggle={toggleTransportConfirm}
            />
            <SettingRow
              label="좌표 표시"
              description="헥스 좌표를 보드 위에 표시합니다 (디버그용)"
              on={showCoords}
              onToggle={toggleShowCoords}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
