// 게임 UI 이펙트 공용 유틸 — 팝 스프링/색 상수/취소 감지/첫 렌더 가드.
// 이펙트는 전부 표시 전용이며 게임 로직(store)을 변경하지 않는다.

import { useEffect, useRef } from 'react';
import type { Transition } from 'framer-motion';
import type { GameLog } from '@/types/game';

/** 모든 "팝" 등장 애니메이션의 공용 스프링 — 표면마다 튜닝이 갈리지 않게 단일 상수 */
export const POP_SPRING: Transition = { type: 'spring', stiffness: 480, damping: 16 };

/** 게임 이펙트 색 상수 (SVG attr 등 리터럴이 필요한 곳 공용 — tailwind 토큰과 값 동기 유지) */
export const GAME_ACCENT = '#c04a2b'; // = tailwind accent.DEFAULT
export const GAME_PAPER = '#fffdf8'; // 카드/배지 위 밝은 전경
export const CROWN_GOLD = '#f0c040'; // 경매 왕관 채움
export const CROWN_INK = '#7a5200'; // 경매 왕관 외곽선

/**
 * 직전 상태 변경이 실행 취소(undoLastAction)였는지 — 취소는 스냅샷 복원이라
 * 상태 diff 기반 이펙트(증감 배지/보드 펄스)가 가짜 이벤트로 오인하므로 억제한다.
 * undoLastAction은 항상 `↩ 취소: ...` 로그를 같은 커밋에 남긴다 (gameStore).
 */
export function isRecentUndoLog(logs: GameLog[], windowMs = 600): boolean {
  const last = logs[logs.length - 1];
  return !!last && last.action.startsWith('↩') && Date.now() - last.timestamp < windowMs;
}

/**
 * 첫 렌더(마운트 시점에 이미 존재하던 상태)에서는 등장 애니메이션을 건너뛰기 위한 가드.
 * BottomSheet 여닫기/화면 회전으로 패널이 리마운트될 때 지난 이벤트(포기 도장,
 * 입찰 팝 등)가 일제히 재생되는 것을 막는다. 사용: initial={first.current ? false : {...}}
 */
export function useIsFirstRender() {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return first;
}
