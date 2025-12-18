/**
 * Phase V: 물품 이동 전략
 *
 * AI가 선택한 전략에 따라 어떤 물품을 어디로 이동할지 결정합니다.
 */

import { GameState, PlayerId, HexCoord, CubeColor, City, GAME_CONSTANTS } from '@/types/game';
import { evaluateMoveValue } from '../evaluator';
import { findReachableDestinations, findLongestPath, hexCoordsEqual } from '@/utils/hexGrid';
import { getSelectedStrategy } from '../strategy/state';
import { getNextTargetRoute } from '../strategy/selector';

export type MoveGoodsDecision =
  | { action: 'move'; sourceCityId: string; cubeIndex: number; destinationCoord: HexCoord; cubeColor: CubeColor }
  | { action: 'upgradeEngine' }
  | { action: 'skip' };

interface MoveCandidate {
  sourceCityId: string;
  cubeIndex: number;
  cubeColor: CubeColor;
  destinationCoord: HexCoord;
  destinationCityId: string;
  path: HexCoord[];
  score: number;
  linksCount: number;
  routeScore: number;  // 전략 경로 점수
}

/**
 * 물품 이동 결정
 *
 * 전략:
 * 1. 선택된 전략의 targetRoutes 확인
 * 2. 이동 가능한 모든 물품-목적지 조합 탐색
 * 3. 전략 경로에 해당하는 이동에 높은 점수 부여
 * 4. 자신의 트랙을 많이 사용하는 이동 우선
 * 5. 이동 불가 시 엔진 업그레이드 고려
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 이동 결정
 */
export function decideMoveGoods(state: GameState, playerId: PlayerId): MoveGoodsDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'skip' };

  // 이미 이동했는지 확인
  if (state.phaseState.playerMoves[playerId]) {
    console.log(`[AI 물품] ${player.name}: 이번 라운드 이동 완료`);
    return { action: 'skip' };
  }

  // 전략 및 목표 경로 가져오기
  const strategy = getSelectedStrategy(playerId);
  const targetRoute = getNextTargetRoute(state, playerId);
  const strategyName = strategy?.nameKo ?? '없음';

  const { board } = state;
  const candidates: MoveCandidate[] = [];

  // 모든 도시의 모든 큐브에 대해 이동 가능 여부 확인
  for (const city of board.cities) {
    for (let cubeIndex = 0; cubeIndex < city.cubes.length; cubeIndex++) {
      const cubeColor = city.cubes[cubeIndex];

      // 도달 가능한 목적지 찾기
      const reachable = findReachableDestinations(
        city.coord,
        board,
        playerId,
        player.engineLevel,
        cubeColor
      );

      for (const destCity of reachable) {
        // 경로 찾기
        const path = findLongestPath(
          city.coord,
          destCity.coord,
          board,
          playerId,
          player.engineLevel,
          cubeColor
        );

        if (!path || path.length < 2) continue;

        // 링크 수 계산 (경로 길이 - 1이 대략적인 링크 수)
        const linksCount = calculateLinksInPath(path, board, playerId);

        // 자신의 트랙 사용 여부
        const usesOwnTracks = linksCount > 0;

        // 기본 점수 계산
        const score = evaluateMoveValue(linksCount, usesOwnTracks);

        // 전략 경로 점수 계산
        let routeScore = 0;
        if (strategy && targetRoute) {
          // 전략 경로와 정확히 일치하면 높은 점수
          if (city.id === targetRoute.from && destCity.id === targetRoute.to) {
            routeScore = 30;  // 최우선
          }
          // 출발지 또는 목적지만 일치하면 중간 점수
          else if (city.id === targetRoute.from || destCity.id === targetRoute.to) {
            routeScore = 15;
          }
          // 전략의 모든 targetRoutes와 비교
          else if (strategy.targetRoutes.some(r =>
            (r.from === city.id && r.to === destCity.id) ||
            (r.from === city.id) ||
            (r.to === destCity.id)
          )) {
            routeScore = 10;
          }
        }

        candidates.push({
          sourceCityId: city.id,
          cubeIndex,
          cubeColor,
          destinationCoord: destCity.coord,
          destinationCityId: destCity.id,
          path,
          score,
          linksCount,
          routeScore,
        });
      }
    }
  }

  // 이동 가능한 후보가 없으면 엔진 업그레이드 고려
  if (candidates.length === 0) {
    if (player.engineLevel < GAME_CONSTANTS.MAX_ENGINE) {
      console.log(`[AI 물품] ${player.name}: 엔진 업그레이드 (${player.engineLevel} → ${player.engineLevel + 1})`);
      return { action: 'upgradeEngine' };
    }
    console.log(`[AI 물품] ${player.name}: 이동 불가, 스킵`);
    return { action: 'skip' };
  }

  // 총점 (기본 점수 + 경로 점수) 기준으로 정렬
  candidates.sort((a, b) => {
    const aTotalScore = a.score + a.routeScore;
    const bTotalScore = b.score + b.routeScore;
    return bTotalScore - aTotalScore;
  });

  const best = candidates[0];
  const totalScore = best.score + best.routeScore;
  const routeInfo = targetRoute ? `${targetRoute.from}→${targetRoute.to}` : '없음';

  console.log(`[AI 물품] ${player.name}: ${best.cubeColor} 물품 이동 (${best.sourceCityId} → ${best.destinationCityId}), ${best.linksCount} 링크, 총점=${totalScore.toFixed(1)} (전략=${strategyName}, 경로=${routeInfo})`);

  return {
    action: 'move',
    sourceCityId: best.sourceCityId,
    cubeIndex: best.cubeIndex,
    destinationCoord: best.destinationCoord,
    cubeColor: best.cubeColor,
  };
}

/**
 * 경로에서 플레이어 소유 링크 수 계산
 */
function calculateLinksInPath(
  path: HexCoord[],
  board: { trackTiles: { coord: HexCoord; owner: PlayerId | null }[]; cities: City[]; towns: { coord: HexCoord }[] },
  playerId: PlayerId
): number {
  let linkCount = 0;
  const { cities, towns, trackTiles } = board;

  // 링크별로 계산 (도시/마을 → 다음 도시/마을 = 1 링크)
  let linkStartIndex = 0;

  for (let i = 1; i < path.length; i++) {
    const coord = path[i];
    const isCity = cities.some(c => hexCoordsEqual(c.coord, coord));
    const isTown = towns.some(t => hexCoordsEqual(t.coord, coord));

    if (isCity || isTown) {
      // 이 링크 구간의 트랙 소유자 확인
      for (let j = linkStartIndex + 1; j < i; j++) {
        const track = trackTiles.find(t => hexCoordsEqual(t.coord, path[j]));
        if (track?.owner === playerId) {
          linkCount++;
          break; // 링크당 한 번만
        }
      }
      linkStartIndex = i;
    }
  }

  return linkCount;
}
