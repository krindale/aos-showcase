/**
 * Phase IV: 트랙 건설 전략
 *
 * AI가 선택한 전략의 목표 경로를 향해 트랙을 건설합니다.
 */

import { GameState, PlayerId, HexCoord, GAME_CONSTANTS } from '@/types/game';
import { evaluateTrackPosition } from '../evaluator';
import {
  isValidConnectionPoint,
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
} from '@/utils/trackValidation';
import { getBuildableNeighbors, getExitDirections, hexCoordsEqual } from '@/utils/hexGrid';
import { getSelectedStrategy, hasSelectedStrategy } from '../strategy/state';
import { getNextTargetRoute, reevaluateStrategy } from '../strategy/selector';
import { evaluateTrackForRoute, getIntermediateCities, getConnectedCities } from '../strategy/analyzer';
import type { DeliveryRoute } from '../strategy/types';

export type TrackBuildDecision =
  | { action: 'build'; coord: HexCoord; edges: [number, number] }
  | { action: 'skip' }; // 건설 스킵

interface BuildCandidate {
  coord: HexCoord;
  edges: [number, number];
  score: number;
  cost: number;
  routeScore: number;  // 전략 경로 점수
}

/**
 * 트랙 건설 결정
 *
 * 전략:
 * 1. 건설 가능한 모든 위치 탐색
 * 2. 각 위치의 전략적 가치 평가 (기본 + 경로 점수)
 * 3. 비용 대비 가치가 높은 위치 선택
 * 4. 현금이 부족하면 건설 스킵
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 건설 결정
 */
export function decideBuildTrack(state: GameState, playerId: PlayerId): TrackBuildDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'skip' };

  // 이미 이번 턴 트랙 건설 완료 확인
  if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
    console.log(`[AI 트랙] ${player.name}: 이번 턴 건설 완료`);
    return { action: 'skip' };
  }

  // 현금이 최소 비용보다 적으면 스킵
  if (player.cash < GAME_CONSTANTS.PLAIN_TRACK_COST) {
    console.log(`[AI 트랙] ${player.name}: 현금 부족 ($${player.cash})`);
    return { action: 'skip' };
  }

  // 전략이 없거나 재평가 필요시 (상대 트랙, 물품 변화 고려)
  if (!hasSelectedStrategy(playerId)) {
    console.log(`[AI 트랙] ${player.name}: 전략 없음 - 초기화 및 평가 중...`);
  }
  // 항상 재평가하여 상대 트랙/물품 상황 반영
  reevaluateStrategy(state, playerId);

  // 전략 및 목표 경로 가져오기 (순서 중요: getNextTargetRoute가 전략 변경 가능)
  const targetRoute = getNextTargetRoute(state, playerId);
  const strategy = getSelectedStrategy(playerId);  // 변경된 전략 가져옴
  const strategyName = strategy?.nameKo ?? '없음';

  // 목표 경로가 없으면 (모든 경로 완성 또는 물품 없음) 건설 스킵
  if (!targetRoute) {
    console.log(`[AI 트랙] ${player.name}: 목표 경로 없음 (모든 경로 완성/물품 없음) - 건설 스킵`);
    return { action: 'skip' };
  }

  // 건설 가능한 후보 탐색
  const candidates = findBuildCandidates(state, playerId, targetRoute);

  if (candidates.length === 0) {
    console.log(`[AI 트랙] ${player.name}: 건설 가능한 위치 없음`);
    return { action: 'skip' };
  }

  // 총점 (기본 점수 + 경로 점수 × 2) 기준으로 정렬
  candidates.sort((a, b) => {
    const aTotalScore = a.score + a.routeScore * 2;
    const bTotalScore = b.score + b.routeScore * 2;
    const aValue = aTotalScore / Math.max(a.cost, 1);
    const bValue = bTotalScore / Math.max(b.cost, 1);
    return bValue - aValue;
  });

  // 최선의 후보 선택
  const best = candidates[0];

  // 현금이 충분한지 최종 확인
  if (player.cash < best.cost) {
    // 더 저렴한 옵션 찾기
    const affordable = candidates.filter(c => c.cost <= player.cash);
    if (affordable.length === 0) {
      console.log(`[AI 트랙] ${player.name}: 현금 부족 (최선 $${best.cost}, 보유 $${player.cash})`);
      return { action: 'skip' };
    }
    const cheapBest = affordable[0];
    console.log(`[AI 트랙] ${player.name}: 건설 (${cheapBest.coord.col},${cheapBest.coord.row}) edges=[${cheapBest.edges}] $${cheapBest.cost} (전략=${strategyName})`);
    return { action: 'build', coord: cheapBest.coord, edges: cheapBest.edges };
  }

  const totalScore = best.score + best.routeScore * 2;
  const routeInfo = targetRoute ? `${targetRoute.from}→${targetRoute.to}` : '없음';
  console.log(`[AI 트랙] ${player.name}: 건설 (${best.coord.col},${best.coord.row}) edges=[${best.edges}] $${best.cost} 총점=${totalScore.toFixed(1)} (전략=${strategyName}, 경로=${routeInfo})`);

  return { action: 'build', coord: best.coord, edges: best.edges };
}

/**
 * 건설 가능한 모든 후보 위치 탐색
 */
function findBuildCandidates(
  state: GameState,
  playerId: PlayerId,
  targetRoute: DeliveryRoute | null
): BuildCandidate[] {
  const { board } = state;
  const candidates: BuildCandidate[] = [];

  const hasExistingTrack = playerHasTrack(board, playerId);

  if (!hasExistingTrack) {
    // 첫 트랙: 목표 경로의 출발지 도시에서 시작
    // targetRoute가 있으면 해당 출발지 도시에서만, 없으면 모든 도시에서
    let startCities = board.cities;

    if (targetRoute) {
      const fromCity = board.cities.find(c => c.id === targetRoute.from);
      if (fromCity) {
        startCities = [fromCity];
        console.log(`[AI 트랙] 첫 트랙: ${targetRoute.from} 도시에서 시작`);
      }
    }

    for (const city of startCities) {
      const neighbors = getBuildableNeighbors(city.coord, board, playerId);

      for (const neighbor of neighbors) {
        const exitDirs = getExitDirections(neighbor.coord, neighbor.targetEdge, board);

        for (const exitDir of exitDirs) {
          const edges: [number, number] = [neighbor.targetEdge, exitDir.exitEdge];

          if (!validateFirstTrackRule(neighbor.coord, edges, board)) continue;

          const cost = getTerrainCost(neighbor.coord, board);
          const score = evaluateTrackPosition(state, neighbor.coord, playerId);

          // 전략 경로 점수 계산 (엣지 방향 포함)
          let routeScore = 0;
          if (targetRoute) {
            routeScore = evaluateTrackForRoute(neighbor.coord, targetRoute, board, playerId, edges);
          }

          candidates.push({
            coord: neighbor.coord,
            edges,
            score,
            cost,
            routeScore,
          });
        }
      }
    }
  } else {
    // 후속 트랙: 플레이어 소유 트랙의 끝에서만 확장
    // 도시는 connectionPoints에서 제외 - 트랙 좌표만 사용
    // 이렇게 해야 AI가 기존 트랙에서 연속적으로 확장함
    const connectionPoints: HexCoord[] = [];

    // 플레이어 소유 트랙만 연결점으로 추가 (도시는 첫 트랙에서만 사용)
    for (const track of board.trackTiles) {
      if (track.owner === playerId) {
        connectionPoints.push(track.coord);
      }
    }

    // 주의: 도시를 connectionPoints에 추가하지 않음!
    // 도시에서 새로 시작하면 기존 트랙과 연결되지 않은 곳에 건설할 수 있음
    // AI는 기존 트랙 네트워크에서만 확장해야 함

    for (const point of connectionPoints) {
      if (!isValidConnectionPoint(point, board, playerId)) continue;

      const neighbors = getBuildableNeighbors(point, board, playerId);

      for (const neighbor of neighbors) {
        const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor.coord));
        if (existingTrack) continue;

        const exitDirs = getExitDirections(neighbor.coord, neighbor.targetEdge, board);

        for (const exitDir of exitDirs) {
          const edges: [number, number] = [neighbor.targetEdge, exitDir.exitEdge];

          if (!validateTrackConnection(neighbor.coord, edges, board, playerId)) continue;

          const cost = getTerrainCost(neighbor.coord, board);
          const score = evaluateTrackPosition(state, neighbor.coord, playerId);

          // 전략 경로 점수 계산 (엣지 방향 포함)
          let routeScore = 0;
          if (targetRoute) {
            routeScore = evaluateTrackForRoute(neighbor.coord, targetRoute, board, playerId, edges);
          }

          // 중복 제거
          const isDuplicate = candidates.some(
            c => hexCoordsEqual(c.coord, neighbor.coord) &&
                 c.edges[0] === edges[0] && c.edges[1] === edges[1]
          );
          if (!isDuplicate) {
            candidates.push({
              coord: neighbor.coord,
              edges,
              score,
              cost,
              routeScore,
            });
          }
        }
      }
    }

    // 기존 트랙에서 후보가 없으면 경로상 모든 도시에서 새 경로 시작 시도
    if (candidates.length === 0 && targetRoute) {
      console.log(`[AI 트랙] 기존 트랙에서 확장 불가 - 경로상 도시에서 새 경로 시작 시도`);

      // 목표 경로의 출발/도착 도시 + 중간 도시 모두 고려
      const intermediateCities = getIntermediateCities(targetRoute, board);
      const allRouteCities = [targetRoute.from, ...intermediateCities, targetRoute.to];

      // AI가 연결된 도시들을 먼저 시도
      const connectedCities = getConnectedCities(state, playerId);
      const sortedCities = allRouteCities.sort((a, b) => {
        const aConnected = connectedCities.includes(a) ? 0 : 1;
        const bConnected = connectedCities.includes(b) ? 0 : 1;
        return aConnected - bConnected;
      });

      console.log(`[AI 트랙] 경로상 도시: [${allRouteCities.join(', ')}], 연결된 도시 우선: [${sortedCities.join(', ')}]`);

      for (const cityId of sortedCities) {
        const city = board.cities.find(c => c.id === cityId);
        if (!city) continue;

        const neighbors = getBuildableNeighbors(city.coord, board, playerId);

        for (const neighbor of neighbors) {
          // 이미 트랙이 있는 곳은 제외
          const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor.coord));
          if (existingTrack) continue;

          const exitDirs = getExitDirections(neighbor.coord, neighbor.targetEdge, board);

          for (const exitDir of exitDirs) {
            const edges: [number, number] = [neighbor.targetEdge, exitDir.exitEdge];

            if (!validateFirstTrackRule(neighbor.coord, edges, board)) continue;

            const cost = getTerrainCost(neighbor.coord, board);
            const score = evaluateTrackPosition(state, neighbor.coord, playerId);
            const routeScore = evaluateTrackForRoute(neighbor.coord, targetRoute, board, playerId, edges);

            // 최소 점수 임계값: 경로와 무관한 후보 제외 (26점 같은 낮은 점수 방지)
            const MIN_FALLBACK_ROUTE_SCORE = 50;
            if (routeScore < MIN_FALLBACK_ROUTE_SCORE) {
              console.log(`[AI 트랙] 폴백 후보 제외: (${neighbor.coord.col},${neighbor.coord.row}) edges=[${edges}] routeScore=${routeScore} < ${MIN_FALLBACK_ROUTE_SCORE}`);
              continue;
            }

            // 연결된 도시에서 시작하면 보너스
            const connectionBonus = connectedCities.includes(cityId) ? 50 : 0;

            // 중복 제거
            const isDuplicate = candidates.some(
              c => hexCoordsEqual(c.coord, neighbor.coord) &&
                   c.edges[0] === edges[0] && c.edges[1] === edges[1]
            );
            if (!isDuplicate) {
              candidates.push({
                coord: neighbor.coord,
                edges,
                score: score + connectionBonus,
                cost,
                routeScore,
              });
            }
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * 지형에 따른 건설 비용
 */
function getTerrainCost(coord: HexCoord, board: { hexTiles: { coord: HexCoord; terrain: string }[] }): number {
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (!hexTile) return GAME_CONSTANTS.PLAIN_TRACK_COST;

  switch (hexTile.terrain) {
    case 'river':
      return GAME_CONSTANTS.RIVER_TRACK_COST;
    case 'mountain':
      return GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
    default:
      return GAME_CONSTANTS.PLAIN_TRACK_COST;
  }
}
