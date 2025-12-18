/**
 * Phase III: 행동 선택 전략
 *
 * AI가 선택한 전략에 따라 7가지 특수 행동 중 하나를 선택합니다.
 */

import { GameState, PlayerId, SpecialAction } from '@/types/game';
import { countPlayerTracks } from '../evaluator';
import { getSelectedStrategy } from '../strategy/state';

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
 * 전략:
 * 1. 선택된 전략의 preferredActions 우선
 * 2. locomotive - 엔진 레벨이 전략의 minEngineLevel보다 낮으면 우선
 * 3. engineer - 트랙이 적으면 우선
 * 4. 기본 우선순위대로 선택
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

  // 선택된 전략 가져오기
  const strategy = getSelectedStrategy(playerId);
  const strategyName = strategy?.nameKo ?? '없음';

  // 엔진 레벨이 전략의 최소 요구보다 낮으면 locomotive 우선
  const minEngineLevel = strategy?.minEngineLevel ?? 2;
  if (player.engineLevel < minEngineLevel && available.includes('locomotive')) {
    console.log(`[AI 행동] ${player.name}: locomotive (전략=${strategyName}, 엔진 ${player.engineLevel} < ${minEngineLevel})`);
    return 'locomotive';
  }

  // 전략의 선호 행동 우선
  if (strategy) {
    for (const preferred of strategy.preferredActions) {
      if (available.includes(preferred)) {
        // 추가 조건 검사
        if (preferred === 'locomotive' && player.engineLevel >= minEngineLevel) {
          continue;  // 엔진 충분하면 스킵
        }
        if (preferred === 'engineer' && player.cash < 6) {
          continue;  // 현금 부족하면 스킵 (추가 트랙 건설 비용)
        }

        console.log(`[AI 행동] ${player.name}: ${preferred} (전략=${strategyName}, 선호 행동)`);
        return preferred;
      }
    }
  }

  // 트랙이 적으면 engineer 우선 (전략과 무관하게)
  const trackCount = countPlayerTracks(state.board, playerId);
  if (trackCount < 3 && available.includes('engineer')) {
    console.log(`[AI 행동] ${player.name}: engineer (트랙 ${trackCount}개, 4개 건설 가능)`);
    return 'engineer';
  }

  // 기본 우선순위대로 선택
  // firstMove는 전략적으로 선호하지 않으면 낮은 우선순위
  const fallbackPriority: SpecialAction[] = [
    'firstBuild',
    'locomotive',
    'engineer',
    'firstMove',  // 전략에서 명시적으로 선호하지 않으면 낮은 우선순위
    'urbanization',
    'production',
    'turnOrder',
  ];

  for (const action of fallbackPriority) {
    if (available.includes(action)) {
      console.log(`[AI 행동] ${player.name}: ${action} (기본 우선순위)`);
      return action;
    }
  }

  return available[0];
}
