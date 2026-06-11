/**
 * Phase II: 경매 입찰 전략 (ΔVP 기반)
 *
 * 1등 순서의 가치(firstSeatVP)를 ΔVP로 산정하고, λ(현금의 VP 가치)로
 * 달러 상한으로 환산해 입찰한다.
 *
 *  - 경합 배달이 있으면: 배달 선점 가치
 *  - 내 경로의 미건설 헥스가 경합이면: 건설 선점 가치
 *  - 그 외: 행동 선택 우선권의 소액 가치
 *
 * 경합이 없으면 maxBid가 0~1로 떨어져 자연스럽게 일찍 포기한다
 * (2인전 규칙상 첫 포기는 무료 — 무리한 입찰보다 유리).
 * 건설 예산과 운영비는 절대 침범하지 않는다.
 */

import { GameState, PlayerId } from '@/types/game';
import { ensureTurnPlan } from '../strategy/turnPlan';
import { hasContestedDelivery, hasContestedBuildHex } from './selectAction';
import {
  cashToVPRate,
  opponentWeight,
  VP_PER_INCOME,
  LAMBDA_BASE,
} from '../strategy/vp';
import { debugLog } from '@/utils/debugConfig';

export type AuctionDecision =
  | { action: 'bid'; amount: number }
  | { action: 'pass' }
  | { action: 'skip' } // Turn Order 패스 사용
  | { action: 'complete' }; // 경매 완료 (혼자 남음)

/**
 * 경매 입찰 결정
 */
export function decideAuctionBid(state: GameState, playerId: PlayerId): AuctionDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'pass' };

  const auction = state.auction;

  // 경매 완료 조건 체크 - 혼자 남았으면 경매 완료
  if (auction) {
    const activePlayers = state.playerOrder.filter(p => !auction.passedPlayers.includes(p));
    if (activePlayers.length <= 1) {
      debugLog.preparation(`[Phase II: 경매] ${player.name}: 경매 완료 대기 (혼자 남음)`);
      return { action: 'complete' };
    }
  }

  // === 1등 순서의 가치 → 달러 상한 환산 ===
  const plan = ensureTurnPlan(state, playerId);
  const firstSeatVP = estimateFirstSeatVP(state, playerId);
  const lambda = cashToVPRate(state, playerId) || LAMBDA_BASE;

  // 자금 상한: 건설 예산 + 운영비는 절대 침범 금지
  const expenses = player.issuedShares + player.engineLevel;
  const cashCeiling = Math.max(0, player.cash - plan.buildBudget - expenses);
  const maxBid = Math.min(Math.floor(firstSeatVP / lambda), cashCeiling);

  // 경매가 시작되지 않았으면 가치가 있을 때만 $1로 시작
  if (!auction) {
    if (maxBid >= 1 && player.cash >= 1) {
      debugLog.preparation(`[Phase II: 경매] ${player.name}: 경매 시작 $1 (1등 가치 ${firstSeatVP.toFixed(1)}VP → 상한 $${maxBid})`);
      return { action: 'bid', amount: 1 };
    }
    debugLog.preparation(`[Phase II: 경매] ${player.name}: 1등 가치 낮음 (${firstSeatVP.toFixed(1)}VP) → 포기`);
    return { action: 'pass' };
  }

  const currentBid = auction.highestBid;

  // Turn Order 행동: 입찰 상한을 넘어선 경합에서 무료 잔류 패스 사용
  if (player.selectedAction === 'turnOrder' && !player.turnOrderPassUsed && currentBid >= maxBid) {
    debugLog.preparation(`[Phase II: 경매] ${player.name}: Turn Order 스킵 사용 (현재 $${currentBid} >= 상한 $${maxBid})`);
    return { action: 'skip' };
  }

  // 상한 도달 → 포기 (첫 포기는 무료)
  if (currentBid >= maxBid) {
    debugLog.preparation(`[Phase II: 경매] ${player.name}: 포기 (현재 $${currentBid} >= 상한 $${maxBid}, 1등 가치 ${firstSeatVP.toFixed(1)}VP)`);
    return { action: 'pass' };
  }

  const bidAmount = currentBid + 1;
  debugLog.preparation(`[Phase II: 경매] ${player.name}: 입찰 $${bidAmount} (상한 $${maxBid})`);
  return { action: 'bid', amount: bidAmount };
}

/**
 * 1등 순서의 ΔVP 추정
 */
function estimateFirstSeatVP(state: GameState, playerId: PlayerId): number {
  const plan = ensureTurnPlan(state, playerId);

  // 행동 선택 우선권 기본 가치 (원하는 행동을 선점당하지 않음)
  let vp = 0.3;

  // 경합 배달: 먼저 움직여 내 income 보호 + 상대 차단
  if (hasContestedDelivery(state, playerId)) {
    vp += VP_PER_INCOME * (1 + opponentWeight(state)) / 4;
  }

  // 경합 건설 헥스: 먼저 지어 우회 비용 회피
  if (hasContestedBuildHex(state, playerId, plan)) {
    vp += 2 * LAMBDA_BASE;
  }

  return vp;
}
