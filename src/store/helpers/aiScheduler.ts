// AI 동기화 헬퍼 — 실행 락·컨텍스트 검증·중앙 스케줄러 (gameStore 스텝 3a 분리)
// GameStore 타입은 순환을 피하기 위해 type-only import (런타임 의존 없음).

import { GamePhase, CapturedAIContext } from '@/types/game';
import { isCurrentPlayerAI } from '@/ai';
import { safeTimeout } from '@/utils/safeTimers';
import type { GameStore } from '../gameStore';

// ============================================================
// AI 동기화 헬퍼 (레이스 컨디션 방지)
// ============================================================

/** AI 체크 debounce 취소 함수 (safeTimeout — 백그라운드 탭 스로틀 회피) */
let cancelAICheck: (() => void) | null = null;

/** AI 체크 debounce 딜레이 (ms) */
const AI_CHECK_DEBOUNCE = 150;

/**
 * AI 실행 락 획득 시도
 * @returns executionId if acquired, null if already locked
 */
export const tryAcquireAILock = (get: () => GameStore, set: (partial: Partial<GameStore>) => void): number | null => {
  const state = get();
  if (state.aiExecution.pending) {
    console.log('[AI Lock] 이미 실행 중 - 락 획득 실패');
    return null;
  }
  const executionId = Date.now();
  set({ aiExecution: { pending: true, executionId } });
  console.log(`[AI Lock] 락 획득 성공 - executionId: ${executionId}`);
  return executionId;
};

/**
 * AI 실행 락 해제
 * @param executionId 획득한 executionId
 */
export const releaseAILock = (
  executionId: number,
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void
): void => {
  const state = get();
  if (state.aiExecution.executionId === executionId) {
    set({ aiExecution: { pending: false, executionId: 0 } });
    console.log(`[AI Lock] 락 해제 - executionId: ${executionId}`);
  } else {
    console.warn(`[AI Lock] 락 해제 실패 - executionId 불일치: ${executionId} vs ${state.aiExecution.executionId}`);
  }
};

/**
 * 실행 컨텍스트 유효성 검증
 * @returns true if context is still valid
 */
export const validateExecutionContext = (
  context: CapturedAIContext,
  get: () => GameStore
): boolean => {
  const currentState = get();
  const isValid = (
    currentState.currentPlayer === context.currentPlayer &&
    currentState.currentPhase === context.currentPhase &&
    currentState.aiExecution.executionId === context.executionId
  );
  if (!isValid) {
    console.warn('[AI Context] 컨텍스트 유효성 검증 실패:', {
      expected: { player: context.currentPlayer, phase: context.currentPhase, execId: context.executionId },
      actual: { player: currentState.currentPlayer, phase: currentState.currentPhase, execId: currentState.aiExecution.executionId },
    });
  }
  return isValid;
};

/** 플레이어 행동이 필요한 단계들 */
export const PLAYER_ACTION_PHASES: GamePhase[] = [
  'issueShares',
  'determinePlayerOrder',
  'selectActions',
  'buildTrack',
  'moveGoods',
];

/**
 * 중앙 집중식 AI 스케줄러 (debounce 적용)
 * 모든 AI 트리거 포인트에서 이 함수를 호출하여 중복 실행 방지
 */
export const scheduleAICheck = (get: () => GameStore): void => {
  // 기존 타임아웃 취소 (debounce)
  cancelAICheck?.();

  cancelAICheck = safeTimeout(() => {
    cancelAICheck = null;

    const state = get();

    // 조건 체크
    const isPhaseMatch = PLAYER_ACTION_PHASES.includes(state.currentPhase);
    const isAI = isCurrentPlayerAI(state);
    const notPending = !state.aiExecution.pending;

    console.log(`[AI 스케줄러] phase=${state.currentPhase}, player=${state.currentPlayer}, isAI=${isAI}, pending=${state.aiExecution.pending}`);

    if (isPhaseMatch && isAI && notPending) {
      console.log('[AI 스케줄러] 조건 충족 - AI 턴 실행');
      state.executeAITurn();
    }
  }, AI_CHECK_DEBOUNCE);
};
