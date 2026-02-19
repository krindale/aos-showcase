/**
 * AI 동적 경로 선택 로직
 *
 * 정적 시나리오 대신 실제 화물 배치를 기반으로 최적 배달 경로를 동적으로 선택
 */

import { GameState, PlayerId, PlayerState, HexCoord } from '@/types/game';
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
import { debugLog } from '@/utils/debugConfig';

/**
 * VP 최적 경로 점수 계산
 *
 * VP = income × 3 + completedLinkTracks - shares × 3
 * → 빨리 짓고(buildEfficiency) 빨리 배달(deliveryValue)하는 경로가 최고점
 */
function scoreOpportunity(
  opp: DeliveryOpportunity,
  state: GameState,
  playerId: PlayerId,
  player: PlayerState,
  connectedCities: string[],
  playerTracks: { coord: HexCoord; owner: PlayerId | null }[],
): number {
  // 1. 배달 수입 가치 (엔진 실현 가능성 반영)
  //    즉시 배달 가능 = distance × 300 (income +distance → VP +distance×3)
  //    1턴 업그레이드 후 = distance × 150 (할인)
  //    그 이상 = distance × 50
  let deliveryValue: number;
  if (opp.distance <= player.engineLevel) {
    deliveryValue = opp.distance * 300;
  } else if (opp.distance <= player.engineLevel + 1) {
    deliveryValue = opp.distance * 150;
  } else {
    deliveryValue = opp.distance * 50;
  }

  // 2. 건설 효율성 (빨리 완성 = 빨리 VP 확보)
  //    남은 건설량이 적을수록 높은 점수
  const hDist = hexDistance(opp.sourceCoord, opp.targetCoord);
  const ownTracksNear = playerTracks.filter(t => {
    if (!t.owner || t.owner !== playerId) return false;
    const dSrc = hexDistance(t.coord, opp.sourceCoord);
    const dTgt = hexDistance(t.coord, opp.targetCoord);
    return dSrc + dTgt <= hDist + 1;
  }).length;
  const remainingTracks = Math.max(0, hDist - ownTracksNear);
  // 0 remaining = 600, 1 = 450, 2 = 300, 3 = 150, 4+ = 0
  const buildEfficiency = Math.max(0, 600 - remainingTracks * 150);

  // 3. 네트워크 연결 보너스 (기존 철도에서 확장)
  const connectedBonus = connectedCities.includes(opp.sourceCityId) ? 300 : 0;

  // 4. 경로 진행도 보너스 (투자 보호)
  const route: DeliveryRoute = { from: opp.sourceCityId, to: opp.targetCityId, priority: 1 };
  const progress = getRouteProgress(state, playerId, route);
  const progressBonus = progress * 500;

  // 5. 엔진 실현 가능성 (남은 턴 내 업그레이드 불가 → 페널티)
  const remainingTurns = state.maxTurns - state.currentTurn;
  const engineGap = Math.max(0, opp.distance - player.engineLevel);
  let engineFeasible = engineGap <= remainingTurns ? 0 : -500;
  // 첫 턴: 즉시 배달 불가능한 경로에 강한 페널티 (이번 턴 수입=0 위험)
  if (state.currentTurn === 1 && opp.distance > player.engineLevel) {
    engineFeasible -= 800;
  }

  // 6. 양방향/다중 큐브 배달 보너스: 같은 링크로 2회 배달 가능하면 income ×2
  let multiDeliveryBonus = 0;
  if (opp.distance <= player.engineLevel) {
    const destCity = state.board.cities.find(c => c.id === opp.targetCityId);
    const srcCity = state.board.cities.find(c => c.id === opp.sourceCityId);
    if (destCity && srcCity) {
      // 6a. 역방향 큐브: B→A 배달도 가능 (Move Round 2에서 역배달)
      const hasReverseCube = destCity.cubes.some(cube => cube === srcCity.color);
      if (hasReverseCube) {
        multiDeliveryBonus = 200;
      }
      // 6b. 동방향 다중 큐브: A에서 같은 색 큐브 2개+ → 2회 연속 배달
      const sameDirCubeCount = srcCity.cubes.filter(cube => cube === destCity.color).length;
      if (sameDirCubeCount >= 2 && multiDeliveryBonus === 0) {
        multiDeliveryBonus = 150;
      }
    }
  }

  // === 페널티 (기존 유지) ===

  // 7. 완공 여부 페널티 (중복 건설 배제)
  const isAlreadyLinked = isRouteComplete(state, route);
  const duplicationPenalty = isAlreadyLinked ? -1000 : 0;
  const competitorPenalty = (isAlreadyLinked && !connectedCities.includes(opp.sourceCityId)) ? -2000 : 0;

  // 8. 경쟁자 진행도
  const opponents = state.activePlayers.filter(id => id !== playerId);
  let opponentMaxProgress = 0;
  for (const oppId of opponents) {
    const progFwd = getRouteProgress(state, oppId, route);
    const progRev = getRouteProgress(state, oppId, { from: opp.targetCityId, to: opp.sourceCityId, priority: 1 });
    opponentMaxProgress = Math.max(opponentMaxProgress, progFwd, progRev);
  }
  const opponentProgressPenalty = opponentMaxProgress > 0.7 ? -1500 : (opponentMaxProgress > 0.3 ? -500 : 0);

  // 9. 상대 목표 경로 충돌
  let opponentTargetPenalty = 0;
  for (const oppId of opponents) {
    const oppRoute = getCurrentRoute(oppId);
    if (!oppRoute) continue;
    const matchesOpp =
      (oppRoute.from === opp.sourceCityId && oppRoute.to === opp.targetCityId) ||
      (oppRoute.from === opp.targetCityId && oppRoute.to === opp.sourceCityId);
    if (matchesOpp) { opponentTargetPenalty = -3500; break; }
    if (opponentTargetPenalty === 0) {
      // 같은 출발지를 공유하면 트랙 건설이 겹칠 위험 → 강한 페널티
      const sharesSameSource = oppRoute.from === opp.sourceCityId;
      if (sharesSameSource) {
        opponentTargetPenalty = -1200;
      } else {
        const sharesEndpoint =
          oppRoute.from === opp.targetCityId ||
          oppRoute.to === opp.sourceCityId || oppRoute.to === opp.targetCityId;
        if (sharesEndpoint) opponentTargetPenalty = -300;
      }
    }
  }

  return deliveryValue + buildEfficiency + connectedBonus + progressBonus
    + multiDeliveryBonus + engineFeasible + duplicationPenalty + competitorPenalty
    + opponentProgressPenalty + opponentTargetPenalty;
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

  // 3. 가치 기반 정렬 (수입 vs 거리 vs 연결성)
  const isFirstTurn = state.currentTurn === 1;

  // 경로 후보 점수 계산 및 로그 출력
  const scoredOpps = opportunities.map(opp => ({
    opp,
    score: scoreOpportunity(opp, state, playerId, player, connectedCities, playerTracks),
  }));
  scoredOpps.sort((a, b) => b.score - a.score);

  // 상위 5개 후보 로그 (항상 출력)
  const opponents = state.activePlayers.filter(id => id !== playerId);
  const oppRoutes = opponents.map(id => ({ id, route: getCurrentRoute(id) }));
  console.log(`[AI 경로선택] ${player.name} Turn ${state.currentTurn}: 상대 경로=${oppRoutes.map(r => r.route ? `${r.id}:${r.route.from}→${r.route.to}` : `${r.id}:없음`).join(', ')}`);
  for (const { opp, score } of scoredOpps.slice(0, 5)) {
    console.log(`  ${opp.sourceCityId}→${opp.targetCityId} (${opp.cubeColor}, 거리${opp.distance}) = ${score.toFixed(0)}`);
  }

  opportunities.sort((a, b) => {
    const aScore = scoreOpportunity(a, state, playerId, player, connectedCities, playerTracks);
    const bScore = scoreOpportunity(b, state, playerId, player, connectedCities, playerTracks);
    return bScore - aScore;
  });

  // 4. 도달 가능 경로 필터
  // 첫 턴: 엔진 레벨까지만 허용 (이번 턴 즉시 배달 가능한 경로만)
  // 이후: 엔진 레벨 +3까지 허용 (장기 계획)
  const maxDistance = isFirstTurn
    ? player.engineLevel
    : player.engineLevel + 3;

  const reachableOpportunities = opportunities.filter(opp => {
    return opp.distance <= maxDistance;
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

  // 점수 계산 후 정렬
  const isFirstTurn = state.currentTurn === 1;

  const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);

  const scored = allOpportunities.map(opp => {
    const route: DeliveryRoute = { from: opp.sourceCityId, to: opp.targetCityId, priority: 1 };

    if (isRouteComplete(state, route, playerId)) {
      return { route, score: -Infinity };
    }

    const score = scoreOpportunity(opp, state, playerId, player, connectedCities, playerTracks);
    return { route, score };
  });

  return scored
    .filter(s => s.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(s => s.route);
}
