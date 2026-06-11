/**
 * AI 동적 경로 선택 로직
 *
 * 정적 시나리오 대신 실제 화물 배치를 기반으로 최적 배달 경로를 동적으로 선택
 */

import { GameState, PlayerId } from '@/types/game';
import { DeliveryRoute, DeliveryOpportunity } from './types';
import {
  analyzeDeliveryOpportunities,
  getConnectedCities,
  breakRouteIntoSegments,
  getRouteProgress,
  isRouteComplete,
} from './analyzer';
import { hexDistance } from '@/utils/hexGrid';
import { getCurrentRoute, getCurrentRouteState, setCurrentRoute, clearCurrentRoutes } from './state';
import { estimateRouteVP } from './vp';
import { getMapAIConfig } from './mapConfig';
import { debugLog } from '@/utils/debugConfig';

/**
 * 정밀 평가(A* 포함) 대상 후보 수 상한
 * 큰 맵에서 기회 조합이 폭발해도 결정당 A* 호출이 O(K)로 유지되도록 가지치기
 */
const PRECISE_EVAL_TOP_K = 8;

/**
 * 사전 점수 (싼 휴리스틱) — 정밀 평가 대상을 추리는 용도
 * 가까울수록, 연결된 도시에서 시작할수록, 엔진 내 거리일수록 우선
 */
function preliminaryScore(
  opp: DeliveryOpportunity,
  engineLevel: number,
  connectedCities: string[],
): number {
  let score = -hexDistance(opp.sourceCoord, opp.targetCoord);
  if (connectedCities.includes(opp.sourceCityId)) score += 10;
  if (opp.distance <= engineLevel) score += 5;
  return score;
}

/**
 * VP 최적 경로 점수 — estimateRouteVP(기대 ΔVP)를 그대로 사용
 * 완성 불가능한 경로는 -Infinity로 원천 배제 (산발 건설 차단)
 */
function scoreOpportunity(
  opp: DeliveryOpportunity,
  state: GameState,
  playerId: PlayerId,
): number {
  const estimate = estimateRouteVP(state, playerId, opp);
  return estimate.deltaVP;
}

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

  // 3. 가치 기반 정렬 — 사전 점수로 상위 K개만 정밀 평가(A* 포함), ΔVP로 최종 정렬
  const isFirstTurn = state.currentTurn === 1;
  const config = getMapAIConfig(state);

  const preciseTargets = [...opportunities]
    .sort((a, b) =>
      preliminaryScore(b, player.engineLevel, connectedCities) -
      preliminaryScore(a, player.engineLevel, connectedCities)
    )
    .slice(0, PRECISE_EVAL_TOP_K);

  const allScoredOpps = preciseTargets.map(opp => ({
    opp,
    score: scoreOpportunity(opp, state, playerId),
  }));
  // -Infinity(완성 불가능)를 정렬 전에 제거 — (-Inf) - (-Inf) = NaN 비교로 정렬이 깨지는 것 방지
  const scoredOpps = allScoredOpps.filter(s => s.score > -Infinity);
  scoredOpps.sort((a, b) => b.score - a.score);

  // 상위 5개 후보 로그
  const opponents = state.activePlayers.filter(id => id !== playerId);
  const oppRoutes = opponents.map(id => ({ id, route: getCurrentRoute(id) }));
  debugLog.trackBuilding(`[AI 경로선택] ${player.name} Turn ${state.currentTurn}: 상대 경로=${oppRoutes.map(r => r.route ? `${r.id}:${r.route.from}→${r.route.to}` : `${r.id}:없음`).join(', ')} (완성 불가 제외 ${allScoredOpps.length - scoredOpps.length}건)`);
  for (const { opp, score } of scoredOpps.slice(0, 5)) {
    debugLog.trackBuilding(`  ${opp.sourceCityId}→${opp.targetCityId} (${opp.cubeColor}, 거리${opp.distance}) ΔVP=${score.toFixed(1)}`);
  }

  const viableOpps = scoredOpps.map(s => s.opp);

  // 4. 도달 가능 경로 필터
  // 첫 턴: 엔진 레벨까지만 허용 (이번 턴 즉시 배달 가능한 경로만)
  // 이후: 엔진 상한까지 (estimateRouteVP가 엔진 상한 초과 경로를 이미 배제)
  const maxDistance = isFirstTurn
    ? player.engineLevel
    : config.engineMax;

  const reachableOpportunities = viableOpps.filter(opp => {
    return opp.distance <= maxDistance;
  });

  if (reachableOpportunities.length === 0) {
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 엔진 레벨(${player.engineLevel}) 내 도달 가능 경로 없음`);
    // 가장 가치 높은 기회 선택 (엔진 업그레이드 필요)
    const best = viableOpps[0] ?? opportunities[0];
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
            segment.overallTo = route.to; // 전체 경로의 최종 목적지 보존
            debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${opp.cubeColor} 화물, 세그먼트, 최종→${route.to})`);
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
      segments[0].overallTo = route.to; // 전체 경로의 최종 목적지 보존
      debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segments[0].from}→${segments[0].to} (${best.cubeColor} 화물, 첫 세그먼트, 최종→${route.to})`);
      setCurrentRoute(playerId, segments[0]);
      return segments[0];
    }

    // 미완성 세그먼트 중 첫 번째
    for (const segment of segments) {
      const segmentProgress = getRouteProgress(state, playerId, segment);
      if (segmentProgress < 1.0) {
        segment.overallTo = route.to; // 전체 경로의 최종 목적지 보존
        debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${best.cubeColor} 화물, 미완성 세그먼트, 최종→${route.to})`);
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
  // 세그먼트인 경우 전체 경로의 최종 목적지도 확인
  const opportunities = analyzeDeliveryOpportunities(state);
  const finalTo = currentRoute.overallTo || currentRoute.to;
  const hasMatchingCargo = opportunities.some(
    opp => opp.sourceCityId === currentRoute.from &&
      (opp.targetCityId === currentRoute.to || opp.targetCityId === finalTo)
  );

  if (!hasMatchingCargo) {
    // 투자 이력이 2개 이상이면 경로 유지 (물품 성장 대기)
    const routeState = getCurrentRouteState(playerId);
    const investedCount = routeState?.investedTrackCount ?? 0;

    if (investedCount >= 2) {
      debugLog.trackBuilding(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to} (최종→${finalTo})에 화물 없지만 투자 이력(${investedCount})으로 유지`);
      return; // 경로 유지
    }

    debugLog.trackBuilding(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to} (최종→${finalTo})에 화물 없음, 새 경로 탐색`);
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

/**
 * 상위 N개 우선순위 경로 반환
 *
 * 경로 실패 시 대체 경로 탐색에 사용
 */
export function getTopPriorityRoutes(
  state: GameState,
  playerId: PlayerId,
  count: number = 5
): DeliveryRoute[] {
  const player = state.players[playerId];
  if (!player) return [];

  const allOpportunities = analyzeDeliveryOpportunities(state);
  const connectedCities = getConnectedCities(state, playerId);

  // 사전 점수 상위 K개만 정밀 평가 (큰 맵 가지치기)
  const preciseTargets = [...allOpportunities]
    .sort((a, b) =>
      preliminaryScore(b, player.engineLevel, connectedCities) -
      preliminaryScore(a, player.engineLevel, connectedCities)
    )
    .slice(0, PRECISE_EVAL_TOP_K);

  const scored = preciseTargets.map(opp => {
    const route: DeliveryRoute = { from: opp.sourceCityId, to: opp.targetCityId, priority: 1 };

    if (isRouteComplete(state, route, playerId)) {
      return { route, score: -Infinity };
    }

    const score = scoreOpportunity(opp, state, playerId);
    return { route, score };
  });

  return scored
    .filter(s => s.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(s => s.route);
}
