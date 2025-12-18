/**
 * Phase II: 경매 입찰 전략
 *
 * AI가 플레이어 순서 경매에서 입찰 또는 포기를 결정합니다.
 */

import { GameState, PlayerId } from '@/types/game';

export type AuctionDecision =
  | { action: 'bid'; amount: number }
  | { action: 'pass' }
  | { action: 'skip' } // Turn Order 패스 사용
  | { action: 'complete' }; // 경매 완료 (혼자 남음)

/**
 * 경매 입찰 결정
 *
 * 전략:
 * 1. 현금의 일정 비율 이하로만 입찰
 * 2. 첫 번째 순서의 가치 평가 (트랙 건설, 물품 이동 우선권)
 * 3. Turn Order 행동 선택 시 패스 활용
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 경매 결정
 */
export function decideAuctionBid(state: GameState, playerId: PlayerId): AuctionDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'pass' };

  const auction = state.auction;

  // 경매가 시작되지 않았으면 $1로 시작
  if (!auction) {
    // 현금이 충분하면 $1로 시작
    if (player.cash >= 1) {
      console.log(`[AI 경매] ${player.name}: 경매 시작 $1`);
      return { action: 'bid', amount: 1 };
    }
    return { action: 'pass' };
  }

  // 경매 완료 조건 체크 - 혼자 남았으면 경매 완료
  const activePlayers = state.playerOrder.filter(p => !auction.passedPlayers.includes(p));
  if (activePlayers.length <= 1) {
    console.log(`[AI 경매] ${player.name}: 경매 완료 대기 (혼자 남음)`);
    // 'complete' 액션으로 executeAITurn에서 resolveAuction 호출하도록 함
    return { action: 'complete' } as AuctionDecision;
  }

  const currentBid = auction.highestBid;

  // 최대 입찰 가능 금액 (현금의 30%)
  const maxBid = Math.floor(player.cash * 0.3);

  // Turn Order 행동을 선택했고 아직 패스를 사용하지 않았으면 패스 사용
  if (player.selectedAction === 'turnOrder' && !player.turnOrderPassUsed) {
    // 현재 입찰이 높으면 스킵
    if (currentBid >= maxBid * 0.5) {
      console.log(`[AI 경매] ${player.name}: Turn Order 스킵 사용`);
      return { action: 'skip' };
    }
  }

  // 현재 입찰보다 높게 입찰할 수 없으면 포기
  if (currentBid >= maxBid) {
    console.log(`[AI 경매] ${player.name}: 포기 (현재 $${currentBid} >= 최대 $${maxBid})`);
    return { action: 'pass' };
  }

  // 입찰 금액 결정 (현재 입찰 + 1)
  const bidAmount = currentBid + 1;

  console.log(`[AI 경매] ${player.name}: 입찰 $${bidAmount}`);
  return { action: 'bid', amount: bidAmount };
}
