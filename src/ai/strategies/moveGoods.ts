/**
 * Phase V: 물품 이동 전략
 *
 * AI가 선택한 전략에 따라 어떤 물품을 어디로 이동할지 결정합니다.
 */

import { GameState, PlayerId, HexCoord, CubeColor, City } from '@/types/game';
import { evaluateMoveValue } from '../evaluator';
import { findReachableDestinations, findLongestPath, hexCoordsEqual } from '@/utils/hexGrid';
import { getSelectedStrategy } from '../strategy/state';
import { getNextTargetRoute } from '../strategy/selector';
import { debugLog } from '@/utils/debugConfig';

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
  ownTrackCount: number; // 자신의 트랙이 포함된 링크 수
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
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 이번 라운드 이동 완료`);
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

        // 링크 수 및 내 트랙 수 계산
        const linksCount = countTotalLinksInPath(path, board);
        const ownTrackCount = countOwnLinksInPath(path, board, playerId);

        // 자신의 트랙 사용 여부
        const usesOwnTracks = ownTrackCount > 0;

        // 기본 점수 계산 (전체 링크 수 기반 수익 평가)
        const score = evaluateMoveValue(linksCount, usesOwnTracks);

        // [추가] 내 트랙 점유율 보너스 (동일 수익일 때 내 트랙 더 많이 쓰기)
        const trackDensityBonus = ownTrackCount * 2;

        // 전략 경로 점수 계산
        let routeScore = 0;
        if (strategy && targetRoute) {
          // 전략 경로와 정확히 일치하면 점수 추가
          if (city.id === targetRoute.from && destCity.id === targetRoute.to) {
            routeScore = 12;
          }
          // 출발지 또는 목적지만 일치하면
          else if (city.id === targetRoute.from || destCity.id === targetRoute.to) {
            routeScore = 6;
          }
          // 전략의 모든 targetRoutes와 비교
          else if (strategy.targetRoutes.some(r =>
            (r.from === city.id && r.to === destCity.id) ||
            (r.from === city.id) ||
            (r.to === destCity.id)
          )) {
            routeScore = 4;
          }
        }

        candidates.push({
          sourceCityId: city.id,
          cubeIndex,
          cubeColor,
          destinationCoord: destCity.coord,
          destinationCityId: destCity.id,
          path,
          score: score + trackDensityBonus,
          linksCount,
          ownTrackCount,
          routeScore,
        });
      }
    }
  }

  // 이동 가능한 후보가 없으면 엔진 업그레이드 고려
  const AI_MAX_ENGINE_LEVEL = 3;
  if (candidates.length === 0) {
    if (player.engineLevel < AI_MAX_ENGINE_LEVEL) {
      debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 엔진 업그레이드 (${player.engineLevel} → ${player.engineLevel + 1})`);
      return { action: 'upgradeEngine' };
    }
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 이동 불가, 스킵`);
    return { action: 'skip' };
  }

  // 총점 기준으로 정렬
  candidates.sort((a, b) => {
    const aTotalScore = a.score + a.routeScore;
    const bTotalScore = b.score + b.routeScore;
    return bTotalScore - aTotalScore;
  });

  const best = candidates[0];
  const totalScore = best.score + best.routeScore;
  const routeInfo = targetRoute ? `${targetRoute.from}→${targetRoute.to}` : '없음';

  debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: ${best.cubeColor} 물품 이동 (${best.sourceCityId} → ${best.destinationCityId}), 링크=${best.linksCount}(내쪽=${best.ownTrackCount}), 총점=${totalScore.toFixed(1)}`);

  return {
    action: 'move',
    sourceCityId: best.sourceCityId,
    cubeIndex: best.cubeIndex,
    destinationCoord: best.destinationCoord,
    cubeColor: best.cubeColor,
  };
}

/**
 * 경로에서 전체 링크 수 계산 (도시/마을 → 도시/마을 사이의 구간 수)
 */
function countTotalLinksInPath(path: HexCoord[], board: { cities: City[]; towns: { coord: HexCoord }[] }): number {
  let links = 0;
  for (let i = 1; i < path.length; i++) {
    const coord = path[i];
    if (board.cities.some(c => hexCoordsEqual(c.coord, coord)) ||
      board.towns.some(t => hexCoordsEqual(t.coord, coord))) {
      links++;
    }
  }
  return links;
}

/**
 * 경로에서 플레이어 소유 트랙이 포함된 링크 수 계산
 */
function countOwnLinksInPath(
  path: HexCoord[],
  board: { trackTiles: { coord: HexCoord; owner: PlayerId | null }[]; cities: City[]; towns: { coord: HexCoord }[] },
  playerId: PlayerId
): number {
  let ownLinks = 0;
  let currentLinkHasOwnTrack = false;

  for (let i = 1; i < path.length; i++) {
    const coord = path[i];
    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));

    if (track?.owner === playerId) {
      currentLinkHasOwnTrack = true;
    }

    const isStop = board.cities.some(c => hexCoordsEqual(c.coord, coord)) ||
      board.towns.some(t => hexCoordsEqual(t.coord, coord));

    if (isStop) {
      if (currentLinkHasOwnTrack) {
        ownLinks++;
      }
      currentLinkHasOwnTrack = false;
    }
  }

  return ownLinks;
}
