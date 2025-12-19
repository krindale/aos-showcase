/**
 * AI 전략 선택 및 재평가 로직
 */

import { GameState, PlayerId, GAME_CONSTANTS } from '@/types/game';
import {
  AIStrategy,
  ScenarioScore,
  FeasibilityResult,
  STRATEGY_SWITCH_THRESHOLD,
  DeliveryRoute,
  RouteSearchResult,
} from './types';
import { ALL_SCENARIOS } from './scenarios';
import {
  analyzeDeliveryOpportunities,
  findMatchingOpportunities,
  hasMatchingCubes,
  getRouteProgress,
  isRouteBlockedByOpponent,
  analyzeOpponentTracks,
  getStrategyAdjustments,
  getConnectedCities,
  breakRouteIntoSegments,
} from './analyzer';
import { getSelectedStrategy, setSelectedStrategy } from './state';

/**
 * 초기 전략 선택 (게임 시작 시)
 */
export function selectInitialStrategy(
  state: GameState,
  playerId: PlayerId
): AIStrategy {
  const scores = evaluateAllScenarios(state, playerId);

  // 가장 높은 점수의 시나리오 선택
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  console.log(`[AI 전략] ${state.players[playerId]?.name}: ${best.scenario.nameKo} 선택 (점수: ${best.score.toFixed(1)})`);
  console.log(`  - 매칭 물품: ${best.matchingCubes}개`);
  console.log(`  - 현금 충분: ${best.cashFeasible ? '예' : '아니오'}`);
  console.log(`  - 엔진 충족: ${best.engineFeasible ? '예' : '아니오'}`);

  return best.scenario;
}

/**
 * 모든 시나리오 평가
 */
export function evaluateAllScenarios(
  state: GameState,
  playerId: PlayerId
): ScenarioScore[] {
  const opportunities = analyzeDeliveryOpportunities(state);
  const player = state.players[playerId];
  if (!player) return [];

  return ALL_SCENARIOS.map(scenario => {
    const matching = findMatchingOpportunities(opportunities, scenario);

    // 현금 충분 여부 (현재 + 발행 가능 주식 2장)
    const potentialCash = player.cash + (2 * GAME_CONSTANTS.SHARE_VALUE);
    const cashFeasible = potentialCash >= scenario.requiredCash;

    // 엔진 레벨 충분 여부 (locomotive 행동으로 +1 가능 고려)
    const canGetLocomotive = scenario.preferredActions.includes('locomotive');
    const engineFeasible = player.engineLevel >= scenario.minEngineLevel ||
      (canGetLocomotive && player.engineLevel + 1 >= scenario.minEngineLevel);

    // 점수 계산
    let score = 0;

    // 1. 매칭 물품 수 (가장 중요)
    score += matching.length * 10;

    // 2. 현금 충분 보너스
    if (cashFeasible) score += 20;

    // 3. 엔진 레벨 충족 보너스
    if (engineFeasible) score += 15;

    // 4. 우선순위가 높은 경로에 물품이 있으면 추가 보너스
    // 5. 상대가 이미 건설 중인 경로는 감점
    let blockedRouteCount = 0;
    for (const route of scenario.targetRoutes) {
      if (hasMatchingCubes(state, route)) {
        score += (4 - route.priority) * 5;  // priority 1 = +15, 2 = +10, 3 = +5
      }
      // 상대가 이 경로를 건설 중이면 감점
      if (isRouteBlockedByOpponent(state, playerId, route)) {
        blockedRouteCount++;
        score -= (4 - route.priority) * 10;  // 우선순위 높은 경로가 차단되면 더 큰 감점
      }
    }

    // 6. 차단 전략인 경우 상대 위치 고려 (간단화: 트랙 수)
    if (scenario.priority === 'blocking') {
      const opponentTrackCount = state.board.trackTiles.filter(
        t => t.owner !== playerId && t.owner !== null
      ).length;
      score += opponentTrackCount * 3;
    }

    // 7. 모든 주요 경로가 차단되면 큰 감점
    if (blockedRouteCount >= 2) {
      score -= 30;
    }

    return {
      scenario,
      score,
      matchingCubes: matching.length,
      cashFeasible,
      engineFeasible,
    };
  });
}

/**
 * 현재 전략의 실현 가능성 평가
 */
export function evaluateStrategyFeasibility(
  strategy: AIStrategy,
  state: GameState,
  playerId: PlayerId
): FeasibilityResult {
  const player = state.players[playerId];
  if (!player) {
    return { score: 0, blockedRoutes: [], noGoodsRoutes: [], cashShortage: Infinity };
  }

  const blockedRoutes: string[] = [];
  const noGoodsRoutes: string[] = [];

  // 각 경로 체크
  for (const route of strategy.targetRoutes) {
    // 차단 여부
    if (isRouteBlockedByOpponent(state, playerId, route)) {
      blockedRoutes.push(`${route.from}-${route.to}`);
    }

    // 물품 존재 여부
    if (!hasMatchingCubes(state, route)) {
      noGoodsRoutes.push(`${route.from}-${route.to}`);
    }
  }

  // 현금 부족액
  const cashShortage = Math.max(0, strategy.requiredCash - player.cash);

  // 점수 계산 (0-100)
  let score = 100;

  // 차단된 경로당 -20
  score -= blockedRoutes.length * 20;

  // 물품 없는 경로당 -15 (우선순위 1인 경로면 -25)
  for (const routeStr of noGoodsRoutes) {
    const route = strategy.targetRoutes.find(r => `${r.from}-${r.to}` === routeStr);
    if (route?.priority === 1) {
      score -= 25;
    } else {
      score -= 15;
    }
  }

  // 현금 부족시 -10
  if (cashShortage > 0) {
    score -= 10 + (cashShortage / 2);
  }

  return {
    score: Math.max(0, score),
    blockedRoutes,
    noGoodsRoutes,
    cashShortage,
  };
}

/**
 * 전략 재평가 (매 턴 호출)
 *
 * 상대방의 트랙 건설 현황을 분석하여 전략을 수정하거나 새로운 전략을 수립
 */
export function reevaluateStrategy(
  state: GameState,
  playerId: PlayerId
): void {
  const currentStrategy = getSelectedStrategy(playerId);

  // 1. 상대 트랙 분석
  const opponentAnalysis = analyzeOpponentTracks(state, playerId);
  const strategyAdjustments = getStrategyAdjustments(state, playerId, opponentAnalysis);

  if (!currentStrategy) {
    // 전략이 없으면 초기 선택 (상대 분석 포함)
    const initial = selectInitialStrategyWithAnalysis(state, playerId, strategyAdjustments);
    setSelectedStrategy(playerId, initial, state.currentTurn);
    return;
  }

  // 2. 현재 전략 실현 가능성 체크
  const feasibility = evaluateStrategyFeasibility(currentStrategy, state, playerId);

  // 3. 상대 분석에 따른 현재 전략 점수 조정
  const currentAdjustment = strategyAdjustments.get(currentStrategy.name) || 0;
  const adjustedFeasibility = feasibility.score + currentAdjustment;

  // 4. 상대가 같은 경로를 건설 중이면 전략 변경 고려
  const shouldReconsider = currentAdjustment < -20 || feasibility.score < STRATEGY_SWITCH_THRESHOLD;

  if (shouldReconsider) {
    console.log(`[AI 전략] ${state.players[playerId]?.name}: 상대 분석으로 전략 재검토`);
    console.log(`  - 현재 전략: ${currentStrategy.nameKo}`);
    console.log(`  - 실현 가능성: ${feasibility.score.toFixed(1)}`);
    console.log(`  - 상대 분석 조정: ${currentAdjustment}`);

    // 모든 시나리오 재평가 (상대 분석 포함)
    const alternatives = evaluateAllScenariosWithAnalysis(state, playerId, strategyAdjustments);
    alternatives.sort((a, b) => b.adjustedScore - a.adjustedScore);

    const best = alternatives[0];

    // 현재 전략보다 확실히 나은 경우 변경
    if (best.scenario.name !== currentStrategy.name && best.adjustedScore > adjustedFeasibility + 10) {
      console.log(`[AI 전략] 전략 변경: ${currentStrategy.nameKo} → ${best.scenario.nameKo}`);
      console.log(`  - 이전 조정 점수: ${adjustedFeasibility.toFixed(1)}`);
      console.log(`  - 새 조정 점수: ${best.adjustedScore.toFixed(1)}`);

      if (feasibility.blockedRoutes.length > 0) {
        console.log(`  - 차단된 경로: ${feasibility.blockedRoutes.join(', ')}`);
      }

      setSelectedStrategy(playerId, best.scenario, state.currentTurn);
      return;
    }
  }

  // 5. 경로 우선순위 조정 (상대가 향하는 도시는 후순위로)
  adjustRoutePrioritiesWithAnalysis(state, playerId, currentStrategy, opponentAnalysis);
}

/**
 * 상대 분석을 포함한 초기 전략 선택
 */
function selectInitialStrategyWithAnalysis(
  state: GameState,
  playerId: PlayerId,
  adjustments: Map<string, number>
): AIStrategy {
  const scores = evaluateAllScenariosWithAnalysis(state, playerId, adjustments);
  scores.sort((a, b) => b.adjustedScore - a.adjustedScore);

  const best = scores[0];
  const player = state.players[playerId];

  console.log(`[AI 전략] ${player?.name}: ${best.scenario.nameKo} 선택`);
  console.log(`  - 기본 점수: ${best.baseScore.toFixed(1)}`);
  console.log(`  - 상대 분석 조정: ${best.adjustment}`);
  console.log(`  - 최종 점수: ${best.adjustedScore.toFixed(1)}`);

  return best.scenario;
}

/**
 * 상대 분석을 포함한 모든 시나리오 평가
 */
interface ScenarioScoreWithAdjustment {
  scenario: AIStrategy;
  baseScore: number;
  adjustment: number;
  adjustedScore: number;
  matchingCubes: number;
}

function evaluateAllScenariosWithAnalysis(
  state: GameState,
  playerId: PlayerId,
  adjustments: Map<string, number>
): ScenarioScoreWithAdjustment[] {
  const baseScores = evaluateAllScenarios(state, playerId);

  return baseScores.map(score => {
    const adjustment = adjustments.get(score.scenario.name) || 0;
    return {
      scenario: score.scenario,
      baseScore: score.score,
      adjustment,
      adjustedScore: score.score + adjustment,
      matchingCubes: score.matchingCubes,
    };
  });
}

/**
 * 상대 분석을 포함한 경로 우선순위 조정
 */
function adjustRoutePrioritiesWithAnalysis(
  state: GameState,
  playerId: PlayerId,
  strategy: AIStrategy,
  opponentAnalysis: { targetCities: string[]; connectedCities: string[] }
): void {
  const adjustedRoutes: DeliveryRoute[] = [];

  for (const route of strategy.targetRoutes) {
    const progress = getRouteProgress(state, playerId, route);
    const hasCubes = hasMatchingCubes(state, route);
    const isBlocked = isRouteBlockedByOpponent(state, playerId, route);

    // 상대가 목표로 하는 도시인지 확인
    const opponentTargetsFrom = opponentAnalysis.targetCities.includes(route.from) ||
                                 opponentAnalysis.connectedCities.includes(route.from);
    const opponentTargetsTo = opponentAnalysis.targetCities.includes(route.to) ||
                               opponentAnalysis.connectedCities.includes(route.to);

    let newPriority = route.priority;

    // 경로가 거의 완성되면 최우선 (상대 상관없이)
    if (progress >= 0.8 && hasCubes) {
      newPriority = 1;
    }
    // 상대가 같은 경로를 노리면 후순위 (경쟁 피하기)
    else if (opponentTargetsFrom && opponentTargetsTo) {
      newPriority = 3;
      console.log(`[경로 조정] ${route.from}→${route.to}: 상대 경쟁 경로 → 후순위`);
    }
    // 물품이 없거나 차단되면 후순위
    else if (!hasCubes || isBlocked) {
      newPriority = 3;
    }
    // 상대가 관심 없는 경로면 우선순위 상승
    else if (!opponentTargetsFrom && !opponentTargetsTo && progress > 0) {
      newPriority = Math.min(1, route.priority);
      console.log(`[경로 조정] ${route.from}→${route.to}: 상대 무관심 → 우선순위 상승`);
    }
    // 진행 중이면 중간 우선순위
    else if (progress > 0) {
      newPriority = Math.min(2, route.priority);
    }

    adjustedRoutes.push({
      ...route,
      priority: newPriority,
    });
  }

  // 우선순위 재정렬
  adjustedRoutes.sort((a, b) => a.priority - b.priority);

  // 전략 업데이트
  const updatedStrategy: AIStrategy = {
    ...strategy,
    targetRoutes: adjustedRoutes,
  };

  setSelectedStrategy(playerId, updatedStrategy, state.currentTurn);
}

/**
 * 경로 우선순위 동적 조정
 */
export function adjustRoutePriorities(
  state: GameState,
  playerId: PlayerId,
  strategy: AIStrategy
): void {
  const adjustedRoutes: DeliveryRoute[] = [];

  for (const route of strategy.targetRoutes) {
    const progress = getRouteProgress(state, playerId, route);
    const hasCubes = hasMatchingCubes(state, route);
    const isBlocked = isRouteBlockedByOpponent(state, playerId, route);

    let newPriority = route.priority;

    // 경로가 거의 완성되면 최우선
    if (progress >= 0.8 && hasCubes) {
      newPriority = 1;
    }
    // 물품이 없거나 차단되면 후순위
    else if (!hasCubes || isBlocked) {
      newPriority = 3;
    }
    // 진행 중이면 중간 우선순위
    else if (progress > 0) {
      newPriority = Math.min(2, route.priority);
    }

    adjustedRoutes.push({
      ...route,
      priority: newPriority,
    });
  }

  // 우선순위 재정렬
  adjustedRoutes.sort((a, b) => a.priority - b.priority);

  // 전략 업데이트 (불변성 유지를 위해 새 객체 생성)
  const updatedStrategy: AIStrategy = {
    ...strategy,
    targetRoutes: adjustedRoutes,
  };

  setSelectedStrategy(playerId, updatedStrategy, state.currentTurn);
}

/**
 * [순수 함수] 다음 목표 경로 탐색 (전략 변경 없음)
 *
 * 현재 전략에서 물품이 있는 미완성 경로를 찾습니다.
 * 전략 변경이 필요하면 needsStrategyReeval: true를 반환합니다.
 */
export function findNextTargetRoute(
  state: GameState,
  playerId: PlayerId
): RouteSearchResult {
  const strategy = getSelectedStrategy(playerId);
  if (!strategy) {
    return { route: null, needsStrategyReeval: true, reason: 'no_strategy' };
  }

  const connectedCities = getConnectedCities(state, playerId);

  // 우선순위 순으로 미완성 + 물품 있는 경로 찾기
  for (const route of strategy.targetRoutes) {
    const progress = getRouteProgress(state, playerId, route);
    const hasCubes = hasMatchingCubes(state, route);

    if (progress < 1.0 && hasCubes) {
      // 다중 링크 경로인 경우 세그먼트로 분해
      const segments = breakRouteIntoSegments(route, state.board);

      if (segments.length > 1) {
        // 정방향: 연결된 도시에서 시작하는 미완성 세그먼트
        for (const segment of segments) {
          const segmentProgress = getRouteProgress(state, playerId, segment);
          if (segmentProgress < 1.0 && connectedCities.includes(segment.from)) {
            return { route: segment, needsStrategyReeval: false };
          }
        }

        // 역방향: 도착 도시에서 시작하는 미완성 세그먼트
        for (let i = segments.length - 1; i >= 0; i--) {
          const segment = segments[i];
          const segmentProgress = getRouteProgress(state, playerId, segment);
          if (segmentProgress < 1.0 && connectedCities.includes(segment.to)) {
            return {
              route: { from: segment.to, to: segment.from, priority: segment.priority },
              needsStrategyReeval: false
            };
          }
        }

        // 연결된 세그먼트가 없으면 첫 번째 미완성 세그먼트
        for (const segment of segments) {
          const segmentProgress = getRouteProgress(state, playerId, segment);
          if (segmentProgress < 1.0) {
            return { route: segment, needsStrategyReeval: false };
          }
        }
      }

      // 1링크 경로는 그대로 반환
      return { route, needsStrategyReeval: false };
    }
  }

  // 모든 경로가 완성되었거나 물품이 없음
  return { route: null, needsStrategyReeval: true, reason: 'all_routes_exhausted' };
}

/**
 * 다음 목표 경로 가져오기 (미완성 경로 중 우선순위 높은 것)
 *
 * 다중 링크 경로는 세그먼트로 분해하여 빌드 가능한 세그먼트 반환.
 * 물품이 있는 경로만 반환. 모든 경로에 물품이 없으면 전략을 재평가.
 */
export function getNextTargetRoute(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  // 1. 순수 함수로 경로 탐색
  const result = findNextTargetRoute(state, playerId);

  if (result.route) {
    return result.route;
  }

  // 2. 전략이 없는 경우
  if (result.reason === 'no_strategy') {
    return null;
  }

  // 3. 재평가 필요 - 여기서만 전략 변경 수행
  const strategy = getSelectedStrategy(playerId);
  const connectedCities = getConnectedCities(state, playerId);
  const player = state.players[playerId];

  console.log(`[AI 전략] ${player?.name}: 모든 경로 소진 - 대안 탐색`);

  // 다른 시나리오 중 물품이 있는 것 찾기
  const scores = evaluateAllScenarios(state, playerId);
  const scoredWithGoods = scores.filter(s => s.matchingCubes > 0);

  if (scoredWithGoods.length > 0 && strategy) {
    scoredWithGoods.sort((a, b) => b.score - a.score);
    const newStrategy = scoredWithGoods[0].scenario;

    // 현재 전략과 다르면 전환
    if (newStrategy.name !== strategy.name) {
      console.log(`[AI 전략] ${player?.name}: 전략 변경 ${strategy.nameKo} → ${newStrategy.nameKo}`);
      setSelectedStrategy(playerId, newStrategy, state.currentTurn);

      // 새 전략에서 물품 있는 경로 찾기
      for (const route of newStrategy.targetRoutes) {
        if (hasMatchingCubes(state, route)) {
          const segments = breakRouteIntoSegments(route, state.board);
          if (segments.length > 1) {
            for (const segment of segments) {
              const segmentProgress = getRouteProgress(state, playerId, segment);
              if (segmentProgress < 1.0 && connectedCities.includes(segment.from)) {
                return segment;
              }
            }
          }
          return route;
        }
      }
    }
  }

  // 어떤 전략도 물품이 없으면 아무 물품이나 배달 가능한 경로 찾기
  const allOpportunities = analyzeDeliveryOpportunities(state);
  if (allOpportunities.length > 0) {
    const reachableOpportunities = allOpportunities.filter(opp =>
      connectedCities.includes(opp.sourceCityId)
    );

    if (reachableOpportunities.length > 0) {
      const best = reachableOpportunities[0];
      const tempRoute: DeliveryRoute = { from: best.sourceCityId, to: best.targetCityId, priority: 1 };
      const segments = breakRouteIntoSegments(tempRoute, state.board);

      if (segments.length > 1) {
        for (const segment of segments) {
          if (connectedCities.includes(segment.from)) {
            return segment;
          }
        }
      }
      return tempRoute;
    }

    // 트랙이 없는 경우 첫 번째 기회 사용
    const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);
    if (playerTracks.length === 0) {
      const best = allOpportunities[0];
      return { from: best.sourceCityId, to: best.targetCityId, priority: 1 };
    }
  }

  return null;
}
