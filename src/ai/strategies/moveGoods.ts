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
import { getConnectedCities } from '../strategy/analyzer';
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
  // strategyName은 디버그용으로 필요시 활성화
  void strategy; // lint 경고 방지

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

        // [추가] 상대가 이 화물을 배달할 수 있는지 확인 (가로채기 위험)
        let stealRiskBonus = 0;
        const opponents = state.activePlayers.filter(id => id !== playerId);
        for (const oppId of opponents) {
          const oppPlayer = state.players[oppId];
          if (!oppPlayer) continue;
          const oppReachable = findReachableDestinations(
            city.coord, board, oppId, oppPlayer.engineLevel, cubeColor
          );
          if (oppReachable.some(d => hexCoordsEqual(d.coord, destCity.coord))) {
            // 상대도 배달 가능 → 가로채기 위험, 이 화물을 먼저 배달해야 함
            // 링크가 길수록 가로채기 손실이 크므로 링크 수 비례 보너스
            stealRiskBonus = linksCount * 10;
            break;
          }
        }

        // 전략 경로 점수 계산 (수입보다 영향이 작도록 축소)
        let routeScore = 0;
        if (strategy && targetRoute) {
          // 전략 경로와 정확히 일치하면 점수 추가
          if (city.id === targetRoute.from && destCity.id === targetRoute.to) {
            routeScore = 5;
          }
          // 출발지 또는 목적지만 일치하면
          else if (city.id === targetRoute.from || destCity.id === targetRoute.to) {
            routeScore = 3;
          }
          // 전략의 모든 targetRoutes와 비교
          else if (strategy.targetRoutes.some(r =>
            (r.from === city.id && r.to === destCity.id) ||
            (r.from === city.id) ||
            (r.to === destCity.id)
          )) {
            routeScore = 1;
          }
        }

        candidates.push({
          sourceCityId: city.id,
          cubeIndex,
          cubeColor,
          destinationCoord: destCity.coord,
          destinationCityId: destCity.id,
          path,
          score: score + trackDensityBonus + stealRiskBonus,
          linksCount,
          ownTrackCount,
          routeScore,
        });
      }
    }
  }

  // 선제적 엔진 업그레이드: 1링크만 가능할 때 엔진 올려 2링크 해금
  if (candidates.length > 0 && player.engineLevel < 3) {
    const bestCurrentLinks = Math.max(...candidates.map(c => c.linksCount));
    if (bestCurrentLinks <= 1) {
      // 엔진+1로 2링크 이상 배달 가능한지 확인
      let hasLongerDelivery = false;
      for (const city of board.cities) {
        if (hasLongerDelivery) break;
        for (let ci = 0; ci < city.cubes.length; ci++) {
          const cubeColor = city.cubes[ci];
          const reachable = findReachableDestinations(
            city.coord, board, playerId, player.engineLevel + 1, cubeColor
          );
          for (const destCity of reachable) {
            const path = findLongestPath(city.coord, destCity.coord, board, playerId, player.engineLevel + 1, cubeColor);
            if (path && path.length >= 2) {
              const links = countTotalLinksInPath(path, board);
              if (links >= 2) { hasLongerDelivery = true; break; }
            }
          }
          if (hasLongerDelivery) break;
        }
      }
      if (hasLongerDelivery) {
        const connectedCities = getConnectedCities(state, playerId);
        const hasCompletedLinks = connectedCities.length >= 2;
        const remainingTurns = state.maxTurns - state.currentTurn;
        if (hasCompletedLinks && remainingTurns >= 1) {
          const futureExpenses = player.issuedShares + (player.engineLevel + 1);
          if (futureExpenses <= Math.max(0, player.income) + remainingTurns) {
            debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 선제적 엔진 업그레이드 (${player.engineLevel}→${player.engineLevel + 1}), 2링크 배달 해금`);
            return { action: 'upgradeEngine' };
          }
        }
      }
    }
  }

  // 이동 가능한 후보가 없으면 엔진 업그레이드 고려
  if (candidates.length === 0) {
    // 엔진 업그레이드 조건:
    // 1. 엔진 3 미만 허용 (tutorial max)
    // 2. 완성된 링크 있어야 (배달 가능 상태)
    // 3. 마지막 턴 아닐 때 (업그레이드 비용 회수 불가)
    // 4. 비용 감당 가능 (futureExpenses <= income + 여유분)
    //    남은 턴이 많을수록 관대하게 (투자 회수 기간)
    const connectedCities = getConnectedCities(state, playerId);
    const hasCompletedLinks = connectedCities.length >= 2;
    const remainingTurns = state.maxTurns - state.currentTurn;
    if (player.engineLevel < 3 &&
        hasCompletedLinks &&
        remainingTurns >= 2) {
      const futureExpenses = player.issuedShares + (player.engineLevel + 1);
      const safetyMargin = remainingTurns; // 남은 턴이 많을수록 관대
      if (futureExpenses <= Math.max(0, player.income) + safetyMargin) {
        debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 배달 불가 → 엔진 업그레이드 (${player.engineLevel}→${player.engineLevel + 1}), 비용=${futureExpenses} ≤ 수입=${player.income}+${safetyMargin}`);
        return { action: 'upgradeEngine' };
      }
    }
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 이동 불가, 스킵 (엔진=${player.engineLevel})`);
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
