/**
 * AI 전략 상태 관리 (단순화 버전)
 *
 * 정적 시나리오 대신 현재 목표 경로만 저장
 */

import { PlayerId } from '@/types/game';
import { DeliveryRoute } from './types';

/**
 * 경로 상태 (투자 이력 포함)
 */
export interface RouteState {
  route: DeliveryRoute;
  investedTrackCount: number;  // 이 경로 방향으로 투자한 트랙 수
}

/**
 * 플레이어별 현재 목표 경로 저장소
 */
const currentTargetRoutes: Map<PlayerId, RouteState> = new Map();

/**
 * 현재 목표 경로 가져오기 (하위 호환)
 */
export function getCurrentRoute(playerId: PlayerId): DeliveryRoute | null {
  const state = currentTargetRoutes.get(playerId);
  return state?.route || null;
}

/**
 * 현재 목표 경로 상태 전체 가져오기 (투자 이력 포함)
 */
export function getCurrentRouteState(playerId: PlayerId): RouteState | null {
  return currentTargetRoutes.get(playerId) || null;
}

/**
 * 현재 목표 경로 설정
 * 동일 from/to면 investedTrackCount 보존, 다른 경로면 0으로 리셋
 */
export function setCurrentRoute(playerId: PlayerId, route: DeliveryRoute): void {
  const existing = currentTargetRoutes.get(playerId);
  const isSameRoute = existing &&
    existing.route.from === route.from &&
    existing.route.to === route.to;

  currentTargetRoutes.set(playerId, {
    route,
    investedTrackCount: isSameRoute ? existing.investedTrackCount : 0,
  });
}

/**
 * 건설 성공 시 투자 이력 증가
 */
export function incrementInvestedTracks(playerId: PlayerId): void {
  const state = currentTargetRoutes.get(playerId);
  if (state) {
    state.investedTrackCount += 1;
  }
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
  const state = currentTargetRoutes.get(playerId);
  if (!state) return null;

  return {
    name: 'dynamic_cargo_based',
    nameKo: '화물 기반 동적 전략',
    targetRoutes: [state.route],
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
    setCurrentRoute(playerId, strategy.targetRoutes[0]);
  }
}

/**
 * 전략이 선택되어 있는지 확인 - 호환성 유지용
 */
export function hasSelectedStrategy(playerId: PlayerId): boolean {
  return currentTargetRoutes.has(playerId) && currentTargetRoutes.get(playerId)!.route !== null;
}

/**
 * 디버깅용: 현재 전략 상태 로그
 */
export function logStrategyState(playerId: PlayerId): void {
  const state = currentTargetRoutes.get(playerId);
  if (!state) {
    console.log(`[AI 전략] ${playerId}: 경로 없음`);
    return;
  }

  const { route, investedTrackCount } = state;
  console.log(`[AI 전략] ${playerId}:`);
  console.log(`  - 현재 경로: ${route.from} → ${route.to} (우선순위: ${route.priority}, 투자 트랙: ${investedTrackCount})`);
}
