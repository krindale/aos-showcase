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
import { rankActionsByDeltaVP, hasContestedDelivery } from './selectAction';
import {
  cashToVPRate,
  firstSeatBidCeiling,
  LAMBDA_BASE,
  VP_PER_INCOME,
  opponentWeight,
  AUCTION_PERSONALITIES,
  personalityRankBidBonus,
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
    const activePlayers = state.playerOrder.filter(p => !auction.droppedOutPlayers.includes(p));
    if (activePlayers.length <= 1) {
      debugLog.preparation(`[Phase II: 경매] ${player.name}: 경매 완료 대기 (혼자 남음)`);
      return { action: 'complete' };
    }
  }

  // === 1등 순서의 가치(절실함) → 달러 상한 환산 ===
  const profile = getMapProfile(state.mapId);
  const plan = ensureTurnPlan(state, playerId);
  // 봇별 경매 성격 (미지정 = standard = 기존 산식과 비트 동일 — vp.ts AUCTION_PERSONALITIES 주석 참조)
  const pers = AUCTION_PERSONALITIES[player.auctionPersonality ?? 'standard'];
  // 절실함 배수는 캐시 밖에서 곱한다 — desperationCache는 성격 무관 원값을 저장(decideTurnOrderOffer와 공유)
  const desperation = estimateFirstSeatVP(state, playerId, pers.denialValue) * pers.desperationMult;
  const lambda = cashToVPRate(state, playerId) || LAMBDA_BASE;

  // 자금 상한: 건설 예산 + 운영비는 절대 침범 금지 (파산 방지 안전판)
  const expenses = player.issuedShares + player.engineLevel + (player.dgel ?? 0); // DGEL 포함 (payExpenses와 동일)
  // 운영비 income 상계(aiAuctionExpensesNetOfIncome, 기본 true — 2026-08-08 전 맵 승격):
  // 수입 수집(VI)이 비용 지불(VII)에 선행하므로 income 충당분까지 현금 예비하면 이중 계상
  // → maxBid 영구 $0 = 경매 상시 패스. 붕괴 맵만 프로파일에서 false로 격리.
  const expenseNeed = profile.aiAuctionExpensesNetOfIncome
    ? Math.max(0, expenses - player.income)
    : expenses;
  const cashCeiling = Math.max(0, player.cash - plan.buildBudget - expenseNeed);
  // 뒤 순번 1번 입찰 보너스 — 맵 훅(Western US)과 성격(wuType) 중 **max 하나만** 적용
  // (중복 가산 금지 — 과거 견제+보너스 중첩 붕괴(승자편차 11→21) 재발 방지).
  const rank = state.playerOrder.indexOf(playerId);
  const persRankBonus = pers.rankBidBonus
    ? personalityRankBidBonus(rank, state.activePlayers.length)
    : 0;
  const seatBonus = Math.max(
    profile.firstSeatRankBidBonus(rank, state.activePlayers.length),
    persRankBonus,
  );
  const baseCeiling = Math.min(firstSeatBidCeiling(desperation, lambda, pers.bid), cashCeiling);
  // 보너스는 cashCeiling(건설예산 보호) 밖에서 더하되, 보유 현금은 넘지 않게 가드(파산 방지).
  const maxBid = Math.min(baseCeiling + seatBonus, Math.max(0, player.cash - expenseNeed));

  // 행동권 확보 참여(Montréal, aiAuctionAlwaysParticipate — 사용자 지시 2026-07-25):
  // 무입찰 패스는 행동 밴이므로, "이번 턴 내 최선 행동의 ΔVP"가 입찰비(달러→VP 환산)보다
  // 클 때만 최소 금액으로 입찰 기록을 남긴다 — 1등 경쟁이 아니라 행동권 보험.
  // (입찰 후 첫 포기는 무료 룰이라 실비용은 0~입찰액 절반 수준)
  const joinForAction = profile.aiAuctionAlwaysParticipate;
  const myBidSoFar = auction?.bids?.[playerId] ?? 0;
  const cashAfterExpenses = Math.max(0, player.cash - expenseNeed);
  /** 이번 턴 내가 고를 수 있는 최선 행동의 ΔVP (밴당하면 잃는 가치) */
  const bestActionVP = joinForAction
    ? (rankActionsByDeltaVP(state, playerId, plan)[0]?.deltaVP ?? 0)
    : 0;
  const actionJoinWorth = (amount: number): boolean =>
    joinForAction && myBidSoFar === 0 && cashAfterExpenses >= amount &&
    bestActionVP > amount * lambda;

  // 경매가 시작되지 않았으면 가치가 있을 때만 $1로 시작 (행동권 가치가 있으면 참여).
  // 견제형(openBidAlways)은 절실함이 없어도 $1 오프닝 — 상대가 공짜($1)로 선공을 가져가지
  // 못하게 존재감을 만든다 (05i 보류 카드 "최소 견제 입찰"의 봇 성격 격리 재도입).
  if (!auction) {
    if ((maxBid >= 1 || actionJoinWorth(1) || pers.openBidAlways) && player.cash >= 1 && cashAfterExpenses >= 1) {
      debugLog.preparation(`[Phase II: 경매] ${player.name}: 경매 시작 $1 (절실함 ${desperation.toFixed(1)}VP, 최선행동 ${bestActionVP.toFixed(1)}VP)`);
      return { action: 'bid', amount: 1 };
    }
    debugLog.preparation(`[Phase II: 경매] ${player.name}: 절실한 행동 없음 (${desperation.toFixed(1)}VP) → 양보`);
    return { action: 'pass' };
  }

  const currentBid = auction.highestBid;

  // 행동권 보험 입찰: 아직 무입찰인데 포기하게 될 상황이면, 행동 가치가 비용을 넘을 때만 기록
  if (currentBid >= maxBid && actionJoinWorth(currentBid + 1)) {
    debugLog.preparation(`[Phase II: 경매] ${player.name}: 행동권 입찰 $${currentBid + 1} (최선행동 ${bestActionVP.toFixed(1)}VP > 비용)`);
    return { action: 'bid', amount: currentBid + 1 };
  }

  // Turn Order 패스 보유: 입찰 상한을 넘어선 경합에서 무료 잔류 패스 사용
  // (권한은 직전 턴 turnOrder 선택으로 부여된 turnOrderPassAvailable — selectedAction은 롤오버 때 지워짐)
  if (player.turnOrderPassAvailable && !player.turnOrderPassUsed && currentBid >= maxBid) {
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
  const expenses = player.issuedShares + player.engineLevel + (player.dgel ?? 0); // DGEL 포함 (payExpenses와 동일)
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
 * 절실함 턴 캐시 — 경매는 입찰 결정마다 rankActionsByDeltaVP 전체(evaluateFirstMove의
 * hasContestedDelivery DFS 스캔 포함)를 재계산했지만, 입찰 중에는 보드·행동 가용성·현금·
 * TurnPlan이 전부 불변이라(지불은 경매 해소 시) 값이 같다 → 플레이어당 턴 1회만 계산.
 *
 * base = 내 절실함(+맵 훅 경합 수송 가치), oppDenial = 상대 저지 가치(비싼 상대 계획 계산이라
 * **필요한 첫 호출에서만 지연 계산** — 맵 훅 또는 견제 성격이 요구할 때). 둘을 분리 저장하는
 * 이유: 견제 성격 봇과 표준 봇이 같은 캐시를 쓰므로, 합산값을 저장하면 성격이 캐시를 오염시킨다
 * (decideTurnOrderOffer는 맵 훅 기준만 봐야 함 — St.Lucia 기존 동작 보존).
 */
const desperationCache: Map<PlayerId, { turn: number; base: number; oppDenial?: number }> = new Map();

/** 게임 리셋 시 캐시 초기화 (이전 게임의 같은 턴 키 충돌 방지) */
export function clearDesperationCache(): void {
  desperationCache.clear();
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
 *
 * 상대 저지 가치(aiAuctionDenialValue, Scotland): 제로섬에 가까운 소인원전에선 "상대가 1등을
 * 먹으면 얻는 이득"을 막는 것도 내 이득 — 가장 절실한 상대의 (최선 − 차선) ÷ 상대 수를 합산.
 * 상대 격차가 클 때만 발동하는 가치 기반 견제라, 순번 기반 고정 가산(구 firstSeatRankBidBonus,
 * cityCubes 맵 붕괴)과 달리 맹목적으로 예산을 태우지 않는다.
 */
function estimateFirstSeatVP(
  state: GameState,
  playerId: PlayerId,
  personalityDenial: boolean = false,
): number {
  const profile = getMapProfile(state.mapId);
  // 상대 저지 가치를 합산할지 — 맵 훅(Scotland) OR 견제 성격(denial). 둘 다면 한 번만(중복 가산 없음).
  const wantDenial = profile.aiAuctionDenialValue || personalityDenial;

  const gapFor = (pid: PlayerId): number => {
    const plan = ensureTurnPlan(state, pid);
    const ranked = rankActionsByDeltaVP(state, pid, plan)
      .filter(r => r.action !== 'turnOrder');
    const v1 = ranked[0]?.deltaVP ?? 0;
    const v2 = ranked[1]?.deltaVP ?? 0;
    return Math.max(0, v1 - v2);
  };

  let entry = desperationCache.get(playerId);
  if (!entry || entry.turn !== state.currentTurn) {
    let base = gapFor(playerId);

    // 경합 수송 선순위 가치 (Scotland, aiAuctionContestedMoveVP — 훅 주석 참조): 1등 좌석은
    // 행동 선택권에 더해 수송 선순위도 얻는다 — 서로 노리는 큐브가 있을 때만 그 가치를 합산.
    // base는 evaluateFirstMove의 경합 선점 가치와 동일 산식 (income 1 스윙의 절반 수준).
    if (profile.aiAuctionContestedMoveVP > 0 && hasContestedDelivery(state, playerId)) {
      const contestedBase = VP_PER_INCOME * (1 + opponentWeight(state)) / 4;
      base += contestedBase * profile.aiAuctionContestedMoveVP;
    }

    entry = { turn: state.currentTurn, base };
    desperationCache.set(playerId, entry);
  }

  // 상대 저지 가치는 비싸다(상대별 ensureTurnPlan + rankActionsByDeltaVP) — 요구하는 첫 호출에서만
  // 계산해 캐시에 메모(맵 훅이 꺼진 맵에선 견제 성격 봇이 있을 때만 비용 발생).
  if (wantDenial && entry.oppDenial === undefined) {
    // playerOrder는 파산자가 제외된 현재 순서 — 상대 격차는 상대의 계획/평가로 산정
    const opponents = state.playerOrder.filter(p => p !== playerId && state.players[p]);
    entry.oppDenial = opponents.length > 0
      ? Math.max(...opponents.map(gapFor)) / opponents.length
      : 0;
  }

  return entry.base + (wantDenial ? (entry.oppDenial ?? 0) : 0);
}
