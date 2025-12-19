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
  getStrategyPhase,
  getOptimalLinkRange,
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
  isRoutePracticallyBlocked,
  findAlternativeRoute,
  findAllDeliverableRoutes,
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
 *
 * 현재 턴 단계와 엔진 레벨에 맞는 경로가 많은 시나리오에 보너스 부여
 */
export function evaluateAllScenarios(
  state: GameState,
  playerId: PlayerId
): ScenarioScore[] {
  const opportunities = analyzeDeliveryOpportunities(state);
  const player = state.players[playerId];
  if (!player) return [];

  // 현재 턴 단계와 최적 링크 범위
  const phase = getStrategyPhase(state.currentTurn);
  const linkRange = getOptimalLinkRange(phase);
  const engineLevel = player.engineLevel;

  // 기존 네트워크에서 연결된 도시 목록
  const connectedCities = getConnectedCities(state, playerId);

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

    // 4. 현재 턴 단계에 맞는 경로 보너스
    let executableRoutes = 0;

    for (const route of scenario.targetRoutes) {
      // minTurn 조건 확인
      if (route.minTurn !== undefined && state.currentTurn < route.minTurn) {
        continue;  // 아직 이 경로를 추진할 턴이 아님
      }

      // 엔진 레벨로 실행 가능한지 확인
      const routeLinkCount = route.linkCount ?? 1;
      if (routeLinkCount <= engineLevel) {
        executableRoutes++;

        // 현재 단계 최적 범위 내 경로 보너스
        if (routeLinkCount >= linkRange.min && routeLinkCount <= linkRange.max) {
          score += 15;  // 현재 단계에 적합한 경로
        }
      }

      // 물품이 있으면 추가 보너스
      if (hasMatchingCubes(state, route)) {
        score += (4 - route.priority) * 5;  // priority 1 = +15, 2 = +10, 3 = +5
      }

      // 상대가 이 경로를 건설 중이면 감점
      if (isRouteBlockedByOpponent(state, playerId, route)) {
        score -= (4 - route.priority) * 10;
      }

      // 8. 기존 네트워크에서 도달 가능한 경로에 보너스 (연결성)
      if (connectedCities.includes(route.from)) {
        score += 30;  // 연결된 도시에서 출발
      }
      if (connectedCities.includes(route.to)) {
        score += 20;  // 연결된 도시로 도착
      }
    }

    // 5. 실행 가능한 경로가 많을수록 보너스
    score += executableRoutes * 5;

    // 6. 차단 전략인 경우 상대 위치 고려
    if (scenario.priority === 'blocking') {
      const opponentTrackCount = state.board.trackTiles.filter(
        t => t.owner !== playerId && t.owner !== null
      ).length;
      score += opponentTrackCount * 3;
    }

    // 7. 다중 링크 경로가 있는 시나리오에 보너스 (1링크만 있는 시나리오보다 우선)
    const hasMultiLinkRoutes = scenario.targetRoutes.some(r => (r.linkCount ?? 1) >= 2);
    if (hasMultiLinkRoutes) {
      score += 10;  // 다중 링크 전략 보너스
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
 * 강제 전략 변경 (현재 경로가 차단되었을 때)
 *
 * 차단되지 않은 경로가 있는 시나리오로 강제 전환
 * 모든 시나리오가 차단되면 대안 경로 기반으로 임시 전략 생성
 */
export function forceStrategySwitch(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const currentStrategy = getSelectedStrategy(playerId);
  const player = state.players[playerId];
  if (!player) return null;

  console.log(`[전략 강제 변경] ${player.name}: 현재 전략(${currentStrategy?.nameKo ?? '없음'}) 경로 차단됨`);

  // 1. 모든 시나리오를 평가하되, 차단된 경로 수 기준으로 점수 조정
  const scenarioScores: { scenario: AIStrategy; score: number; unblockedRoutes: number }[] = [];

  for (const scenario of ALL_SCENARIOS) {
    // 이 시나리오에서 차단되지 않은 경로 수
    let unblockedRoutes = 0;
    let hasMatchingGoodsUnblocked = false;

    for (const route of scenario.targetRoutes) {
      if (!isRoutePracticallyBlocked(state, playerId, route)) {
        unblockedRoutes++;
        // 물품도 있는지 확인
        if (hasMatchingCubes(state, route)) {
          hasMatchingGoodsUnblocked = true;
        }
      }
    }

    // 차단되지 않은 경로가 없으면 제외
    if (unblockedRoutes === 0) {
      console.log(`[전략 강제 변경] ${scenario.nameKo}: 모든 경로 차단됨 - 제외`);
      continue;
    }

    // 점수 계산
    let score = unblockedRoutes * 20;

    // 물품이 있는 차단되지 않은 경로가 있으면 보너스
    if (hasMatchingGoodsUnblocked) {
      score += 50;
    }

    // 현재 전략과 다르면 보너스 (경쟁 피하기)
    if (currentStrategy && scenario.name !== currentStrategy.name) {
      score += 10;
    }

    scenarioScores.push({ scenario, score, unblockedRoutes });
  }

  // 점수순 정렬
  scenarioScores.sort((a, b) => b.score - a.score);

  // 2. 최고 점수 시나리오로 전환
  if (scenarioScores.length > 0) {
    const best = scenarioScores[0];
    console.log(`[전략 강제 변경] ${player.name}: ${best.scenario.nameKo} 선택 (비차단 경로: ${best.unblockedRoutes}개, 점수: ${best.score})`);

    setSelectedStrategy(playerId, best.scenario, state.currentTurn);

    // 이 시나리오에서 차단되지 않은 첫 번째 경로 반환
    for (const route of best.scenario.targetRoutes) {
      if (!isRoutePracticallyBlocked(state, playerId, route) && hasMatchingCubes(state, route)) {
        return route;
      }
    }

    // 물품이 있는 경로가 없으면 첫 번째 비차단 경로 반환
    for (const route of best.scenario.targetRoutes) {
      if (!isRoutePracticallyBlocked(state, playerId, route)) {
        return route;
      }
    }
  }

  // 3. 모든 시나리오가 차단되면 대안 경로 탐색
  console.log(`[전략 강제 변경] ${player.name}: 모든 시나리오 차단됨 - 대안 경로 탐색`);
  const alternative = findAlternativeRoute(state, playerId);

  if (alternative) {
    console.log(`[전략 강제 변경] ${player.name}: 대안 경로 ${alternative.from}→${alternative.to} 사용`);
    return alternative;
  }

  console.log(`[전략 강제 변경] ${player.name}: 대안 경로도 없음 - 건설 스킵 권장`);
  return null;
}

/**
 * 동적 화물 분석 기반 다음 목표 경로 선택
 *
 * 시나리오와 무관하게 현재 화물 색상 → 도시 색상 매칭을 분석하여
 * 가장 효율적인 경로(짧고, 연결되어 있고, 화물 있는)를 선택
 *
 * 점수 계산:
 * - 기본 점수: 100
 * - 링크 수 패널티: -15 × linkCount (짧은 경로 우선)
 * - 출발 도시 연결: +50 (기존 네트워크에서 확장)
 * - 도착 도시 연결: +20 (네트워크 확장)
 * - 즉시 배달 가능: +30 (linkCount ≤ engineLevel)
 * - 경로 진행도: +40 × progress (거의 완성된 경로 우선)
 *
 * @param excludeRoutes 제외할 경로 목록 (from→to 형태)
 */
export function getNextTargetRoute(
  state: GameState,
  playerId: PlayerId,
  excludeRoutes: string[] = []
): DeliveryRoute | null {
  const player = state.players[playerId];
  if (!player) return null;

  const currentTurn = state.currentTurn;
  const phase = getStrategyPhase(currentTurn);
  const engineLevel = player.engineLevel;
  const connectedCities = getConnectedCities(state, playerId);

  console.log(`[AI 동적] ${player.name} 턴${currentTurn} (${phase}단계) 엔진Lv${engineLevel} 연결도시: [${connectedCities.join(', ')}]`);

  // 동적으로 모든 배달 가능한 경로 생성
  const allRoutes = findAllDeliverableRoutes(state, playerId);

  if (allRoutes.length === 0) {
    console.log(`[AI 동적] ${player.name}: 배달 가능한 경로 없음`);
    return null;
  }

  // 경로 점수화
  interface ScoredRoute {
    route: DeliveryRoute;
    score: number;
    linkCount: number;
    progress: number;
  }

  const scoredRoutes: ScoredRoute[] = [];

  for (const route of allRoutes) {
    // 제외할 경로 건너뛰기
    const routeKey = `${route.from}→${route.to}`;
    if (excludeRoutes.includes(routeKey)) {
      continue;
    }

    let score = 100;  // 기본 점수

    // 1. 짧은 경로 우선 (linkCount가 작을수록 높은 점수)
    score -= route.linkCount * 15;  // 1링크=85, 2링크=70, 5링크=25

    // 2. 연결된 도시에서 출발하면 큰 보너스
    if (route.isSourceConnected) {
      score += 50;
    }

    // 3. 연결된 도시로 도착하면 보너스
    if (route.isTargetConnected) {
      score += 20;
    }

    // 4. 엔진 레벨로 즉시 배달 가능하면 보너스
    if (route.linkCount <= engineLevel) {
      score += 30;
    }

    // 5. 진행도 보너스 (거의 완성된 경로 우선)
    if (route.progress > 0) {
      score += route.progress * 40;
    }

    // DeliveryRoute 형태로 변환
    const deliveryRoute: DeliveryRoute = {
      from: route.from,
      to: route.to,
      priority: 1,
      linkCount: route.linkCount,
    };

    scoredRoutes.push({
      route: deliveryRoute,
      score,
      linkCount: route.linkCount,
      progress: route.progress,
    });
  }

  // 점수순으로 정렬 (높은 점수 우선)
  scoredRoutes.sort((a, b) => b.score - a.score);

  // 모든 경로가 제외되면 null 반환
  if (scoredRoutes.length === 0) {
    console.log(`[AI 동적] ${player.name}: 모든 경로가 제외됨 - 목표 없음`);
    return null;
  }

  // 상위 5개 경로 로그
  console.log(`[AI 동적] 후보 경로 (상위 5개):`);
  scoredRoutes.slice(0, 5).forEach((sr, i) => {
    console.log(`  ${i + 1}. ${sr.route.from}→${sr.route.to} (점수: ${sr.score.toFixed(0)}, ${sr.linkCount}링크, 진행: ${(sr.progress * 100).toFixed(0)}%)`);
  });

  // 최고 점수 경로 선택
  const best = scoredRoutes[0];
  console.log(`[AI 동적] ${best.route.from}→${best.route.to} 선택됨 (점수: ${best.score.toFixed(0)})`);

  // 다중 링크 경로인 경우 세그먼트로 분해
  const segments = breakRouteIntoSegments(best.route, state.board);

  if (segments.length > 1) {
    console.log(`[AI 동적] ${best.route.from}→${best.route.to}: 다중 링크 → 세그먼트 [${segments.map(s => `${s.from}→${s.to}`).join(', ')}]`);

    // 정방향: 연결된 도시에서 시작하는 미완성 세그먼트 찾기
    for (const segment of segments) {
      const segmentProgress = getRouteProgress(state, playerId, segment);
      if (segmentProgress < 1.0 && connectedCities.includes(segment.from)) {
        console.log(`[AI 동적] 세그먼트 ${segment.from}→${segment.to} 선택 (연결됨)`);
        return { ...segment, linkCount: 1 };
      }
    }

    // 역방향: 도착 도시에서 시작하는 미완성 세그먼트 찾기
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];
      const segmentProgress = getRouteProgress(state, playerId, segment);
      if (segmentProgress < 1.0 && connectedCities.includes(segment.to)) {
        console.log(`[AI 동적] 세그먼트 ${segment.to}→${segment.from} 선택 (역방향, 연결됨)`);
        return { from: segment.to, to: segment.from, priority: segment.priority, linkCount: 1 };
      }
    }

    // 연결된 세그먼트가 없으면 첫 번째 미완성 세그먼트 반환
    for (const segment of segments) {
      const segmentProgress = getRouteProgress(state, playerId, segment);
      if (segmentProgress < 1.0) {
        console.log(`[AI 동적] 세그먼트 ${segment.from}→${segment.to} 선택 (미연결)`);
        return { ...segment, linkCount: 1 };
      }
    }
  }

  // 1링크 경로는 그대로 반환
  return best.route;
}
