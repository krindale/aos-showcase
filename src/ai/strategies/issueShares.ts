/**
 * Phase I: 주식 발행 전략
 *
 * AI가 동적 화물 기반 전략에 따라 필요한 주식을 발행합니다.
 */

import { GameState, PlayerId, GAME_CONSTANTS } from '@/types/game';
import { calculateExpectedExpenses } from '../evaluator';
import { getCurrentRoute } from '../strategy/state';

/**
 * 주식 발행량 결정
 *
 * 전략:
 * 1. 현재 목표 경로 기반으로 예상 트랙 비용 계산
 * 2. 이번 턴 예상 비용 계산 (비용 지불)
 * 3. 현금이 부족하면 필요한 만큼만 발행
 * 4. 주식은 나중에 -3점/주식이므로 최소한으로 발행
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 발행할 주식 수 (0 이상)
 */
export function decideSharesIssue(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;

  // 현재 목표 경로 가져오기
  const currentRoute = getCurrentRoute(playerId);

  // 동적 계산: 기본 트랙 건설 비용 (3개 트랙 × $2 = $6, 여유분 $3)
  const trackBuildCost = 9;

  // 예상 비용 계산 (주식 이자 + 엔진 유지비)
  const expectedExpenses = calculateExpectedExpenses(state, playerId);

  // 총 예상 지출
  const totalExpectedCost = expectedExpenses + trackBuildCost;

  // 현금 부족분 계산
  const shortage = Math.max(0, totalExpectedCost - player.cash);

  // 주식 1주당 $5
  const sharesNeeded = Math.ceil(shortage / GAME_CONSTANTS.SHARE_VALUE);

  // 최대 발행 가능 주식 확인
  const maxShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;

  // 보수적으로 최대 2주 발행 (주식은 -3점/주식이므로)
  const maxStrategicShares = 2;

  // 필요한 만큼만 발행
  const sharesToIssue = Math.min(sharesNeeded, maxShares, maxStrategicShares);

  const routeStr = currentRoute ? `${currentRoute.from}→${currentRoute.to}` : '없음';
  console.log(`[AI 주식] ${player.name}: 경로=${routeStr}, 예상비용 $${totalExpectedCost}, 현금 $${player.cash}, 발행 ${sharesToIssue}주`);

  return sharesToIssue;
}
