/**
 * Phase II: 경매 입찰 전략 (액션 절실함 기반)
 *
 * 1등 순서의 가치 = "이번 턴 가장 절실한 행동을 남에게 뺏기지 않고 선점하는 가치".
 * 절실함 = (내 최선 행동 ΔVP − 차선 행동 ΔVP) 로 산정하고, firstSeatBidCeiling으로
 * 달러 상한($3~5, 안 절실하면 $0~1)으로 환산해 입찰한다.
 *
 * "절실할 때만 적극" 정책 → 평범한 턴엔 모두 양보하므로 경매 규칙상 순서가
 * 자연 역전되어 순환한다. 계속 뒤로 밀리는 플레이어는 selectAction의 Turn Order
 * 행동(순번 기반 가치)으로 순서를 탈환한다 — 인위적 순번 보정 없이 골고루 순환.
 * 건설 예산과 운영비는 절대 침범하지 않는다(파산 방지).
 */

import { GameState, PlayerId } from '@/types/game';
import { ensureTurnPlan } from '../strategy/turnPlan';
import { rankActionsByDeltaVP } from './selectAction';
import {
  cashToVPRate,
  firstSeatBidCeiling,
  LAMBDA_BASE,
} from '../strategy/vp';
import { getMapProfile } from '@/maps/getMapProfile';
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

  // === 1등 순서의 가치(절실함) → 달러 상한 환산 ===
  const plan = ensureTurnPlan(state, playerId);
  const desperation = estimateFirstSeatVP(state, playerId);
  const lambda = cashToVPRate(state, playerId) || LAMBDA_BASE;

  // 자금 상한: 건설 예산 + 운영비는 절대 침범 금지 (파산 방지 안전판)
  const expenses = player.issuedShares + player.engineLevel;
  const cashCeiling = Math.max(0, player.cash - plan.buildBudget - expenses);
  // 뒤 순번 1번 입찰 보너스(맵별 격리, Western US) — 평범한 턴에 뒤 순번이 1번을 따내 순서 순환 유도.
  const rank = state.playerOrder.indexOf(playerId);
  const seatBonus = getMapProfile(state.mapId).firstSeatRankBidBonus(rank, state.activePlayers.length);
  const baseCeiling = Math.min(firstSeatBidCeiling(desperation, lambda), cashCeiling);
  // 보너스는 cashCeiling(건설예산 보호) 밖에서 더하되, 보유 현금은 넘지 않게 가드(파산 방지).
  const maxBid = Math.min(baseCeiling + seatBonus, Math.max(0, player.cash - expenses));

  // 경매가 시작되지 않았으면 가치가 있을 때만 $1로 시작
  if (!auction) {
    if (maxBid >= 1 && player.cash >= 1) {
      debugLog.preparation(`[Phase II: 경매] ${player.name}: 경매 시작 $1 (절실함 ${desperation.toFixed(1)}VP → 상한 $${maxBid})`);
      return { action: 'bid', amount: 1 };
    }
    debugLog.preparation(`[Phase II: 경매] ${player.name}: 절실한 행동 없음 (${desperation.toFixed(1)}VP) → 양보`);
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
    debugLog.preparation(`[Phase II: 경매] ${player.name}: 포기 (현재 $${currentBid} >= 상한 $${maxBid}, 절실함 ${desperation.toFixed(1)}VP)`);
    return { action: 'pass' };
  }

  const bidAmount = currentBid + 1;
  debugLog.preparation(`[Phase II: 경매] ${player.name}: 입찰 $${bidAmount} (상한 $${maxBid})`);
  return { action: 'bid', amount: bidAmount };
}

/**
 * 교대 선공권 결정 (alternateTurnOrder 맵 전용, 예: St. Lucia)
 *
 * 경매와 동일한 가치 모델을 재사용: 1등 순서의 ΔVP를 달러로 환산한 상한이
 * 선공 비용(firstSeatCost) 이상이고 자금 여유가 있으면 수락.
 */
export function decideTurnOrderOffer(
  state: GameState,
  playerId: PlayerId,
  firstSeatCost: number
): boolean {
  const player = state.players[playerId];
  if (!player) return false;

  const plan = ensureTurnPlan(state, playerId);
  const desperation = estimateFirstSeatVP(state, playerId);
  const lambda = cashToVPRate(state, playerId) || LAMBDA_BASE;

  // 자금 상한: 건설 예산 + 운영비는 절대 침범 금지
  const expenses = player.issuedShares + player.engineLevel;
  const cashCeiling = Math.max(0, player.cash - plan.buildBudget - expenses);
  // 교대 선공권(St. Lucia)은 매 턴 firstSeatCost($5)를 내는 구조라, 1회성 경매용 firstSeatBidCeiling
  // ($3~5 바닥)을 쓰면 과지불→파산(조기 종료)한다. 바닥 없는 직접 환산(floor(절실함/λ))으로 보수적
  // 평가 — 절실함이 비용을 명백히 넘을 때만 수락(원래 St. Lucia는 선공권을 보통 거절하는 게 최적).
  const maxPay = Math.min(Math.floor(desperation / lambda), cashCeiling);

  const accept = maxPay >= firstSeatCost;
  debugLog.preparation(
    `[Phase II: 선공권] ${player.name}: ${accept ? '수락' : '거절'} ` +
    `(절실함 ${desperation.toFixed(1)}VP → 상한 $${maxPay}, 비용 $${firstSeatCost})`
  );
  return accept;
}

/**
 * 1등 순서의 가치 = 이번 턴 가장 절실한 행동을 선점하는 가치 (절실함).
 *
 * 절실함 = (내 최선 행동 ΔVP − 차선 행동 ΔVP). 1등이 되어 최선 행동을 잡지 못하면
 * 차선 행동으로 떨어지는 손실이며, 이것이 곧 1등 순서의 한계가치다.
 * 각 행동 ΔVP는 그 플레이어의 현금·엔진·네트워크·목표경로(TurnPlan)를 반영하므로
 * "자기 상황에서 무엇이 절실한지"가 그대로 입찰가에 반영된다.
 *
 * turnOrder 행동은 "순서 자체의 가치"라 1등 선점 평가에서 제외한다
 * (순번 탈환은 행동 선택 Phase에서 별도로 다룬다).
 */
function estimateFirstSeatVP(state: GameState, playerId: PlayerId): number {
  const plan = ensureTurnPlan(state, playerId);
  const ranked = rankActionsByDeltaVP(state, playerId, plan)
    .filter(r => r.action !== 'turnOrder');

  const v1 = ranked[0]?.deltaVP ?? 0;
  const v2 = ranked[1]?.deltaVP ?? 0;
  return Math.max(0, v1 - v2);
}
