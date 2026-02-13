/**
 * Phase III: 행동 선택 전략
 *
 * AI가 동적 화물 기반 전략에 따라 7가지 특수 행동 중 하나를 선택합니다.
 */

import { GameState, PlayerId, SpecialAction, GAME_CONSTANTS } from '@/types/game';
import { countPlayerTracks, calculateExpectedExpenses, calculateMinCashReserve } from '../evaluator';
import { getCurrentRoute, hasSelectedStrategy } from '../strategy/state';
import { reevaluateStrategy } from '../strategy/selector';
import { getConnectedCities, analyzeDeliveryOpportunities } from '../strategy/analyzer';
import { debugLog } from '@/utils/debugConfig';

/**
 * 사용 가능한 행동 목록 반환
 */
function getAvailableActions(state: GameState): SpecialAction[] {
  const selectedActions = Object.values(state.players)
    .map(p => p.selectedAction)
    .filter((a): a is SpecialAction => a !== null);

  const allActions: SpecialAction[] = [
    'firstMove',
    'firstBuild',
    'engineer',
    'locomotive',
    'urbanization',
    'production',
    'turnOrder',
  ];

  return allActions.filter(a => !selectedActions.includes(a));
}

/**
 * 행동 선택 결정
 *
 * 동적 화물 기반 전략:
 * 1. 엔진 레벨이 목표 경로 거리보다 낮으면 locomotive 우선
 * 2. 트랙이 적으면 engineer 우선
 * 3. 기본 우선순위대로 선택
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 선택할 행동
 */
export function decideAction(state: GameState, playerId: PlayerId): SpecialAction {
  const player = state.players[playerId];
  if (!player) {
    const available = getAvailableActions(state);
    return available[0] || 'turnOrder';
  }

  const available = getAvailableActions(state);

  if (available.length === 0) {
    console.error('[AI 행동] 선택 가능한 행동 없음');
    return 'turnOrder';
  }

  // 경로 없으면 재평가 (과다 호출 방지)
  if (!hasSelectedStrategy(playerId)) {
    debugLog.preparation(`[Phase III: 행동 선택] ${player.name}: 경로 없음 - 초기화 및 평가 중...`);
    reevaluateStrategy(state, playerId);
  }

  // 현재 목표 경로 가져오기
  const currentRoute = getCurrentRoute(playerId);
  const routeStr = currentRoute ? `${currentRoute.from}→${currentRoute.to}` : '없음';

  // 완성된 링크 확인 (도시 2개 이상 연결)
  const connectedCities = getConnectedCities(state, playerId);
  const hasCompletedLinks = connectedCities.length >= 2;

  const trackCount = countPlayerTracks(state.board, playerId);
  const minReserve = calculateMinCashReserve(state, playerId);
  const isLastTurn = state.currentTurn >= state.maxTurns;

  // === 마지막 턴: 배달 극대화 (건설 VP < 수입감소 리스크) ===
  if (isLastTurn) {
    // 완성된 링크가 있으면 firstMove 우선 (배달 선점 = 수입 ×3 VP)
    // 링크가 없으면 건설 우선 (트랙 +1 VP, firstMove는 무의미)
    const lastTurnPriority: SpecialAction[] = hasCompletedLinks
      ? [
        'firstMove',
        'engineer',
        'firstBuild',
        'urbanization',
        'production',
        'turnOrder',
      ]
      : [
        'engineer',
        'firstBuild',
        'firstMove',
        'urbanization',
        'production',
        'turnOrder',
      ];
    const engineerMinCash = 3 * GAME_CONSTANTS.PLAIN_TRACK_COST + minReserve;
    for (const action of lastTurnPriority) {
      if (!available.includes(action)) continue;
      if (action === 'engineer' && player.cash < engineerMinCash) continue;
      debugLog.preparation(`[Phase III: 행동 선택] ${player.name}: ${action} (마지막 턴, 링크=${hasCompletedLinks}, 경로=${routeStr})`);
      return action;
    }
    return available[0];
  }

  // === 일반 턴 ===

  // 트랙 건설 최소 비용 (locomotive 비교에도 사용)
  const engineerMinCash = 3 * GAME_CONSTANTS.PLAIN_TRACK_COST + minReserve;

  // 현재 목표 경로가 엔진 레벨보다 긴 경우 locomotive 필요 여부 판단
  const needsEngineUpgrade = (() => {
    if (!currentRoute) return false;
    const opportunities = analyzeDeliveryOpportunities(state);
    const finalTo = currentRoute.overallTo || currentRoute.to;
    const targetOpp = opportunities.find(opp =>
      opp.sourceCityId === currentRoute.from && opp.targetCityId === finalTo
    );
    return targetOpp ? targetOpp.distance > player.engineLevel : false;
  })();

  // 엔진 업그레이드 필요 시 locomotive 우선 선택
  // 단, 턴 1에서 income=0이면 건설에 집중 (엔진 비용 $1/턴이 누적됨)
  if (needsEngineUpgrade && hasCompletedLinks && !isLastTurn
      && available.includes('locomotive')
      && (state.currentTurn > 1 || player.income > 0)) {
    const futureExp = player.issuedShares + (player.engineLevel + 1);
    // 건설비 확보 후 비용 감당 가능 여부 체크
    if (player.cash + Math.max(0, player.income) >= futureExp + engineerMinCash) {
      debugLog.preparation(`[Phase III: 행동 선택] ${player.name}: locomotive (엔진 업그레이드 필요, 목표=${routeStr})`);
      return 'locomotive';
    }
  }
  // 트랙이 적으면 engineer 우선 (예비금 포함하여 충분한 현금 필요)
  // 단, 트랙 0개(첫 건설)이면 firstBuild가 더 유리 (먼저 건설 = 최적 헥스 선점)
  if (trackCount > 0 && trackCount < 6 && available.includes('engineer') && player.cash >= engineerMinCash) {
    debugLog.preparation(`[Phase III: 행동 선택] ${player.name}: engineer (트랙 ${trackCount}개, 4개 건설 가능)`);
    return 'engineer';
  }

  // 완성된 링크가 있으면 firstMove 우선 (배달 선점 = 수입 ×3 VP)
  // 링크가 없으면 건설 우선 (트랙이 없으면 배달 불가)
  const fallbackPriority: SpecialAction[] = hasCompletedLinks
    ? (needsEngineUpgrade
      ? ['firstMove', 'locomotive', 'engineer', 'firstBuild', 'urbanization', 'production', 'turnOrder']
      : ['firstMove', 'firstBuild', 'engineer', 'urbanization', 'production', 'turnOrder', 'locomotive'])
    : ['firstBuild', 'engineer', 'firstMove', 'urbanization', 'production', 'turnOrder', 'locomotive'];

  for (const action of fallbackPriority) {
    if (!available.includes(action)) continue;
    if (action === 'engineer' && player.cash < engineerMinCash) continue;
    if (action === 'locomotive') {
      // locomotive는 엔진3 이상이면 스킵 (tutorial max), 완성 링크 없으면 스킵
      if (player.engineLevel >= 3 || !hasCompletedLinks) continue;
      const futureExp = player.issuedShares + (player.engineLevel + 1);
      // 현금+수입으로 비용 감당 불가하면 스킵
      if (player.cash + Math.max(0, player.income) < futureExp) continue;
    }
    debugLog.preparation(`[Phase III: 행동 선택] ${player.name}: ${action} (경로=${routeStr}, 기본 우선순위)`);
    return action;
  }

  return available[0];
}
