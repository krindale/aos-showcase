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
} from './types';
import { ALL_SCENARIOS } from './scenarios';
import {
  analyzeDeliveryOpportunities,
  findMatchingOpportunities,
  hasMatchingCubes,
  getRouteProgress,
  isRouteBlockedByOpponent,
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
    for (const route of scenario.targetRoutes) {
      if (hasMatchingCubes(state, route)) {
        score += (4 - route.priority) * 5;  // priority 1 = +15, 2 = +10, 3 = +5
      }
    }

    // 5. 차단 전략인 경우 상대 위치 고려 (간단화: 트랙 수)
    if (scenario.priority === 'blocking') {
      const opponentTrackCount = state.board.trackTiles.filter(
        t => t.owner !== playerId && t.owner !== null
      ).length;
      score += opponentTrackCount * 3;
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
 */
export function reevaluateStrategy(
  state: GameState,
  playerId: PlayerId
): void {
  const currentStrategy = getSelectedStrategy(playerId);
  if (!currentStrategy) {
    // 전략이 없으면 초기 선택
    const initial = selectInitialStrategy(state, playerId);
    setSelectedStrategy(playerId, initial, state.currentTurn);
    return;
  }

  // 1. 현재 전략 실현 가능성 체크
  const feasibility = evaluateStrategyFeasibility(currentStrategy, state, playerId);

  // 2. 실현 가능성이 낮으면 대안 검토
  if (feasibility.score < STRATEGY_SWITCH_THRESHOLD) {
    const alternatives = evaluateAllScenarios(state, playerId);
    alternatives.sort((a, b) => b.score - a.score);

    const best = alternatives[0];

    // 현재 전략보다 확실히 나은 경우만 변경
    if (best.scenario.name !== currentStrategy.name && best.score > feasibility.score) {
      console.log(`[AI 전략] 전략 변경: ${currentStrategy.nameKo} → ${best.scenario.nameKo}`);
      console.log(`  - 이전 실현 가능성: ${feasibility.score.toFixed(1)}`);
      console.log(`  - 새 전략 점수: ${best.score.toFixed(1)}`);

      if (feasibility.blockedRoutes.length > 0) {
        console.log(`  - 차단된 경로: ${feasibility.blockedRoutes.join(', ')}`);
      }
      if (feasibility.noGoodsRoutes.length > 0) {
        console.log(`  - 물품 없는 경로: ${feasibility.noGoodsRoutes.join(', ')}`);
      }

      setSelectedStrategy(playerId, best.scenario, state.currentTurn);
      return;
    }
  }

  // 3. 경로 우선순위 조정
  adjustRoutePriorities(state, playerId, currentStrategy);
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
 * 다음 목표 경로 가져오기 (미완성 경로 중 우선순위 높은 것)
 *
 * 물품이 있는 경로만 반환. 모든 경로에 물품이 없으면 전략을 재평가.
 */
export function getNextTargetRoute(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const strategy = getSelectedStrategy(playerId);
  if (!strategy) return null;

  // 우선순위 순으로 미완성 + 물품 있는 경로 찾기
  for (const route of strategy.targetRoutes) {
    const progress = getRouteProgress(state, playerId, route);
    const hasCubes = hasMatchingCubes(state, route);

    // 완성되지 않은 경로이고 물품이 있는 경우만
    if (progress < 1.0 && hasCubes) {
      return route;
    }

    // 디버깅: 왜 스킵되는지 로그
    if (progress >= 1.0) {
      console.log(`[AI 전략] ${route.from}→${route.to} 스킵: 이미 완성됨`);
    } else if (!hasCubes) {
      console.log(`[AI 전략] ${route.from}→${route.to} 스킵: 물품 없음`);
    }
  }

  // 모든 경로가 완성되었거나 물품이 없으면 전략 재평가
  console.log(`[AI 전략] ${state.players[playerId]?.name}: 현재 전략(${strategy.nameKo})의 모든 경로 완성/물품없음 - 전략 재평가`);

  // 다른 시나리오 중 물품이 있는 것 찾기
  const scores = evaluateAllScenarios(state, playerId);
  const scoredWithGoods = scores.filter(s => s.matchingCubes > 0);

  if (scoredWithGoods.length > 0) {
    scoredWithGoods.sort((a, b) => b.score - a.score);
    const newStrategy = scoredWithGoods[0].scenario;

    // 현재 전략과 다르면 전환
    if (newStrategy.name !== strategy.name) {
      console.log(`[AI 전략] ${state.players[playerId]?.name}: 전략 변경 ${strategy.nameKo} → ${newStrategy.nameKo}`);
      setSelectedStrategy(playerId, newStrategy, state.currentTurn);

      // 새 전략에서 물품 있는 경로 찾기
      for (const route of newStrategy.targetRoutes) {
        if (hasMatchingCubes(state, route)) {
          return route;
        }
      }
    }
  }

  // 어떤 전략도 물품이 없으면 아무 물품이나 배달 가능한 경로 찾기
  const allOpportunities = analyzeDeliveryOpportunities(state);
  if (allOpportunities.length > 0) {
    // 가장 가까운 배달 기회 선택
    const best = allOpportunities[0];
    console.log(`[AI 전략] ${state.players[playerId]?.name}: 임시 경로 ${best.sourceCityId}→${best.targetCityId} 사용`);
    return { from: best.sourceCityId, to: best.targetCityId, priority: 1 };
  }

  console.log(`[AI 전략] ${state.players[playerId]?.name}: 배달 가능한 물품 없음 - 건설 스킵`);
  return null;
}
