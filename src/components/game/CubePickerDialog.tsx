'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { CubeColor, CUBE_COLORS } from '@/types/game';

/**
 * 화물 선택 팝업 (모바일 전용).
 *
 * 보드의 화물 큐브는 도시 하나에 여러 개가 18px 간격으로 붙어 렌더되는데, 모바일에서는
 * 축척까지 걸려 손가락으로 특정 큐브를 짚기가 사실상 불가능하다. 그래서 좁은 화면에서는
 * **도시를 누르면** 그 도시의 화물을 이 팝업에 큼직하게 펼쳐 고르게 한다.
 * 고르고 나면 기존 흐름 그대로다 — selectCube가 목적지 링·경로를 띄운다.
 *
 * 데스크톱에서는 열리지 않는다(큐브를 직접 클릭하는 편이 빠르다). 여는 조건 판단은
 * GameBoard가 하고, 이 컴포넌트는 표시와 선택만 담당한다.
 */

/** 화물 색 이름 — 팝업에서 색만으로 구분하기 어려운 경우(색각 이상 포함)를 위한 라벨 */
const CUBE_LABEL: Record<CubeColor, string> = {
  red: '빨강',
  blue: '파랑',
  yellow: '노랑',
  purple: '보라',
  black: '검정',
  white: '면화',
};

export default function CubePickerDialog({
  open,
  cityName,
  cubes,
  onPick,
  onClose,
}: {
  open: boolean;
  cityName: string;
  /** 도시의 화물 목록 — 인덱스가 곧 selectCube의 cubeIndex다 */
  cubes: CubeColor[];
  onPick: (cubeIndex: number) => void;
  onClose: () => void;
}) {
  // ESC 닫기 (ConfirmDialog와 같은 패턴). 스크롤락은 걸지 않는다 — 이 팝업은 보드 위에
  // 잠깐 뜨는 선택 UI라, 닫은 뒤 보드를 바로 조작해야 한다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/40 p-4 pb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="glass-card w-full max-w-sm p-4"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${cityName} 화물 선택`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-foreground">{cityName}</h3>
                <p className="text-xs text-foreground-secondary">운송할 화물을 고르세요</p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-foreground-secondary transition-colors hover:bg-foreground/10"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            {cubes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cubes.map((color, i) => (
                  <button
                    key={`${color}-${i}`}
                    onClick={() => onPick(i)}
                    // 손가락 타깃 최소 44px — 보드의 작은 큐브를 짚지 못해 만든 팝업이므로
                    // 여기서까지 작으면 의미가 없다
                    className="flex min-h-[56px] min-w-[72px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-foreground/10 bg-background/60 p-2 transition-colors hover:bg-foreground/5 active:bg-foreground/10"
                    aria-label={`${CUBE_LABEL[color]} 화물 선택`}
                  >
                    <span
                      className="h-7 w-7 rounded"
                      style={{
                        backgroundColor: CUBE_COLORS[color],
                        // 흰 화물(면화)은 카드 배경에 묻히므로 테두리를 준다
                        border: color === 'white' ? '1.5px solid #8a857c' : '1px solid rgba(0,0,0,0.25)',
                      }}
                    />
                    <span className="text-[11px] font-medium text-foreground-secondary">
                      {CUBE_LABEL[color]}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-foreground-secondary">
                이 도시에는 화물이 없습니다
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
