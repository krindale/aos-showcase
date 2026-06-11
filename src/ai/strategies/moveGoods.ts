/**
 * Phase V: 물품 이동 전략 (ΔVP 기반)
 *
 * 모든 선택지(배달 / 엔진 업그레이드 / 스킵)를 "예상 VP 증분(ΔVP)" 단위로
 * 평가해 최대값을 선택합니다.
 *
 *  - 배달: deliveryDeltaVP = 내 링크 income VP + 잔여턴 현금흐름 − 상대 링크 페널티
 *  - 엔진 업그레이드: 해금되는 배달의 ΔVP × 실현확률 − 매턴 비용
 *  - 어느 쪽도 양수가 아니면 스킵 (상대만 이득인 배달은 하지 않음)
 */

import { GameState, PlayerId, HexCoord, CubeColor, City } from '@/types/game';
import { findReachableDestinations, findLongestPath, hexCoordsEqual } from '@/utils/hexGrid';
import { getSelectedStrategy } from '../strategy/state';
import { getNextTargetRoute } from '../strategy/selector';
import { getConnectedCities } from '../strategy/analyzer';
import { getMapAIConfig } from '../strategy/mapConfig';
import {
  deliveryDeltaVP,
  engineUpgradeDeltaVP,
  opponentWeight,
  VP_PER_INCOME,
  SAME_TURN_DELIVERY_DISCOUNT,
  FUTURE_DELIVERY_DISCOUNT,
} from '../strategy/vp';
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
  deltaVP: number;     // 배달의 ΔVP (선점 보너스 포함)
  routeScore: number;  // 전략 경로 일치 tie-break (ΔVP 대비 소액)
  linksCount: number;
  ownTrackCount: number;
}

/**
 * 물품 이동 결정
 */
export function decideMoveGoods(state: GameState, playerId: PlayerId): MoveGoodsDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'skip' };

  // 이미 이동했는지 확인
  if (state.phaseState.playerMoves[playerId]) {
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 이번 라운드 이동 완료`);
    return { action: 'skip' };
  }

  // 전략 및 목표 경로 가져오기 (tie-break용)
  const strategy = getSelectedStrategy(playerId);
  const targetRoute = getNextTargetRoute(state, playerId);

  const { board } = state;
  const candidates: MoveCandidate[] = [];

  // 모든 도시의 모든 큐브에 대해 이동 가능 여부 확인
  for (const city of board.cities) {
    for (let cubeIndex = 0; cubeIndex < city.cubes.length; cubeIndex++) {
      const cubeColor = city.cubes[cubeIndex];

      const reachable = findReachableDestinations(
        city.coord,
        board,
        playerId,
        player.engineLevel,
        cubeColor
      );

      for (const destCity of reachable) {
        const path = findLongestPath(
          city.coord,
          destCity.coord,
          board,
          playerId,
          player.engineLevel,
          cubeColor
        );

        if (!path || path.length < 2) continue;

        const linksCount = countTotalLinksInPath(path, board);
        const ownTrackCount = countOwnLinksInPath(path, board, playerId);

        // 배달의 기본 ΔVP (내 income VP + 현금흐름 − 상대 income 페널티)
        let deltaVP = deliveryDeltaVP(state, playerId, ownTrackCount, linksCount - ownTrackCount);

        // 선점 보너스: 상대도 같은 배달이 가능하면, 내가 먼저 옮겨 상대의 income 기회를 차단
        // (차단 가치 ≈ 상대 income +1을 막음 = VP_PER_INCOME × 상대 가중치)
        const opponents = state.activePlayers.filter(id => id !== playerId);
        for (const oppId of opponents) {
          const oppPlayer = state.players[oppId];
          if (!oppPlayer || oppPlayer.eliminated) continue;
          const oppReachable = findReachableDestinations(
            city.coord, board, oppId, oppPlayer.engineLevel, cubeColor
          );
          if (oppReachable.some(d => hexCoordsEqual(d.coord, destCity.coord))) {
            deltaVP += VP_PER_INCOME * opponentWeight(state);
            break;
          }
        }

        // 전략 경로 일치 tie-break (ΔVP 스케일 대비 소액: 동점일 때 계획 경로 우선)
        let routeScore = 0;
        if (strategy && targetRoute) {
          if (city.id === targetRoute.from && destCity.id === targetRoute.to) {
            routeScore = 0.5;
          } else if (city.id === targetRoute.from || destCity.id === targetRoute.to) {
            routeScore = 0.3;
          } else if (strategy.targetRoutes.some(r =>
            (r.from === city.id && r.to === destCity.id) ||
            (r.from === city.id) ||
            (r.to === destCity.id)
          )) {
            routeScore = 0.1;
          }
        }

        candidates.push({
          sourceCityId: city.id,
          cubeIndex,
          cubeColor,
          destinationCoord: destCity.coord,
          destinationCityId: destCity.id,
          path,
          deltaVP,
          routeScore,
          linksCount,
          ownTrackCount,
        });
      }
    }
  }

  // 총 ΔVP 기준 정렬
  candidates.sort((a, b) => (b.deltaVP + b.routeScore) - (a.deltaVP + a.routeScore));
  const best = candidates.length > 0 ? candidates[0] : null;
  const bestMoveVP = best ? best.deltaVP + best.routeScore : -Infinity;

  // 엔진 업그레이드 옵션을 동일 단위(ΔVP)로 평가
  const upgradeVP = evaluateEngineUpgradeOption(state, playerId);

  debugLog.goodsMovement(
    `[Phase V: 물품 이동] ${player.name}: 옵션 비교 — 배달 ΔVP=${bestMoveVP === -Infinity ? '없음' : bestMoveVP.toFixed(2)}, 업그레이드 ΔVP=${upgradeVP === -Infinity ? '불가' : upgradeVP.toFixed(2)}`
  );

  // 최대 ΔVP 선택: 배달 vs 업그레이드 vs 스킵(0)
  if (upgradeVP > bestMoveVP && upgradeVP > 0) {
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 엔진 업그레이드 (${player.engineLevel}→${player.engineLevel + 1}), ΔVP=${upgradeVP.toFixed(2)}`);
    return { action: 'upgradeEngine' };
  }

  if (best && bestMoveVP > 0) {
    debugLog.goodsMovement(
      `[Phase V: 물품 이동] ${player.name}: ${best.cubeColor} 물품 이동 (${best.sourceCityId} → ${best.destinationCityId}), 링크=${best.linksCount}(내쪽=${best.ownTrackCount}), ΔVP=${bestMoveVP.toFixed(2)}`
    );
    return {
      action: 'move',
      sourceCityId: best.sourceCityId,
      cubeIndex: best.cubeIndex,
      destinationCoord: best.destinationCoord,
      cubeColor: best.cubeColor,
    };
  }

  debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 양수 ΔVP 옵션 없음 → 스킵 (엔진=${player.engineLevel})`);
  return { action: 'skip' };
}

/**
 * 엔진 업그레이드 옵션의 ΔVP 평가
 *
 * 업그레이드로 "해금되는" 배달(현재 엔진으로는 불가능한 링크 수)의 가치를
 * 실현 확률로 할인하고 매턴 비용을 차감한다.
 */
function evaluateEngineUpgradeOption(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return -Infinity;

  const config = getMapAIConfig(state);

  // 엔진 상한 도달 / 이번 턴 locomotive로 이미 업그레이드함
  if (player.engineLevel >= config.engineMax) return -Infinity;
  if (player.selectedAction === 'locomotive') return -Infinity;

  // 완성된 링크(연결 네트워크)가 없으면 업그레이드는 시기상조
  const connectedCities = getConnectedCities(state, playerId);
  if (connectedCities.length < 2) return -Infinity;

  const round = state.phaseState.moveGoodsRound;
  const remainingTurns = config.totalTurns - state.currentTurn;

  // round 2의 업그레이드는 다음 턴에야 실현 → 마지막 턴이면 가치 없음
  if (round !== 1 && remainingTurns < 1) return -Infinity;
  const prob = round === 1 ? SAME_TURN_DELIVERY_DISCOUNT : FUTURE_DELIVERY_DISCOUNT;

  // 엔진+1로 해금되는 최선의 자기 트랙 배달 탐색
  const bestUnlocked = findBestUnlockedDelivery(state, playerId, player.engineLevel + 1);

  if (bestUnlocked) {
    const unlockedVP = deliveryDeltaVP(
      state, playerId, bestUnlocked.ownLinks, bestUnlocked.totalLinks - bestUnlocked.ownLinks
    );
    return engineUpgradeDeltaVP(state, playerId, unlockedVP, prob);
  }

  // 해금 배달이 없어도, 보드에 화물이 전혀 없으면 다음 턴 물품 성장을 기대
  const totalCubes = state.board.cities.reduce((sum, c) => sum + c.cubes.length, 0);
  if (totalCubes === 0 && remainingTurns >= 1) {
    // 보수적 기대: 1링크 배달, 불확실성 추가 할인
    const expectedVP = deliveryDeltaVP(state, playerId, 1, 0);
    return engineUpgradeDeltaVP(state, playerId, expectedVP, FUTURE_DELIVERY_DISCOUNT * 0.5);
  }

  return -Infinity;
}

/**
 * 지정 엔진 레벨에서 가능한 배달 중, 현재 엔진으로는 불가능한(해금되는)
 * 자기 트랙 포함 최선 배달 탐색
 */
function findBestUnlockedDelivery(
  state: GameState,
  playerId: PlayerId,
  engineLevel: number,
): { ownLinks: number; totalLinks: number } | null {
  const player = state.players[playerId];
  if (!player) return null;

  const { board } = state;
  let bestValue = -Infinity;
  let best: { ownLinks: number; totalLinks: number } | null = null;

  for (const city of board.cities) {
    for (let ci = 0; ci < city.cubes.length; ci++) {
      const cubeColor = city.cubes[ci];
      const reachable = findReachableDestinations(city.coord, board, playerId, engineLevel, cubeColor);

      for (const destCity of reachable) {
        const path = findLongestPath(city.coord, destCity.coord, board, playerId, engineLevel, cubeColor);
        if (!path || path.length < 2) continue;

        const totalLinks = countTotalLinksInPath(path, board);
        const ownLinks = countOwnLinksInPath(path, board, playerId);

        // 현재 엔진으로도 가능한 배달은 "해금"이 아님
        if (totalLinks <= player.engineLevel) continue;
        // 내 income이 없는 배달은 업그레이드 근거가 안 됨
        if (ownLinks < 1) continue;

        const value = deliveryDeltaVP(state, playerId, ownLinks, totalLinks - ownLinks);
        if (value > bestValue) {
          bestValue = value;
          best = { ownLinks, totalLinks };
        }
      }
    }
  }

  return best;
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
