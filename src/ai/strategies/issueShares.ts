/**
 * Phase I: 주식 발행 전략
 *
 * AI가 동적 화물 기반 전략에 따라 필요한 주식을 발행합니다.
 */

import { GameState, PlayerId, GAME_CONSTANTS } from '@/types/game';
import { calculateExpectedExpenses, calculateMinCashReserve } from '../evaluator';
import { getCurrentRoute } from '../strategy/state';
import { debugLog } from '@/utils/debugConfig';
import { hexDistance, hexCoordsEqual } from '@/utils/hexGrid';

/**
 * 주식 발행량 결정
 *
 * 전략:
 * 1. 현재 목표 경로 기반으로 예상 트랙 비용 계산
 * 2. 지형 정보를 고려하여 가중치 적용
 * 3. 이번 턴 예상 비용 계산 (유지비)
 * 4. 경매를 위한 최소 예비비 확보
 * 5. 현금이 부족하면 필요한 만큼만 발행
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 발행할 주식 수 (0 이상)
 */
export function decideSharesIssue(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;

  // 0-A. 마지막 턴: 건설 VP 회수 불가, 주식 -3 VP만 남음 → 생존 위기 아니면 발행 금지
  if (state.currentTurn >= state.maxTurns) {
    const expenses = player.issuedShares + player.engineLevel;
    const canSurvive = player.cash + Math.max(0, player.income) >= expenses;
    if (canSurvive) {
      debugLog.preparation(`[Phase I: 주식 발행] ${player.name}: 마지막 턴, 생존 가능 → 발행 안함`);
      return 0;
    }
  }

  // 0-B. 총 주식 상한: 시작 2주 + 추가 최대 3주 = 총 5주
  // 초반에 현금이 필요하므로 상한을 여유있게 설정
  const maxTotalShares = 5;
  if (player.issuedShares >= maxTotalShares) {
    const expenses = player.issuedShares + player.engineLevel;
    const canSurvive = player.cash + Math.max(0, player.income) >= expenses;
    if (canSurvive) {
      debugLog.preparation(`[Phase I: 주식 발행] ${player.name}: 총 주식 상한(${maxTotalShares}주) 도달, 발행 안함`);
      return 0;
    }
  }

  // 1. 현재 목표 경로 가져오기
  const currentRoute = getCurrentRoute(playerId);
  let trackBuildCost = 0;

  if (currentRoute) {
    // 목표 도시들 찾기
    const fromCity = state.board.cities.find(c => c.id === currentRoute.from);
    const toCity = state.board.cities.find(c => c.id === currentRoute.to);

    if (fromCity && toCity) {
      // 헥스 간 직선 거리 계산
      const distance = hexDistance(fromCity.coord, toCity.coord);
      // 이미 지어진 내 트랙 개수 제외 (대략적)
      const ownTracksOnPath = state.board.trackTiles.filter(t =>
        t.owner === playerId &&
        hexDistance(t.coord, fromCity.coord) < distance
      ).length;

      const neededTracks = Math.min(Math.max(0, distance - ownTracksOnPath), 3);

      // 경로 주변 헥스 지형을 조회하여 실제 평균 비용 산출
      let terrainCostSum = 0;
      let terrainHexCount = 0;
      for (const hex of state.board.hexTiles) {
        const distToFrom = hexDistance(hex.coord, fromCity.coord);
        const distToTo = hexDistance(hex.coord, toCity.coord);
        if (distToFrom + distToTo <= distance + 1 && distToFrom > 0 && distToTo > 0) {
          const isOwnTrack = state.board.trackTiles.some(
            t => t.owner === playerId && hexCoordsEqual(t.coord, hex.coord)
          );
          if (!isOwnTrack) {
            switch (hex.terrain) {
              case 'river': terrainCostSum += GAME_CONSTANTS.RIVER_TRACK_COST; break;
              case 'mountain': terrainCostSum += GAME_CONSTANTS.MOUNTAIN_TRACK_COST; break;
              case 'lake': break;
              default: terrainCostSum += GAME_CONSTANTS.PLAIN_TRACK_COST; break;
            }
            terrainHexCount++;
          }
        }
      }
      const avgTerrainCost = terrainHexCount > 0
        ? terrainCostSum / terrainHexCount
        : GAME_CONSTANTS.PLAIN_TRACK_COST;
      trackBuildCost = neededTracks * avgTerrainCost;
    }
  } else {
    // 목표가 없어도 기본 건설 준비금
    trackBuildCost = 4;
  }

  // 2. 예상 운영 비용 계산 (주식 이자 + 엔진 유지비)
  const expectedExpenses = calculateExpectedExpenses(state, playerId);

  // 3. 경매 예비비 (경쟁 입찰을 위해 $2 확보)
  const auctionReserve = 2;

  // 4. Pay Expenses 대비 현금 예비금
  const expenseReserve = calculateMinCashReserve(state, playerId);

  // 총 예상 지출
  const totalExpectedCost = Math.ceil(trackBuildCost + expectedExpenses + auctionReserve + expenseReserve);

  // 현금 부족분 계산
  const shortage = Math.max(0, totalExpectedCost - player.cash);

  // 주식 1주당 $5
  const sharesNeeded = Math.ceil(shortage / GAME_CONSTANTS.SHARE_VALUE);

  // 최대 발행 가능 주식 확인 (룰상 최대 15주)
  const maxPossibleShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;

  // === 생존 판단 ===
  const currentExpenses = player.issuedShares + player.engineLevel;
  const canSurviveTurn = player.cash + Math.max(0, player.income) >= currentExpenses;

  // 턴별 전략적 발행 상한:
  // - 마지막 턴: 생존 위기 아니면 0
  // - 마지막 전 턴: 최대 1주
  // - 초반/중반: 최대 2주 (충분한 현금 확보를 위해)
  let maxStrategicShares: number;
  if (state.currentTurn >= state.maxTurns) {
    maxStrategicShares = canSurviveTurn ? 0 : 1;
  } else if (state.currentTurn >= state.maxTurns - 1) {
    maxStrategicShares = 1;
  } else {
    maxStrategicShares = 2;
  }

  // 생존 위기일 때 추가 허용
  if (!canSurviveTurn && maxStrategicShares < 2) {
    maxStrategicShares = 2;
    debugLog.preparation(
      `[Phase I: 주식 발행] ${player.name}: 생존 위기 → 최대 2주 허용`
    );
  }

  // 필요한 만큼만 발행
  let sharesToIssue = Math.min(sharesNeeded, maxPossibleShares, maxStrategicShares);

  // 생존 위기 시 최소 1주 보장
  if (!canSurviveTurn && sharesToIssue === 0 && maxPossibleShares > 0) {
    sharesToIssue = 1;
    debugLog.preparation(
      `[Phase I: 주식 발행] ${player.name}: 생존 위기! cash $${player.cash} + income ${player.income} < expenses $${currentExpenses} → 긴급 1주 발행`
    );
  }

  // === 마지막 턴 전 파산 방지: 발행 후 비용이 수입을 크게 초과하면 감소 ===
  // 단, 초반(income=0)에는 적용하지 않음 — 트랙을 지어야 income이 생김
  // 예외: 건설 예산이 부족하여 주식 없이는 트랙을 지을 수 없고, 경로가 남아있으면 완화
  const cantAffordAnyTrack = player.cash < GAME_CONSTANTS.PLAIN_TRACK_COST + auctionReserve + expenseReserve;
  const needsBuildFunding = cantAffordAnyTrack && trackBuildCost > 0 && state.currentTurn < state.maxTurns;
  if (player.income > 0 && !needsBuildFunding) {
    while (sharesToIssue > (canSurviveTurn ? 0 : 1)) {
      const futureExpenses = (player.issuedShares + sharesToIssue) + player.engineLevel;
      const futureIncome = player.income;
      const safetyMargin = 1;
      if (futureExpenses > futureIncome + safetyMargin) {
        sharesToIssue--;
        debugLog.preparation(
          `[Phase I: 주식 발행] ${player.name}: 비용 초과! expenses $${futureExpenses} > income $${futureIncome}+${safetyMargin} → 발행량 감소`
        );
      } else {
        break;
      }
    }
  }

  // === 최종 보장: 매 턴 경매 시작 전 최소 $15 현금 확보 ===
  // 다른 제한(비용 초과 등)보다 우선하여 건설·경매 자금을 보장
  if (state.currentTurn < state.maxTurns) {
    const minStartCash = 15;
    const cashAfterIssue = player.cash + sharesToIssue * GAME_CONSTANTS.SHARE_VALUE;
    if (cashAfterIssue < minStartCash) {
      const additionalNeeded = Math.ceil((minStartCash - cashAfterIssue) / GAME_CONSTANTS.SHARE_VALUE);
      const newTotal = Math.min(sharesToIssue + additionalNeeded, maxPossibleShares);
      if (newTotal > sharesToIssue) {
        debugLog.preparation(
          `[Phase I: 주식 발행] ${player.name}: 최소 $${minStartCash} 보장 → ${newTotal}주 발행 (현금 $${player.cash})`
        );
        sharesToIssue = newTotal;
      }
    }
  }

  const routeStr = currentRoute ? `${currentRoute.from}→${currentRoute.to}` : '없음';
  debugLog.preparation(
    `[Phase I: 주식 발행] ${player.name}: 경로=${routeStr}, 예상건설비 $${trackBuildCost.toFixed(1)}, 예상유지비 $${expectedExpenses}, 경매예비비 $${auctionReserve}, 비용예비금 $${expenseReserve}, 현금 $${player.cash} -> 발행 ${sharesToIssue}주`
  );

  return sharesToIssue;
}
