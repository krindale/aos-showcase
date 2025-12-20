/**
 * 전략 분석 수집기
 *
 * AI의 동적 화물 기반 전략을 분석합니다.
 */

import { GameState, PlayerId } from '@/types/game';
import {
  StrategyAnalysisReport,
  StrategyFeasibility,
  OpponentAnalysisReport,
} from '../types';
import {
  analyzeOpponentTracks,
  analyzeDeliveryOpportunities,
  getRouteProgress,
  isRouteBlockedByOpponent,
} from '../../strategy/analyzer';
import { getSelectedStrategy, getCurrentRoute } from '../../strategy/state';

/**
 * 전략 분석 수집
 */
export function collectStrategyAnalysis(
  state: GameState,
  playerId: PlayerId
): StrategyAnalysisReport {
  const player = state.players[playerId];
  const strategy = getSelectedStrategy(playerId);
  const currentRoute = getCurrentRoute(playerId);

  // 상대 분석
  const opponentId = playerId === 'player1' ? 'player2' : 'player1';
  const opponentAnalysisRaw = analyzeOpponentTracks(state, playerId);

  // 배달 기회 분석
  const opportunities = analyzeDeliveryOpportunities(state);

  // 현재 전략 실현 가능성
  let feasibility: StrategyFeasibility = {
    score: 0,
    blockedRoutes: [],
    noGoodsRoutes: [],
    cashShortage: 0,
  };

  if (currentRoute) {
    const progress = getRouteProgress(state, playerId, currentRoute);
    const isBlocked = isRouteBlockedByOpponent(state, playerId, currentRoute);
    const hasMatchingCargo = opportunities.some(
      opp => opp.sourceCityId === currentRoute.from && opp.targetCityId === currentRoute.to
    );

    feasibility = {
      score: progress * 100,
      blockedRoutes: isBlocked ? [`${currentRoute.from}→${currentRoute.to}`] : [],
      noGoodsRoutes: hasMatchingCargo ? [] : [`${currentRoute.from}→${currentRoute.to}`],
      cashShortage: Math.max(0, 9 - (player?.cash ?? 0)),
    };
  }

  // 상대 분석 포맷팅
  const cityDistances: { cityId: string; distance: number }[] = [];
  opponentAnalysisRaw.cityDistances.forEach((dist, cityId) => {
    cityDistances.push({ cityId, distance: dist });
  });

  const opponentAnalysis: OpponentAnalysisReport = {
    opponentId,
    trackCount: opponentAnalysisRaw.trackCount,
    connectedCities: opponentAnalysisRaw.connectedCities,
    targetCities: opponentAnalysisRaw.targetCities,
    cityDistances,
  };

  return {
    playerId,
    playerName: player?.name || 'Unknown',
    currentStrategy: strategy ? {
      name: strategy.name,
      nameKo: strategy.nameKo,
      targetRoutes: strategy.targetRoutes,
    } : null,
    scenarioScores: [], // 동적 전략에서는 사용하지 않음
    feasibility,
    opponentAnalysis,
    strategyHistory: [],
  };
}
