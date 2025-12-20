/**
 * AI 동적 경로 선택 로직
 *
 * 정적 시나리오 대신 실제 화물 배치를 기반으로 최적 배달 경로를 동적으로 선택
 */

import { GameState, PlayerId } from '@/types/game';
import { DeliveryRoute } from './types';
import {
  analyzeDeliveryOpportunities,
  getConnectedCities,
  breakRouteIntoSegments,
  getRouteProgress,
  hexDistance,
} from './analyzer';
import { getCurrentRoute, setCurrentRoute, clearCurrentRoutes } from './state';

/**
 * 게임 시작 시 또는 턴 시작 시 최적 경로 탐색
 *
 * 정적 시나리오 대신 현재 화물 배치를 분석하여 최적 배달 경로 반환
 */
export function getNextTargetRoute(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const player = state.players[playerId];
  if (!player) return null;

  // 1. 현재 물품 배치 기반 모든 배달 기회 분석
  const opportunities = analyzeDeliveryOpportunities(state);

  if (opportunities.length === 0) {
    console.log(`[AI 경로] ${player.name}: 배달 가능한 화물 없음`);
    return findNetworkExpansionTarget(state, playerId);
  }

  // 2. 거리순 정렬 (가까운 것 우선)
  opportunities.sort((a, b) => a.distance - b.distance);

  // 3. 연결된 도시 확인
  const connectedCities = getConnectedCities(state, playerId);
  const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);

  // 4. 엔진 레벨 + 2턴 내 도달 가능한 경로 필터
  const reachableOpportunities = opportunities.filter(opp => {
    // 현재 엔진 레벨로 배달 가능하거나, 2턴 안에 가능한 경로
    // (엔진 업그레이드 가능성 고려)
    return opp.distance <= player.engineLevel + 2;
  });

  if (reachableOpportunities.length === 0) {
    console.log(`[AI 경로] ${player.name}: 엔진 레벨(${player.engineLevel}) 내 도달 가능 경로 없음`);
    // 가장 가까운 기회 선택 (엔진 업그레이드 필요)
    const best = opportunities[0];
    const route: DeliveryRoute = {
      from: best.sourceCityId,
      to: best.targetCityId,
      priority: 1,
    };
    console.log(`[AI 경로] ${player.name}: ${best.sourceCityId}→${best.targetCityId} (${best.cubeColor} 화물, 거리 ${best.distance}, 엔진 업그레이드 필요)`);
    setCurrentRoute(playerId, route);
    return route;
  }

  // 5. 연결된 도시에서 시작하는 경로 우선
  for (const opp of reachableOpportunities) {
    if (connectedCities.includes(opp.sourceCityId)) {
      const route: DeliveryRoute = {
        from: opp.sourceCityId,
        to: opp.targetCityId,
        priority: 1,
      };

      // 다중 링크 경로인 경우 세그먼트로 분해
      const segments = breakRouteIntoSegments(route, state.board);
      if (segments.length > 1) {
        // 정방향: 연결된 도시에서 시작하는 미완성 세그먼트
        for (const segment of segments) {
          const segmentProgress = getRouteProgress(state, playerId, segment);
          if (segmentProgress < 1.0 && connectedCities.includes(segment.from)) {
            console.log(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${opp.cubeColor} 화물, 세그먼트)`);
            setCurrentRoute(playerId, segment);
            return segment;
          }
        }
      }

      console.log(`[AI 경로] ${player.name}: ${opp.sourceCityId}→${opp.targetCityId} (${opp.cubeColor} 화물, 거리 ${opp.distance})`);
      setCurrentRoute(playerId, route);
      return route;
    }
  }

  // 6. 연결된 도시가 없는 경우 (첫 트랙 건설 또는 새 경로)
  // 가장 가까운 경로 선택
  const best = reachableOpportunities[0];
  const route: DeliveryRoute = {
    from: best.sourceCityId,
    to: best.targetCityId,
    priority: 1,
  };

  // 다중 링크 경로 분해
  const segments = breakRouteIntoSegments(route, state.board);
  if (segments.length > 1) {
    // 첫 트랙이면 첫 번째 세그먼트 반환
    if (playerTracks.length === 0) {
      console.log(`[AI 경로] ${player.name}: ${segments[0].from}→${segments[0].to} (${best.cubeColor} 화물, 첫 세그먼트)`);
      setCurrentRoute(playerId, segments[0]);
      return segments[0];
    }

    // 미완성 세그먼트 중 첫 번째
    for (const segment of segments) {
      const segmentProgress = getRouteProgress(state, playerId, segment);
      if (segmentProgress < 1.0) {
        console.log(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${best.cubeColor} 화물, 미완성 세그먼트)`);
        setCurrentRoute(playerId, segment);
        return segment;
      }
    }
  }

  console.log(`[AI 경로] ${player.name}: ${best.sourceCityId}→${best.targetCityId} (${best.cubeColor} 화물, 거리 ${best.distance})`);
  setCurrentRoute(playerId, route);
  return route;
}

/**
 * 배달 기회가 없을 때 네트워크 확장 타겟 찾기
 *
 * 가장 가까운 도시를 향해 트랙 확장
 */
function findNetworkExpansionTarget(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const { board } = state;
  const player = state.players[playerId];
  if (!player) return null;

  const connectedCities = getConnectedCities(state, playerId);

  // 연결되지 않은 도시 중 가장 가까운 것 선택
  const unconnectedCities = board.cities.filter(
    city => !connectedCities.includes(city.id)
  );

  if (unconnectedCities.length === 0) {
    console.log(`[AI 경로] ${player.name}: 모든 도시 연결됨, 네트워크 확장 불필요`);
    return null;
  }

  // 플레이어 트랙과 가장 가까운 미연결 도시 찾기
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);

  if (playerTracks.length === 0) {
    // 첫 트랙: 아무 도시에서 시작
    const firstCity = board.cities[0];
    const nearestCity = unconnectedCities.reduce((nearest, city) => {
      const dist = hexDistance(firstCity.coord, city.coord);
      const nearestDist = hexDistance(firstCity.coord, nearest.coord);
      return dist < nearestDist ? city : nearest;
    }, unconnectedCities[0]);

    const route: DeliveryRoute = {
      from: firstCity.id,
      to: nearestCity.id,
      priority: 2,
    };
    console.log(`[AI 경로] ${player.name}: 네트워크 확장 ${route.from}→${route.to}`);
    setCurrentRoute(playerId, route);
    return route;
  }

  // 현재 트랙에서 가장 가까운 미연결 도시 찾기
  let nearestCity = unconnectedCities[0];
  let minDistance = Infinity;

  for (const city of unconnectedCities) {
    for (const track of playerTracks) {
      const dist = hexDistance(track.coord, city.coord);
      if (dist < minDistance) {
        minDistance = dist;
        nearestCity = city;
      }
    }
  }

  // 가장 가까운 연결된 도시 찾기
  let nearestConnected = board.cities.find(c => connectedCities.includes(c.id));
  if (nearestConnected) {
    const route: DeliveryRoute = {
      from: nearestConnected.id,
      to: nearestCity.id,
      priority: 2,
    };
    console.log(`[AI 경로] ${player.name}: 네트워크 확장 ${route.from}→${route.to}`);
    setCurrentRoute(playerId, route);
    return route;
  }

  return null;
}

/**
 * 전략 재평가 (매 턴 호출)
 *
 * 단순화: 현재 경로가 아직 유효한지만 확인하고, 필요시 새 경로 탐색
 */
export function reevaluateStrategy(
  state: GameState,
  playerId: PlayerId
): void {
  const currentRoute = getCurrentRoute(playerId);
  const player = state.players[playerId];
  if (!player) return;

  // 현재 경로가 없으면 새 경로 탐색
  if (!currentRoute) {
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로가 완성되었으면 새 경로 탐색
  const progress = getRouteProgress(state, playerId, currentRoute);
  if (progress >= 1.0) {
    console.log(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to} 완성됨, 새 경로 탐색`);
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로에 화물이 없어졌으면 새 경로 탐색
  const opportunities = analyzeDeliveryOpportunities(state);
  const hasMatchingCargo = opportunities.some(
    opp => opp.sourceCityId === currentRoute.from && opp.targetCityId === currentRoute.to
  );

  if (!hasMatchingCargo) {
    console.log(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to}에 화물 없음, 새 경로 탐색`);
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로 유지
  console.log(`[AI 경로] ${player.name}: 현재 경로 ${currentRoute.from}→${currentRoute.to} 유지 (진행도: ${(progress * 100).toFixed(0)}%)`);
}

/**
 * 초기 전략 선택 (게임 시작 시) - 호환성 유지용
 *
 * @deprecated getNextTargetRoute 사용 권장
 */
export function selectInitialStrategy(
  state: GameState,
  playerId: PlayerId
): { name: string; nameKo: string; targetRoutes: DeliveryRoute[] } {
  const route = getNextTargetRoute(state, playerId);

  return {
    name: 'dynamic_cargo_based',
    nameKo: '화물 기반 동적 전략',
    targetRoutes: route ? [route] : [],
  };
}

/**
 * 순수 함수: 다음 목표 경로 탐색 (전략 변경 없음) - 호환성 유지용
 */
export function findNextTargetRoute(
  state: GameState,
  playerId: PlayerId
): { route: DeliveryRoute | null; needsStrategyReeval: boolean; reason?: string } {
  const route = getNextTargetRoute(state, playerId);

  if (route) {
    return { route, needsStrategyReeval: false };
  }

  return { route: null, needsStrategyReeval: true, reason: 'no_cargo_opportunities' };
}

/**
 * 경로 우선순위 조정 - 호환성 유지용 (no-op)
 */
export function adjustRoutePriorities(
  _state: GameState,
  _playerId: PlayerId,
  _strategy: { targetRoutes: DeliveryRoute[] }
): void {
  // 동적 전략에서는 매번 새로 계산하므로 조정 불필요
}

/**
 * 전략 상태 초기화
 */
export function resetStrategyState(): void {
  clearCurrentRoutes();
}
