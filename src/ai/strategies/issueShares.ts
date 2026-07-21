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
import { getMapProfile } from '@/maps/getMapProfile';
import { debugLog } from '@/utils/debugConfig';

/** 턴당 발행 상한 (과도한 영구 부채 방지) */
const MAX_SHARES_PER_TURN = 2;

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
  const expenses = player.issuedShares + player.engineLevel + (player.dgel ?? 0);
  const survivalShortage = Math.max(0, expenses - (player.cash + Math.max(0, player.income)));
  let survivalShares = Math.min(
    Math.ceil(survivalShortage / GAME_CONSTANTS.SHARE_VALUE),
    maxPossibleShares,
  );
  // 맵별: 최대 발행으로도 파산을 못 막으면 발행을 포기해 VP(-3/주)를 보존한다.
  // 주식 1주의 실효 보전액은 $4(현금 +5, 유지비 +1)이고, 파산은 "부족분 > income"일 때 나므로
  // 회피에 필요한 주수 = ceil((부족분 - income) / 4). 이게 발행 가능량을 넘으면 헛돈이다.
  if (survivalShares > 0 && getMapProfile(state.mapId).aiSkipHopelessSurvivalIssue) {
    const RELIEF_PER_SHARE = GAME_CONSTANTS.SHARE_VALUE - 1;
    const needed = Math.ceil((survivalShortage - Math.max(0, player.income)) / RELIEF_PER_SHARE);
    if (needed > maxPossibleShares) {
      debugLog.preparation(`[Phase I: 주식 발행] ${player.name}: 발행해도 파산 회피 불가(필요 ${needed}주 > 가능 ${maxPossibleShares}주) → 발행 포기`);
      survivalShares = 0;
    }
  }
  if (survivalShares > 0) {
    debugLog.preparation(
      `[Phase I: 주식 발행] ${player.name}: 생존 발행 ${survivalShares}주 (cash $${player.cash} + income ${player.income} < expenses $${expenses})`
    );
  }

  // === 2. 마지막 턴(또는 trackCubes 마지막 2턴): 건설→VP 회수가 약하고 -3VP/주는 영구 → 생존 외 발행 금지 ===
  // ★ trackCubes는 마지막 2턴(T7-8) 건설 발행도 금지 (사용자: VP 양보해도 파산↓) — 늦은 건설은
  //   배달로 회수할 턴이 부족해 순수 빚이 되고, 그 주식 비용이 파산을 유발한다.
  // ★ trackCubes 마지막 2턴(T7-8)은 건설 발행 절대 금지(사용자 지침) — 늦은 건설은 배달로 회수할 턴이
  //   부족해 순수 빚이 되고 그 주식 비용이 파산을 유발한다(측정: 파산 13→11, VP 유지).
  // 맵별 "후반 N턴 계획 발행 금지" (기본 0 = 마지막 턴만). 달은 4 → T5~8 금지.
  const noIssueLastTurns = getMapProfile(state.mapId).aiNoBuildIssueLastTurns;
  const noBuildIssue = isLastTurn
    || (config.incomeSources.includes('trackCubes') && state.currentTurn >= config.totalTurns - 1)
    || (noIssueLastTurns > 0 && state.currentTurn > config.totalTurns - noIssueLastTurns);
  if (noBuildIssue) {
    if (survivalShares === 0) {
      debugLog.preparation(`[Phase I: 주식 발행] ${player.name}: 후반(생존 외 발행 금지) → 발행 안함`);
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

  // === 5. 상한 적용 (사용자 지침) ===
  // 현금이 15 이상이면 계획 발행 안 함(자금 충분), 15 미만일 때만 발행. 누적 상한 없음 —
  // 단 턴당 2주 캡은 유지(매턴 폭증 방지). 게임 규칙 상한(MAX_SHARES)까지.
  if (player.cash >= 15) planShares = 0;
  let sharesToIssue = Math.max(
    survivalShares,
    Math.min(planShares, MAX_SHARES_PER_TURN, maxPossibleShares),
  );

  // ★ 매턴 총 2주 하드캡 (다인 cityCubes, 생존 발행 포함)
  if (state.activePlayers.length >= 3 && !config.incomeSources.includes('trackCubes')) {
    sharesToIssue = Math.min(sharesToIssue, MAX_SHARES_PER_TURN);
  }

  const routeStr = plan.targetRoute ? `${plan.targetRoute.from}→${plan.targetRoute.to}` : '없음';
  debugLog.preparation(
    `[Phase I: 주식 발행] ${player.name}: 경로=${routeStr}, 필요현금 $${plan.cashNeeded}, 보유 $${player.cash}, 부족 $${needed} → 발행 ${sharesToIssue}주`
  );

  return sharesToIssue;
}

