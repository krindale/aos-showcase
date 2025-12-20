/**
 * Phase III: 행동 선택 전략
 *
 * AI가 동적 화물 기반 전략에 따라 7가지 특수 행동 중 하나를 선택합니다.
 */

import { GameState, PlayerId, SpecialAction } from '@/types/game';
import { countPlayerTracks } from '../evaluator';
import { getCurrentRoute, hasSelectedStrategy } from '../strategy/state';
import { reevaluateStrategy } from '../strategy/selector';

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

  // 경로 없으면 재평가
  if (!hasSelectedStrategy(playerId)) {
    console.log(`[AI 행동] ${player.name}: 경로 없음 - 초기화 및 평가 중...`);
  }
  // 항상 재평가하여 상대 트랙/물품 상황 반영
  reevaluateStrategy(state, playerId);

  // 현재 목표 경로 가져오기
  const currentRoute = getCurrentRoute(playerId);
  const routeStr = currentRoute ? `${currentRoute.from}→${currentRoute.to}` : '없음';

  // 동적 전략: 기본 엔진 레벨 요구치 2 (1링크 배달 위해)
  const minEngineLevel = 2;
  if (player.engineLevel < minEngineLevel && available.includes('locomotive')) {
    console.log(`[AI 행동] ${player.name}: locomotive (경로=${routeStr}, 엔진 ${player.engineLevel} < ${minEngineLevel})`);
    return 'locomotive';
  }

  // 트랙이 적으면 engineer 우선
  const trackCount = countPlayerTracks(state.board, playerId);
  if (trackCount < 3 && available.includes('engineer') && player.cash >= 6) {
    console.log(`[AI 행동] ${player.name}: engineer (트랙 ${trackCount}개, 4개 건설 가능)`);
    return 'engineer';
  }

  // 첫 번째 트랙 건설 전이면 firstBuild 우선
  if (trackCount === 0 && available.includes('firstBuild')) {
    console.log(`[AI 행동] ${player.name}: firstBuild (첫 트랙 건설)`);
    return 'firstBuild';
  }

  // 기본 우선순위대로 선택
  const fallbackPriority: SpecialAction[] = [
    'firstBuild',
    'locomotive',
    'engineer',
    'firstMove',
    'urbanization',
    'production',
    'turnOrder',
  ];

  for (const action of fallbackPriority) {
    if (available.includes(action)) {
      // 추가 조건 검사
      if (action === 'locomotive' && player.engineLevel >= 3) {
        continue;  // 엔진 충분하면 스킵
      }
      if (action === 'engineer' && player.cash < 6) {
        continue;  // 현금 부족하면 스킵
      }

      console.log(`[AI 행동] ${player.name}: ${action} (경로=${routeStr}, 기본 우선순위)`);
      return action;
    }
  }

  return available[0];
}
