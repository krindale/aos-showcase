/**
 * AI 전략 상태 관리
 *
 * 플레이어별 선택된 전략을 저장하고 관리
 */

import { PlayerId } from '@/types/game';
import { AIStrategy, AIStrategyState } from './types';

/**
 * 플레이어별 전략 상태 저장소
 */
const strategyStates: Map<PlayerId, AIStrategyState> = new Map();

/**
 * 전략 상태 초기화 (게임 리셋 시)
 */
export function resetStrategyStates(): void {
  strategyStates.clear();
  console.log('[AI 전략] 상태 초기화');
}

/**
 * 플레이어의 선택된 전략 가져오기
 */
export function getSelectedStrategy(playerId: PlayerId): AIStrategy | null {
  const state = strategyStates.get(playerId);
  return state?.strategy || null;
}

/**
 * 플레이어의 전략 설정
 */
export function setSelectedStrategy(
  playerId: PlayerId,
  strategy: AIStrategy,
  turn: number
): void {
  strategyStates.set(playerId, {
    playerId,
    strategy,
    selectedTurn: turn,
    routeProgress: new Map(),
  });
}

/**
 * 전략이 선택되어 있는지 확인
 */
export function hasSelectedStrategy(playerId: PlayerId): boolean {
  return strategyStates.has(playerId);
}

/**
 * 플레이어의 전략 상태 전체 가져오기
 */
export function getStrategyState(playerId: PlayerId): AIStrategyState | null {
  return strategyStates.get(playerId) || null;
}

/**
 * 경로 진행도 업데이트
 */
export function updateRouteProgress(
  playerId: PlayerId,
  routeId: string,
  progress: number
): void {
  const state = strategyStates.get(playerId);
  if (state) {
    state.routeProgress.set(routeId, progress);
  }
}

/**
 * 디버깅용: 현재 전략 상태 로그
 */
export function logStrategyState(playerId: PlayerId): void {
  const state = strategyStates.get(playerId);
  if (!state) {
    console.log(`[AI 전략] ${playerId}: 전략 없음`);
    return;
  }

  console.log(`[AI 전략] ${playerId}:`);
  console.log(`  - 시나리오: ${state.strategy.nameKo}`);
  console.log(`  - 선택 턴: ${state.selectedTurn}`);
  console.log(`  - 목표 경로:`);

  for (const route of state.strategy.targetRoutes) {
    const progress = state.routeProgress.get(`${route.from}-${route.to}`) || 0;
    console.log(`    ${route.from} → ${route.to} (우선순위: ${route.priority}, 진행: ${(progress * 100).toFixed(0)}%)`);
  }
}
