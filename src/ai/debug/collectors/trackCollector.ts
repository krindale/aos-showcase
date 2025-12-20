/**
 * 트랙 평가 수집기
 *
 * 트랙 건설 후보의 상세 점수 분해를 제공합니다.
 */

import { GameState, PlayerId, HexCoord, GAME_CONSTANTS } from '@/types/game';
import { TrackEvaluationReport, TrackScoreBreakdown } from '../types';
import { DeliveryRoute } from '../../strategy/types';
import {
  findOptimalPath,
  getEdgeBetweenHexes,
  hexDistance,
} from '../../strategy/analyzer';
import { hexCoordsEqual } from '@/utils/hexGrid';

/**
 * 트랙 평가 상세 수집
 *
 * buildTrack phase에서 특정 트랙 후보의 점수 분해를 제공합니다.
 */
export function collectTrackEvaluation(
  state: GameState,
  playerId: PlayerId,
  coord: HexCoord,
  edges: [number, number],
  targetRoute: DeliveryRoute
): TrackEvaluationReport {
  const { board } = state;

  // 출발/도착 도시 찾기
  const sourceCity = board.cities.find(c => c.id === targetRoute.from);
  const targetCity = board.cities.find(c => c.id === targetRoute.to);

  const scores: TrackScoreBreakdown = {
    onPathBonus: 0,
    nextBuildBonus: 0,
    positionBonus: 0,
    edgeTowardsNextBonus: 0,
    edgeFromPrevBonus: 0,
    wrongDirectionPenalty: 0,
    adjacentCityBonus: 0,
  };

  let isOnOptimalPath = false;
  let positionOnPath = -1;
  let lastConnectedPosition = -1;
  let nextBuildPosition = 0;

  // 지형 비용
  let terrainCost = GAME_CONSTANTS.PLAIN_TRACK_COST;
  const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (hex) {
    switch (hex.terrain) {
      case 'river': terrainCost = GAME_CONSTANTS.RIVER_TRACK_COST; break;
      case 'mountain': terrainCost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST; break;
    }
  }

  if (!sourceCity || !targetCity) {
    return {
      coord,
      edges,
      targetRoute,
      isOnOptimalPath: false,
      positionOnPath: -1,
      lastConnectedPosition: -1,
      nextBuildPosition: 0,
      scores,
      totalRouteScore: 0,
      basePositionScore: 0,
      terrainCost,
      valueRatio: 0,
    };
  }

  // 최적 경로 계산
  const optimalPath = findOptimalPath(sourceCity.coord, targetCity.coord, board);

  if (optimalPath.length === 0) {
    return {
      coord,
      edges,
      targetRoute,
      isOnOptimalPath: false,
      positionOnPath: -1,
      lastConnectedPosition: -1,
      nextBuildPosition: 0,
      scores,
      totalRouteScore: 0,
      basePositionScore: 0,
      terrainCost,
      valueRatio: 0,
    };
  }

  // 경로상 위치 확인
  positionOnPath = optimalPath.findIndex(p => hexCoordsEqual(p, coord));
  isOnOptimalPath = positionOnPath >= 0;

  // 플레이어 트랙과 연결된 마지막 위치 찾기
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
  for (let i = 0; i < optimalPath.length; i++) {
    const pathCoord = optimalPath[i];
    const isConnected =
      board.cities.some(c => hexCoordsEqual(c.coord, pathCoord)) ||
      playerTracks.some(t => hexCoordsEqual(t.coord, pathCoord));
    if (isConnected) {
      lastConnectedPosition = i;
    }
  }
  nextBuildPosition = lastConnectedPosition + 1;

  // 점수 계산
  if (isOnOptimalPath) {
    scores.onPathBonus = 100;

    // 다음 건설 위치 보너스
    if (positionOnPath === nextBuildPosition) {
      scores.nextBuildBonus = 50;
    } else if (positionOnPath === nextBuildPosition + 1) {
      scores.positionBonus = 30;
    } else if (positionOnPath === nextBuildPosition + 2) {
      scores.positionBonus = 10;
    }

    // 엣지 방향 평가
    const prevPathCoord = positionOnPath > 0 ? optimalPath[positionOnPath - 1] : null;
    const nextPathCoord = positionOnPath < optimalPath.length - 1 ? optimalPath[positionOnPath + 1] : null;

    let edgeTowardsPrev = -1;
    let edgeTowardsNext = -1;

    if (prevPathCoord) {
      edgeTowardsPrev = getEdgeBetweenHexes(coord, prevPathCoord);
    }
    if (nextPathCoord) {
      edgeTowardsNext = getEdgeBetweenHexes(coord, nextPathCoord);
    }

    const [edge0, edge1] = edges;

    // 출구 엣지가 다음 경로 위치를 향하면 보너스
    if (edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext)) {
      scores.edgeTowardsNextBonus = 80;
    }

    // 입구 엣지가 이전 경로에서 오면 보너스
    if (edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev)) {
      scores.edgeFromPrevBonus = 40;
    }

    // 둘 다 경로와 관련 없는 방향이면 감점
    const edgeMatchesPrev = edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev);
    const edgeMatchesNext = edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext);

    if (!edgeMatchesPrev && !edgeMatchesNext) {
      scores.wrongDirectionPenalty = -50;
    }
  } else {
    // 경로에 없지만 가까우면 부분 점수
    let minDistToPath = Infinity;
    for (const pathCoord of optimalPath) {
      const dist = hexDistance(coord, pathCoord);
      minDistToPath = Math.min(minDistToPath, dist);
    }

    if (minDistToPath === 1) {
      scores.positionBonus = 20;
    } else if (minDistToPath === 2) {
      scores.positionBonus = 5;
    }
  }

  // 도시 인접 보너스
  const distToSource = hexDistance(coord, sourceCity.coord);
  const distToTarget = hexDistance(coord, targetCity.coord);
  if (distToSource === 1 || distToTarget === 1) {
    scores.adjacentCityBonus = 25;
  }

  // 총점 계산
  const totalRouteScore =
    scores.onPathBonus +
    scores.nextBuildBonus +
    scores.positionBonus +
    scores.edgeTowardsNextBonus +
    scores.edgeFromPrevBonus +
    scores.wrongDirectionPenalty +
    scores.adjacentCityBonus;

  // 기본 위치 점수 (도시 근접성 등)
  let basePositionScore = 0;
  for (const city of board.cities) {
    const dist = hexDistance(coord, city.coord);
    if (dist === 1) basePositionScore += 3;
  }

  const valueRatio = (basePositionScore + totalRouteScore * 2) / Math.max(terrainCost, 1);

  return {
    coord,
    edges,
    targetRoute,
    isOnOptimalPath,
    positionOnPath,
    lastConnectedPosition,
    nextBuildPosition,
    scores,
    totalRouteScore,
    basePositionScore,
    terrainCost,
    valueRatio,
  };
}

/**
 * 여러 트랙 후보의 평가 수집
 */
export function collectTrackEvaluations(
  state: GameState,
  playerId: PlayerId,
  candidates: { coord: HexCoord; edges: [number, number] }[],
  targetRoute: DeliveryRoute
): TrackEvaluationReport[] {
  return candidates.map(candidate =>
    collectTrackEvaluation(state, playerId, candidate.coord, candidate.edges, targetRoute)
  );
}
