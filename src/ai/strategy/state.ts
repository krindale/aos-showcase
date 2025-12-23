/**
 * AI 전략 상태 관리 (단순화 버전)
 *
 * 정적 시나리오 대신 현재 목표 경로만 저장
 */

import { PlayerId } from '@/types/game';
import { DeliveryRoute } from './types';

/**
 * 플레이어별 현재 목표 경로 저장소
 */
const currentTargetRoutes: Map<PlayerId, DeliveryRoute> = new Map();

/**
 * 현재 목표 경로 가져오기
 */
export function getCurrentRoute(playerId: PlayerId): DeliveryRoute | null {
  return currentTargetRoutes.get(playerId) || null;
}

/**
 * 현재 목표 경로 설정
 */
export function setCurrentRoute(playerId: PlayerId, route: DeliveryRoute): void {
  currentTargetRoutes.set(playerId, route);
}

/**
 * 모든 경로 초기화 (게임 리셋 시)
 */
export function clearCurrentRoutes(): void {
  currentTargetRoutes.clear();
  console.log('[AI 전략] 경로 상태 초기화');
}

/**
 * 전략 상태 초기화 (게임 리셋 시) - 호환성 유지용 alias
 */
export function resetStrategyStates(): void {
  clearCurrentRoutes();
}

/**
 * 플레이어의 선택된 전략 가져오기 - 호환성 유지용
 *
 * @deprecated getCurrentRoute 사용 권장
 */
export function getSelectedStrategy(playerId: PlayerId): {
  name: string;
  nameKo: string;
  targetRoutes: DeliveryRoute[];
} | null {
  const route = currentTargetRoutes.get(playerId);
  if (!route) return null;

  return {
    name: 'dynamic_cargo_based',
    nameKo: '화물 기반 동적 전략',
    targetRoutes: [route],
  };
}

/**
 * 플레이어의 전략 설정 - 호환성 유지용
 *
 * @deprecated setCurrentRoute 사용 권장
 */
export function setSelectedStrategy(
  playerId: PlayerId,
  strategy: { targetRoutes: DeliveryRoute[] },
  _turn: number
): void {
  void _turn; // 호환성 유지용
  if (strategy.targetRoutes.length > 0) {
    currentTargetRoutes.set(playerId, strategy.targetRoutes[0]);
  }
}

/**
 * 전략이 선택되어 있는지 확인 - 호환성 유지용
 */
export function hasSelectedStrategy(playerId: PlayerId): boolean {
  return currentTargetRoutes.has(playerId);
}

/**
 * 디버깅용: 현재 전략 상태 로그
 */
export function logStrategyState(playerId: PlayerId): void {
  const route = currentTargetRoutes.get(playerId);
  if (!route) {
    console.log(`[AI 전략] ${playerId}: 경로 없음`);
    return;
  }

  console.log(`[AI 전략] ${playerId}:`);
  console.log(`  - 현재 경로: ${route.from} → ${route.to} (우선순위: ${route.priority})`);
}
