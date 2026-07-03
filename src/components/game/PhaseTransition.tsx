'use client';

/**
 * 단계 전환 1초 멈춤 오버레이 (사용자 요청 2026-07-04)
 * 단계가 바뀌는 순간(주식 발행 → 플레이어 순서 → 행동 선택 …) 1초 동안
 * 전환 안내를 크게 띄우고 입력을 막아 "한 박자 쉬는" 리듬을 만든다.
 * 게임 엔진 타이밍은 건드리지 않는 순수 UI 레이어 — 시뮬 테스트/AI 경로 무영향.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { GamePhase, PHASE_INFO } from '@/types/game';
import { ChevronRight } from 'lucide-react';

/** 오버레이 표시 시간 (ms) */
const PAUSE_MS = 1000;

/** 전환 안내를 띄우는 단계 (셋업/게임오버 제외) */
const GAME_PHASES: GamePhase[] = [
  'issueShares',
  'determinePlayerOrder',
  'selectActions',
  'buildTrack',
  'moveGoods',
  'collectIncome',
  'payExpenses',
  'incomeReduction',
  'goodsGrowth',
  'advanceTurn',
];

export default function PhaseTransition() {
  const currentPhase = useGameStore((s) => s.currentPhase);
  const prevPhase = useRef<GamePhase | null>(null);
  const [show, setShow] = useState<{ from: GamePhase; to: GamePhase } | null>(null);

  useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = currentPhase;
    // 첫 마운트(새로고침 복원 포함)나 게임 단계 밖 전환은 안내 생략
    if (!from || from === currentPhase) return;
    if (!GAME_PHASES.includes(from) || !GAME_PHASES.includes(currentPhase)) return;

    setShow({ from, to: currentPhase });
    const timer = setTimeout(() => setShow(null), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [currentPhase]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          // 입력 차단(1초 멈춤) — pointer-events가 살아 있는 반투명 백드롭
          className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px]"
          aria-live="polite"
        >
          <motion.div
            initial={{ scale: 0.92, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="glass-card px-8 py-5 rounded-2xl flex items-center gap-4 shadow-xl"
          >
            <span className="text-sm text-foreground-secondary">{PHASE_INFO[show.from].name}</span>
            <ChevronRight size={18} className="text-accent" />
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{PHASE_INFO[show.to].name}</div>
              <div className="text-xs text-foreground-secondary mt-0.5">
                {PHASE_INFO[show.to].description}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
