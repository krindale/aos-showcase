/**
 * AI 엔진 - Age of Steam 튜토리얼 게임용
 *
 * 전략적 시나리오 기반 AI로 각 Phase에서 최선의 수를 선택합니다.
 *
 * === 새로운 인스턴스 기반 아키텍처 ===
 * - AIPlayer: 각 AI 플레이어의 독립적인 인스턴스 (전략 상태 캡슐화)
 * - AIPlayerManager: 싱글톤으로 모든 AI 인스턴스 관리
 *
 * 기존 함수형 API는 호환성을 위해 유지됩니다.
 */

import { GameState, PlayerId, SpecialAction } from '@/types/game';

// === 새로운 인스턴스 기반 시스템 ===
// aiPlayerManager만 임포트 (클래스는 하단에서 재export)
import { aiPlayerManager } from './AIPlayerManager';

// === 기존 전략 함수 (호환성 유지용) ===
import { decideSharesIssue } from './strategies/issueShares';
import { decideAuctionBid, AuctionDecision } from './strategies/auction';
import { decideAction } from './strategies/selectAction';
import { decideBuildTrack, TrackBuildDecision } from './strategies/buildTrack';
import { decideMoveGoods, MoveGoodsDecision } from './strategies/moveGoods';

// 전략 시스템 임포트 (호환성 유지용)
import { selectInitialStrategy, reevaluateStrategy } from './strategy/selector';
import { getSelectedStrategy, setSelectedStrategy, resetStrategyStates, hasSelectedStrategy, logStrategyState } from './strategy/state';
import { AIStrategy } from './strategy/types';

/**
 * AI 결정 타입
 */
export type AIDecision =
  | { type: 'issueShares'; amount: number }
  | { type: 'auction'; decision: AuctionDecision }
  | { type: 'selectAction'; action: SpecialAction }
  | { type: 'buildTrack'; decision: TrackBuildDecision }
  | { type: 'moveGoods'; decision: MoveGoodsDecision }
  | { type: 'skip' }; // 행동 없음

/**
 * AI 전략 초기화 (게임 시작 시 호출)
 *
 * @deprecated AIPlayerManager.getOrCreate()를 사용하세요
 */
export function initializeAIStrategy(state: GameState, playerId: PlayerId): void {
  // 새 시스템: AIPlayer 인스턴스가 있으면 그것을 사용
  const aiPlayer = aiPlayerManager.get(playerId);
  if (aiPlayer) {
    aiPlayer.initializeStrategy(state);
    return;
  }

  // 레거시 폴백: 기존 전역 상태 사용
  if (hasSelectedStrategy(playerId)) {
    console.log(`[AI] ${playerId}: 이미 전략이 선택됨`);
    return;
  }

  const strategy = selectInitialStrategy(state, playerId);
  setSelectedStrategy(playerId, strategy, state.currentTurn);
  logStrategyState(playerId);
}

/**
 * AI 전략 리셋 (게임 리셋 시 호출)
 */
export function resetAIStrategies(): void {
  // 새 시스템: 모든 AI 인스턴스 리셋
  aiPlayerManager.resetAll();

  // 레거시: 전역 상태도 리셋 (호환성)
  resetStrategyStates();
}

/**
 * AI가 현재 단계에서 취할 행동을 결정합니다.
 *
 * 새 시스템: AIPlayer 인스턴스가 등록되어 있으면 해당 인스턴스 사용
 * 레거시: 전역 함수 직접 호출
 *
 * @param state 현재 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns AI 결정
 */
export function getAIDecision(state: GameState, playerId: PlayerId): AIDecision {
  // 새 시스템: AIPlayer 인스턴스가 등록되어 있으면 사용
  const aiPlayer = aiPlayerManager.get(playerId);
  if (aiPlayer) {
    return aiPlayer.decide(state);
  }

  // === 레거시 로직 (호환성 유지) ===
  const player = state.players[playerId];
  if (!player) {
    console.error(`[AI] 플레이어 없음: ${playerId}`);
    return { type: 'skip' };
  }

  const phase = state.currentPhase;

  // 턴 시작 시 전략 재평가 (issueShares 단계에서만)
  if (phase === 'issueShares') {
    reevaluateStrategy(state, playerId);
  }

  switch (phase) {
    case 'issueShares': {
      const amount = decideSharesIssue(state, playerId);
      return { type: 'issueShares', amount };
    }

    case 'determinePlayerOrder': {
      const decision = decideAuctionBid(state, playerId);
      return { type: 'auction', decision };
    }

    case 'selectActions': {
      const action = decideAction(state, playerId);
      return { type: 'selectAction', action };
    }

    case 'buildTrack': {
      const decision = decideBuildTrack(state, playerId);
      return { type: 'buildTrack', decision };
    }

    case 'moveGoods': {
      const decision = decideMoveGoods(state, playerId);
      return { type: 'moveGoods', decision };
    }

    default:
      return { type: 'skip' };
  }
}

/**
 * AI 턴 딜레이 (ms) - 자연스러운 플레이 느낌을 위해
 */
export const AI_TURN_DELAY = 1000;

/**
 * AI 플레이어인지 확인
 */
export function isAIPlayer(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return player?.isAI ?? false;
}

/**
 * 현재 플레이어가 AI인지 확인
 */
export function isCurrentPlayerAI(state: GameState): boolean {
  return isAIPlayer(state, state.currentPlayer);
}

/**
 * AI 플레이어의 현재 전략 가져오기
 */
export function getAIStrategy(playerId: PlayerId): AIStrategy | null {
  // 새 시스템: AIPlayer 인스턴스 확인
  const aiPlayer = aiPlayerManager.get(playerId);
  if (aiPlayer) {
    return aiPlayer.strategy;
  }

  // 레거시 폴백
  return getSelectedStrategy(playerId);
}

// === 새로운 인스턴스 기반 시스템 export ===
export { AIPlayer } from './AIPlayer';
export { AIPlayerManager, aiPlayerManager } from './AIPlayerManager';

// === 전략 타입 및 함수 재export (호환성) ===
export type { AIStrategy } from './strategy/types';
export { getSelectedStrategy } from './strategy/state';
