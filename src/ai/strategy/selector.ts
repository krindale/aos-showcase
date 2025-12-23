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
  isRouteComplete,
} from './analyzer';
import { hexDistance } from '@/utils/hexGrid';
import { getCurrentRoute, setCurrentRoute, clearCurrentRoutes } from './state';
import { debugLog } from '@/utils/debugConfig';

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
  const allOpportunities = analyzeDeliveryOpportunities(state);

  // 1.1 이미 완벽히 연결된 경로는 제외 (본인의 선로로 완성된 경우만 제외하도록 하여 미완성 경로 재건축 유도)
  const opportunities = allOpportunities.filter(opp => {
    const route: DeliveryRoute = { from: opp.sourceCityId, to: opp.targetCityId, priority: 1 };
    return !isRouteComplete(state, route, playerId);
  });

  if (opportunities.length === 0) {
    if (allOpportunities.length > 0) {
      debugLog.trackBuilding(`[AI 경로] ${player.name}: 모든 배달 기회가 이미 연결되어 있음`);
    } else {
      debugLog.trackBuilding(`[AI 경로] ${player.name}: 배달 가능한 화물 없음`);
    }
    return findNetworkExpansionTarget(state, playerId);
  }

  // 2. 연결된 도시 확인
  const connectedCities = getConnectedCities(state, playerId);
  const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);

  // 3. 가치 기반 정렬 (수입 vs 거리 vs 연결성)
  opportunities.sort((a, b) => {
    // 3.1 수입 잠재력
    // [링크 길이 가중치] 현재 엔진 레벨을 넘어서는 경로도 미래 가치로 인정하여 가산점 부여
    const aIncome = Math.min(a.distance, player.engineLevel) * 50;
    const bIncome = Math.min(b.distance, player.engineLevel) * 50;

    // [핵심 요청] 엔진 레벨 혹은 엔진 레벨+1의 루트가 최우선 순위
    const aEngineMatchingBonus = (a.distance === player.engineLevel || a.distance === player.engineLevel + 1) ? 500 : 0;
    const bEngineMatchingBonus = (b.distance === player.engineLevel || b.distance === player.engineLevel + 1) ? 500 : 0;

    // 엔진 레벨을 초과하는 '미래 수입'에 대한 보너스 (엔진 업그레이드 유도)
    const aFutureIncome = a.distance > player.engineLevel ? (a.distance - player.engineLevel) * 20 : 0;
    const bFutureIncome = b.distance > player.engineLevel ? (b.distance - player.engineLevel) * 20 : 0;

    // 3.2 연결성 보너스 (네트워크 확장 및 연속성)
    const aConnectedBonus = connectedCities.includes(a.sourceCityId) ? 150 : 0;
    const bConnectedBonus = connectedCities.includes(b.sourceCityId) ? 150 : 0;

    // 3.3 거리 페널티
    const aDistPenalty = a.distance * 5;
    const bDistPenalty = b.distance * 5;

    // 3.4 완공 여부 페널티 (중복 건설 배제)
    // 타인이 이미 연결했거나, 이미 망이 존재하는 경우 강력한 페널티
    const isAAlreadyLinked = isRouteComplete(state, { from: a.sourceCityId, to: a.targetCityId, priority: 1 });
    const isBAlreadyLinked = isRouteComplete(state, { from: b.sourceCityId, to: b.targetCityId, priority: 1 });

    const aDuplicationPenalty = isAAlreadyLinked ? -1000 : 0;
    const bDuplicationPenalty = isBAlreadyLinked ? -1000 : 0;

    // 타인 완공 페널티 (독자 노선 확보 유도)
    const aCompetitorPenalty = (isAAlreadyLinked && !connectedCities.includes(a.sourceCityId)) ? -2000 : 0; // 강화됨
    const bCompetitorPenalty = (isBAlreadyLinked && !connectedCities.includes(b.sourceCityId)) ? -2000 : 0;

    // [New] 경쟁자 진행도 체크 (이미 누군가 짓고 있는 경로는 피함)
    let aOpponentMaxProgress = 0;
    let bOpponentMaxProgress = 0;
    const opponents = state.activePlayers.filter(id => id !== playerId);

    for (const oppId of opponents) {
      const progA = getRouteProgress(state, oppId, { from: a.sourceCityId, to: a.targetCityId, priority: 1 });
      if (progA > aOpponentMaxProgress) aOpponentMaxProgress = progA;

      const progB = getRouteProgress(state, oppId, { from: b.sourceCityId, to: b.targetCityId, priority: 1 });
      if (progB > bOpponentMaxProgress) bOpponentMaxProgress = progB;
    }

    // 경쟁자가 30% 이상 진행했으면 페널티, 70% 이상이면 강력 페널티
    const aProgressPenalty = aOpponentMaxProgress > 0.7 ? -1500 : (aOpponentMaxProgress > 0.3 ? -500 : 0);
    const bProgressPenalty = bOpponentMaxProgress > 0.7 ? -1500 : (bOpponentMaxProgress > 0.3 ? -500 : 0);

    const aScore = aIncome + aEngineMatchingBonus + aFutureIncome + aConnectedBonus - aDistPenalty + aDuplicationPenalty + aCompetitorPenalty + aProgressPenalty;
    const bScore = bIncome + bEngineMatchingBonus + bFutureIncome + bConnectedBonus - bDistPenalty + bDuplicationPenalty + bCompetitorPenalty + bProgressPenalty;

    return bScore - aScore;
  });

  // 4. 엔진 레벨 + 3턴 내 도달 가능한 경로 필터 (기존 +2 -> +3으로 확장)
  const reachableOpportunities = opportunities.filter(opp => {
    // 현재 엔진 레벨로 배달 가능하거나, 3턴 안에 가능한 경로
    // (엔진 업그레이드 및 장거리 선점 고려)
    return opp.distance <= player.engineLevel + 3;
  });

  if (reachableOpportunities.length === 0) {
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 엔진 레벨(${player.engineLevel}) 내 도달 가능 경로 없음`);
    // 가장 가까운 기회 선택 (엔진 업그레이드 필요)
    const best = opportunities[0];
    const route: DeliveryRoute = {
      from: best.sourceCityId,
      to: best.targetCityId,
      priority: 1,
    };
    debugLog.trackBuilding(`[AI 경로] ${player.name}: ${best.sourceCityId}→${best.targetCityId} (${best.cubeColor} 화물, 거리 ${best.distance}, 엔진 업그레이드 필요)`);
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
            debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${opp.cubeColor} 화물, 세그먼트)`);
            setCurrentRoute(playerId, segment);
            return segment;
          }
        }
      }

      debugLog.trackBuilding(`[AI 경로] ${player.name}: ${opp.sourceCityId}→${opp.targetCityId} (${opp.cubeColor} 화물, 거리 ${opp.distance})`);
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
      debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segments[0].from}→${segments[0].to} (${best.cubeColor} 화물, 첫 세그먼트)`);
      setCurrentRoute(playerId, segments[0]);
      return segments[0];
    }

    // 미완성 세그먼트 중 첫 번째
    for (const segment of segments) {
      const segmentProgress = getRouteProgress(state, playerId, segment);
      if (segmentProgress < 1.0) {
        debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${best.cubeColor} 화물, 미완성 세그먼트)`);
        setCurrentRoute(playerId, segment);
        return segment;
      }
    }
  }

  debugLog.trackBuilding(`[AI 경로] ${player.name}: ${best.sourceCityId}→${best.targetCityId} (${best.cubeColor} 화물, 거리 ${best.distance})`);
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
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 모든 도시 연결됨, 네트워크 확장 불필요`);
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
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 네트워크 확장 ${route.from}→${route.to}`);
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
  const nearestConnected = board.cities.find(c => connectedCities.includes(c.id));
  if (nearestConnected) {
    const route: DeliveryRoute = {
      from: nearestConnected.id,
      to: nearestCity.id,
      priority: 2,
    };
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 네트워크 확장 ${route.from}→${route.to}`);
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
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to} 완성됨, 새 경로 탐색`);
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로에 화물이 없어졌으면 새 경로 탐색
  const opportunities = analyzeDeliveryOpportunities(state);
  const hasMatchingCargo = opportunities.some(
    opp => opp.sourceCityId === currentRoute.from && opp.targetCityId === currentRoute.to
  );

  if (!hasMatchingCargo) {
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to}에 화물 없음, 새 경로 탐색`);
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로 유지
  debugLog.trackBuilding(`[AI 경로] ${player.name}: 현재 경로 ${currentRoute.from}→${currentRoute.to} 유지 (진행도: ${(progress * 100).toFixed(0)}%)`);
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
  void _state; void _playerId; void _strategy;
}

/**
 * 전략 상태 초기화
 */
export function resetStrategyState(): void {
  clearCurrentRoutes();
}
