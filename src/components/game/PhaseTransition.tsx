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
import { safeTimeout } from '@/utils/safeTimers';
import { playSfx } from '@/utils/sfx';

/**
 * 팝업 유지 시간 (ms) — 스르르 등장(0.4s) → 1.2초 유지 → 스르르 퇴장(0.5s).
 * 목적은 "직전 플레이어의 마지막 행동 결과를 볼 시간"이므로 배경은 가리지 않는다(블러 없음).
 */
const PAUSE_MS = 1200;

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
    playSfx('phase');
    // safeTimeout: 숨김 탭에선 setTimeout이 스로틀돼 팝업이 안 사라진 채
    // 화면 클릭을 계속 막는 버그가 있었다 (탭 복귀 시 최대 1분 잔존)
    const cancel = safeTimeout(() => setShow(null), PAUSE_MS);
    return cancel;
  }, [currentPhase]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeIn' } }}
          // 순수 안내 팝업 — 입력을 막지 않는다(pointer-events-none). 진행 지연은 엔진
          // (AI_ACTION_VIEW_DELAY)이 담당. 차단형이면 숨김 탭에서 exit 애니메이션(rAF)이
          // 멈춰 오버레이가 박제된 채 화면 전체 클릭을 먹는 버그가 있었다.
          // 카드는 상단에 띄워 보드 중앙을 가리지 않는다.
          className="fixed inset-0 z-[60] flex items-start justify-center pt-24 bg-foreground/5 pointer-events-none"
          aria-live="polite"
        >
          <motion.div
            initial={{ scale: 0.94, y: 10 }}
            animate={{ scale: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ scale: 0.97, y: -6, transition: { duration: 0.5, ease: 'easeIn' } }}
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
