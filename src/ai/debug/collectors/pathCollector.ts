/**
 * 경로 분석 수집기
 *
 * AI의 목표 경로 진행 상황을 분석합니다.
 */

import { GameState, PlayerId } from '@/types/game';
import { PathAnalysisReport, TargetRouteAnalysis } from '../types';
import { getSelectedStrategy } from '../../strategy/state';
import {
  findOptimalPath,
  getRouteProgress,
  hasMatchingCubes,
  isRouteBlockedByOpponent,
  getConnectedCities,
  getIntermediateCities,
} from '../../strategy/analyzer';

/**
 * 경로 분석 수집
 */
export function collectPathAnalysis(
  state: GameState,
  playerId: PlayerId
): PathAnalysisReport {
  const { board } = state;
  const strategy = getSelectedStrategy(playerId);

  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
  const connectedCities = getConnectedCities(state, playerId);

  const targetRoutes: TargetRouteAnalysis[] = [];

  if (strategy) {
    for (const route of strategy.targetRoutes) {
      const sourceCity = board.cities.find(c => c.id === route.from);
      const targetCity = board.cities.find(c => c.id === route.to);

      if (!sourceCity || !targetCity) continue;

      // 최적 경로 계산
      const optimalPath = findOptimalPath(sourceCity.coord, targetCity.coord, board);

      // 경로 비용 계산
      let pathCost = 0;
      for (const coord of optimalPath) {
        // 도시는 비용 0
        if (board.cities.some(c => c.coord.col === coord.col && c.coord.row === coord.row)) {
          continue;
        }
        const hex = board.hexTiles.find(h => h.coord.col === coord.col && h.coord.row === coord.row);
        if (hex) {
          switch (hex.terrain) {
            case 'river': pathCost += 3; break;
            case 'mountain': pathCost += 4; break;
            default: pathCost += 2; break;
          }
        }
      }

      // 경로 진행도
      const progress = getRouteProgress(state, playerId, route);
      const isComplete = progress >= 1.0;

      // 물품 존재 여부
      const matchingCubes = hasMatchingCubes(state, route);

      // 차단 여부
      const isBlocked = isRouteBlockedByOpponent(state, playerId, route);

      // 중간 도시
      const intermediateCities = getIntermediateCities(route, board);

      targetRoutes.push({
        from: route.from,
        to: route.to,
        priority: route.priority,
        progress,
        isComplete,
        hasMatchingCubes: matchingCubes,
        isBlocked,
        optimalPath,
        pathCost,
        intermediateCities,
      });
    }
  }

  return {
    playerId,
    targetRoutes,
    connectedCities,
    playerTrackCount: playerTracks.length,
  };
}
