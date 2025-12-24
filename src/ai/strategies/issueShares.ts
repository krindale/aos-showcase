/**
 * Phase I: 주식 발행 전략
 *
 * AI가 동적 화물 기반 전략에 따라 필요한 주식을 발행합니다.
 */

import { GameState, PlayerId, GAME_CONSTANTS } from '@/types/game';
import { calculateExpectedExpenses } from '../evaluator';
import { getCurrentRoute } from '../strategy/state';
import { debugLog } from '@/utils/debugConfig';
import { hexDistance } from '@/utils/hexGrid';

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

      const neededTracks = Math.max(0, Math.min(distance, 4) - ownTracksOnPath); // 이번 턴 최대 4개까지 건설 가능성 고려

      // 기본 비용 $2, 산/강이 섞여있을 수 있으므로 평균 $2.5로 계산
      trackBuildCost = neededTracks * 2.5;
    }
  } else {
    // 목표가 없어도 기본 건설 준비금 ($6 = 3개)
    trackBuildCost = 6;
  }

  // 2. 예상 운영 비용 계산 (주식 이자 + 엔진 유지비)
  const expectedExpenses = calculateExpectedExpenses(state, playerId);

  // 3. 경매 예비비 (순수하게 입찰을 위해 최소 $3~5 확보)
  const auctionReserve = 5;

  // 총 예상 지출
  const totalExpectedCost = Math.ceil(trackBuildCost + expectedExpenses + auctionReserve);

  // 현금 부족분 계산
  const shortage = Math.max(0, totalExpectedCost - player.cash);

  // 주식 1주당 $5
  const sharesNeeded = Math.ceil(shortage / GAME_CONSTANTS.SHARE_VALUE);

  // 최대 발행 가능 주식 확인 (룰상 최대 15주)
  const maxPossibleShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;

  // 이번 턴에 한꺼번에 너무 많이 발행하는 것은 위험 (감점 때문)
  // 하지만 돈이 없으면 아무것도 못하므로 필요량만큼은 발행하되, 무의미한 과발행은 방지
  const maxStrategicShares = 3;

  // 필요한 만큼만 발행
  const sharesToIssue = Math.min(sharesNeeded, maxPossibleShares, maxStrategicShares);

  const routeStr = currentRoute ? `${currentRoute.from}→${currentRoute.to}` : '없음';
  debugLog.preparation(
    `[Phase I: 주식 발행] ${player.name}: 경로=${routeStr}, 예상건설비 $${trackBuildCost}, 예상유지비 $${expectedExpenses}, 경매예비비 $${auctionReserve}, 현금 $${player.cash} -> 발행 ${sharesToIssue}주`
  );

  return sharesToIssue;
}
