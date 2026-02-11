/**
 * Phase I: 주식 발행 전략
 *
 * AI가 동적 화물 기반 전략에 따라 필요한 주식을 발행합니다.
 */

import { GameState, PlayerId, GAME_CONSTANTS } from '@/types/game';
import { calculateExpectedExpenses, calculateExpectedExpensesAfterIssue, calculateMinCashReserve } from '../evaluator';
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

  // 0-B. 총 주식 상한: 시작 2주 + 추가 최대 1주 = 총 3주 (VP -9 vs -12는 3점 차이)
  const maxTotalShares = 3;
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

      const neededTracks = Math.max(0, Math.min(distance, 3) - ownTracksOnPath); // 이번 턴 현실적 건설: 3개 (engineer 없으면 3개 상한)

      // 경로 주변 헥스 지형을 조회하여 실제 평균 비용 산출
      let terrainCostSum = 0;
      let terrainHexCount = 0;
      for (const hex of state.board.hexTiles) {
        const distToFrom = hexDistance(hex.coord, fromCity.coord);
        const distToTo = hexDistance(hex.coord, toCity.coord);
        // 경로 근처(출발-도착 사이)에 있는 헥스만 고려
        if (distToFrom + distToTo <= distance + 1 && distToFrom > 0 && distToTo > 0) {
          const isOwnTrack = state.board.trackTiles.some(
            t => t.owner === playerId && hexCoordsEqual(t.coord, hex.coord)
          );
          if (!isOwnTrack) {
            switch (hex.terrain) {
              case 'river': terrainCostSum += GAME_CONSTANTS.RIVER_TRACK_COST; break;
              case 'mountain': terrainCostSum += GAME_CONSTANTS.MOUNTAIN_TRACK_COST; break;
              case 'lake': break; // 건설 불가, 비용 계산 제외
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
    // 목표가 없어도 기본 건설 준비금 ($4 = 2개)
    trackBuildCost = 4;
  }

  // 2. 예상 운영 비용 계산 (주식 이자 + 엔진 유지비)
  const expectedExpenses = calculateExpectedExpenses(state, playerId);

  // 3. 경매 예비비 (턴 1은 절약, 이후 $2)
  const auctionReserve = state.currentTurn <= 1 ? 1 : 2;

  // 4. Pay Expenses 대비 현금 예비금 (수입 < 비용인 위험 상태에서만 적용)
  const expenseReserve = calculateMinCashReserve(state, playerId);

  // 총 예상 지출
  const totalExpectedCost = Math.ceil(trackBuildCost + expectedExpenses + auctionReserve + expenseReserve);

  // 현금 부족분 계산
  const shortage = Math.max(0, totalExpectedCost - player.cash);

  // 주식 1주당 $5
  const sharesNeeded = Math.ceil(shortage / GAME_CONSTANTS.SHARE_VALUE);

  // 최대 발행 가능 주식 확인 (룰상 최대 15주)
  const maxPossibleShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;

  // === 생존 판단 (먼저 계산) ===
  // 생존 = 경매/건설 없이도 비용을 지불할 수 있는지 (경매 불참으로 비용 0 가능)
  // 경매비를 포함하면 불필요하게 생존 위기로 판단하여 과잉 주식 발행
  const currentExpenses = player.issuedShares + player.engineLevel;
  const canSurviveTurn = player.cash + Math.max(0, player.income) >= currentExpenses;

  // 모든 턴에서 전략적 발행은 1주로 제한 (VP -3 영구 페널티 최소화)
  // 생존 위기일 때만 예외적으로 2주 허용
  let maxStrategicShares = 1;
  if (!canSurviveTurn && player.cash < expectedExpenses) {
    maxStrategicShares = 2;
    debugLog.preparation(
      `[Phase I: 주식 발행] ${player.name}: 생존 위기 → 최대 2주 허용`
    );
  }

  // 필요한 만큼만 발행
  let sharesToIssue = Math.min(sharesNeeded, maxPossibleShares, maxStrategicShares);
  if (!canSurviveTurn && sharesToIssue === 0 && maxPossibleShares > 0) {
    sharesToIssue = 1;
    debugLog.preparation(
      `[Phase I: 주식 발행] ${player.name}: 생존 위기! cash $${player.cash} + income ${player.income} < expenses $${currentExpenses} → 긴급 1주 발행`
    );
  }

  // === 파산 방지 검사: 발행 후 비용이 수입을 과도하게 초과하면 감소 ===
  // 단, 감소하면 이번 턴을 못 버티는 경우에는 감소하지 않음 (생존 우선)
  // Turn 1도 필요할 때만 발행 (무조건 보장 안함 — $10으로 충분히 건설 가능)
  const minimumGuaranteed = 0;
  while (sharesToIssue > Math.max(minimumGuaranteed, canSurviveTurn ? 0 : 1)) {
    const futureExpenses = calculateExpectedExpensesAfterIssue(state, playerId, sharesToIssue);
    const futureIncome = player.income;

    // safetyMargin: 턴 1은 투자 필요하므로 약간 관대, 이후는 엄격
    const safetyMargin = state.currentTurn <= 1 ? 3 : 2;
    if (futureExpenses > futureIncome + safetyMargin) {
      // 감소하기 전: 감소하면 이번 턴을 버틸 수 있는지 확인
      const cashIfReduced = player.cash + (sharesToIssue - 1) * GAME_CONSTANTS.SHARE_VALUE;
      const expIfReduced = (player.issuedShares + sharesToIssue - 1) + player.engineLevel;
      if (cashIfReduced - auctionReserve + futureIncome < expIfReduced) {
        // 감소하면 이번 턴 현금 부족 → 감소 중단 (생존 우선)
        debugLog.preparation(
          `[Phase I: 주식 발행] ${player.name}: 감소하면 턴 생존 불가 → ${sharesToIssue}주 유지`
        );
        break;
      }
      sharesToIssue--;
      debugLog.preparation(
        `[Phase I: 주식 발행] ${player.name}: 파산 위험! 비용 $${futureExpenses} > 수입 $${futureIncome}+${safetyMargin} - 발행량 감소`
      );
    } else {
      break;
    }
  }

  const routeStr = currentRoute ? `${currentRoute.from}→${currentRoute.to}` : '없음';
  debugLog.preparation(
    `[Phase I: 주식 발행] ${player.name}: 경로=${routeStr}, 예상건설비 $${trackBuildCost.toFixed(1)}, 예상유지비 $${expectedExpenses}, 경매예비비 $${auctionReserve}, 비용예비금 $${expenseReserve}, 현금 $${player.cash} -> 발행 ${sharesToIssue}주`
  );

  return sharesToIssue;
}
