/**
 * Phase I: 주식 발행 전략 (ΔVP 기반)
 *
 * 주식 1주 = 즉시 +$5, 영구 -3VP, 매턴 $1 비용.
 * "혹시 몰라서 발행"하지 않는다 — 턴 계획(TurnPlan)의 필요 현금에서
 * 부족한 만큼만, 그리고 그 발행이 실행 가능하게 하는 계획의 가치(enabledVP)가
 * 주식 비용을 넘을 때만 발행한다. 생존(파산 방지) 발행은 항상 우선.
 */

import { GameState, PlayerId, GAME_CONSTANTS } from '@/types/game';
import { ensureTurnPlan } from '../strategy/turnPlan';
import { getMapAIConfig } from '../strategy/mapConfig';
import { debugLog } from '@/utils/debugConfig';

/** 턴당 발행 상한 (과도한 영구 부채 방지) */
const MAX_SHARES_PER_TURN = 2;
/** 총 주식 안전망 (생존 발행은 예외) */
const MAX_TOTAL_SHARES = 5;

/**
 * 주식 발행량 결정
 */
export function decideSharesIssue(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;

  const config = getMapAIConfig(state);
  const maxPossibleShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;
  const isLastTurn = state.currentTurn >= config.totalTurns;

  // === 1. 생존 발행 (절대 우선): 이번 턴 비용을 못 내면 income이 깎이고 파산 위험 ===
  const expenses = player.issuedShares + player.engineLevel;
  const survivalShortage = Math.max(0, expenses - (player.cash + Math.max(0, player.income)));
  const survivalShares = Math.min(
    Math.ceil(survivalShortage / GAME_CONSTANTS.SHARE_VALUE),
    maxPossibleShares,
  );
  if (survivalShares > 0) {
    debugLog.preparation(
      `[Phase I: 주식 발행] ${player.name}: 생존 발행 ${survivalShares}주 (cash $${player.cash} + income ${player.income} < expenses $${expenses})`
    );
  }

  // === 2. 마지막 턴: 건설→VP 회수가 약하고 -3VP/주는 영구 → 생존 외 발행 금지 ===
  if (isLastTurn) {
    if (survivalShares === 0) {
      debugLog.preparation(`[Phase I: 주식 발행] ${player.name}: 마지막 턴, 생존 가능 → 발행 안함`);
    }
    return survivalShares;
  }

  // === 3. 계획 자금 부족분 계산 ===
  // plan.cashNeeded(이번 턴 건설 슬롯 + 운영비 + 예비금)는 이미 계획 기반으로
  // 보수적이므로, 부족분만큼 발행한다. "혹시 몰라서 발행"은 needed=0으로 차단됨.
  const plan = ensureTurnPlan(state, playerId);
  const needed = Math.max(0, plan.cashNeeded - player.cash);
  let planShares = Math.ceil(needed / GAME_CONSTANTS.SHARE_VALUE);

  if (planShares > 0 && !plan.targetRoute) {
    // 목표 경로가 전혀 없으면(지을 곳이 없으면) 발행 가치도 없음 — 운영비 부족분(생존)만
    planShares = 0;
    debugLog.preparation(`[Phase I: 주식 발행] ${player.name}: 목표 경로 없음 → 계획 발행 생략`);
  }

  // === 5. 상한 적용 ===
  // 턴당 상한 + 총 주식 안전망 (생존 발행은 안전망 무시).
  // trackCubes 맵: 누적 상한 없음 — 어떻게든 철도를 이어 지어 4-5링크 배달을 만든다(사용자 지침).
  // trackCubes: 상한 없음 — 수익 한 턴 못 내도 빚내서 하나의 긴 라인을 이어 짓는다(사용자 지침).
  const headroom = config.incomeSources.includes('trackCubes')
    ? maxPossibleShares
    : Math.max(0, MAX_TOTAL_SHARES - player.issuedShares);
  const sharesToIssue = Math.max(
    survivalShares,
    Math.min(planShares, MAX_SHARES_PER_TURN, headroom, maxPossibleShares),
  );

  const routeStr = plan.targetRoute ? `${plan.targetRoute.from}→${plan.targetRoute.to}` : '없음';
  debugLog.preparation(
    `[Phase I: 주식 발행] ${player.name}: 경로=${routeStr}, 필요현금 $${plan.cashNeeded}, 보유 $${player.cash}, 부족 $${needed} → 발행 ${sharesToIssue}주`
  );

  return sharesToIssue;
}

