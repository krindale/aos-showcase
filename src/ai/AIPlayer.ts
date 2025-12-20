/**
 * AIPlayer 클래스 - 각 AI 플레이어의 독립적인 인스턴스
 *
 * 책임:
 * - 자신만의 전략 상태 관리 (전역 상태 사용 안함)
 * - Phase별 결정 위임
 * - 동적 화물 기반 전략 사용
 */

import { GameState, PlayerId, SpecialAction, HexCoord } from '@/types/game';
import {
  DeliveryRoute,
  DynamicStrategy,
} from './strategy/types';

// 동적 경로 선택 함수
import {
  getNextTargetRoute,
  reevaluateStrategy,
} from './strategy/selector';

// 전역 상태 동기화용
import { getCurrentRoute } from './strategy/state';

// 분석 함수들 (순수 함수)
import {
  hasMatchingCubes,
  getRouteProgress,
  analyzeDeliveryOpportunities,
  isRouteBlockedByOpponent,
} from './strategy/analyzer';

// 기존 결정 함수들 임포트
import { decideSharesIssue } from './strategies/issueShares';
import { decideAuctionBid, AuctionDecision } from './strategies/auction';
import { decideAction } from './strategies/selectAction';
import { decideBuildTrack, TrackBuildDecision } from './strategies/buildTrack';
import { decideMoveGoods, MoveGoodsDecision } from './strategies/moveGoods';

/**
 * AI 결정 타입
 */
export type AIDecision =
  | { type: 'issueShares'; amount: number }
  | { type: 'auction'; decision: AuctionDecision }
  | { type: 'selectAction'; action: SpecialAction }
  | { type: 'buildTrack'; decision: TrackBuildDecision }
  | { type: 'moveGoods'; decision: MoveGoodsDecision }
  | { type: 'skip' };

export class AIPlayer {
  // === 불변 속성 ===
  public readonly playerId: PlayerId;
  public readonly name: string;

  // === 전략 상태 (단순화) ===
  private _currentRoute: DeliveryRoute | null = null;
  private _routeProgress: Map<string, number> = new Map();

  // === 분석 캐시 ===
  private _pathCache: Map<string, HexCoord[]> = new Map();

  constructor(playerId: PlayerId, name: string) {
    this.playerId = playerId;
    this.name = name;
    console.log(`[AIPlayer] 인스턴스 생성: ${name} (${playerId})`);
  }

  // === 전략 관련 getter ===
  get strategy(): DynamicStrategy {
    return {
      name: 'dynamic_cargo_based',
      nameKo: '화물 기반 동적 전략',
      targetRoutes: this._currentRoute ? [this._currentRoute] : [],
    };
  }

  get hasStrategy(): boolean {
    return this._currentRoute !== null;
  }

  get currentRoute(): DeliveryRoute | null {
    return this._currentRoute;
  }

  // === 핵심 메서드 ===

  /**
   * 게임 상태 기반 AI 결정 반환
   */
  decide(state: GameState): AIDecision {
    const player = state.players[this.playerId];
    if (!player) {
      console.error(`[AIPlayer] 플레이어 없음: ${this.playerId}`);
      return { type: 'skip' };
    }

    const phase = state.currentPhase;

    // 턴 시작 시 전략 재평가
    if (phase === 'issueShares') {
      this.updateRoute(state);
    }

    // Phase별 결정
    switch (phase) {
      case 'issueShares': {
        const amount = decideSharesIssue(state, this.playerId);
        return { type: 'issueShares', amount };
      }

      case 'determinePlayerOrder': {
        const decision = decideAuctionBid(state, this.playerId);
        return { type: 'auction', decision };
      }

      case 'selectActions': {
        // selectAction에서도 전략 재평가 (다른 AI 행동 이후)
        this.updateRoute(state);
        const action = decideAction(state, this.playerId);
        return { type: 'selectAction', action };
      }

      case 'buildTrack': {
        // buildTrack에서도 전략 재평가 (다른 AI 건설 이후)
        this.updateRoute(state);
        const decision = decideBuildTrack(state, this.playerId);
        return { type: 'buildTrack', decision };
      }

      case 'moveGoods': {
        const decision = decideMoveGoods(state, this.playerId);
        return { type: 'moveGoods', decision };
      }

      default:
        return { type: 'skip' };
    }
  }

  /**
   * 현재 목표 경로 업데이트
   */
  private updateRoute(state: GameState): void {
    // 전역 함수를 사용하여 동적으로 최적 경로 탐색
    reevaluateStrategy(state, this.playerId);
    this._currentRoute = getCurrentRoute(this.playerId);

    if (this._currentRoute) {
      console.log(`[AIPlayer] ${this.name}: 현재 경로 ${this._currentRoute.from}→${this._currentRoute.to}`);
    }
  }

  /**
   * 초기 전략 선택 (호환성 유지)
   */
  initializeStrategy(state: GameState): void {
    this.updateRoute(state);
  }

  /**
   * 전략 재평가 (호환성 유지)
   */
  reevaluateStrategy(state: GameState): void {
    this.updateRoute(state);
  }

  /**
   * 다음 목표 경로 가져오기
   */
  getNextTargetRoute(state: GameState): DeliveryRoute | null {
    // 현재 경로가 없거나 완성되었으면 새로 탐색
    if (this._currentRoute) {
      const progress = getRouteProgress(state, this.playerId, this._currentRoute);
      const hasCubes = hasMatchingCubes(state, this._currentRoute);

      if (progress >= 1.0) {
        console.log(`[AIPlayer] ${this._currentRoute.from}→${this._currentRoute.to} 완성됨 - 새 경로 탐색`);
        this.updateRoute(state);
      } else if (!hasCubes) {
        console.log(`[AIPlayer] ${this._currentRoute.from}→${this._currentRoute.to} 물품 없음 - 새 경로 탐색`);
        this.updateRoute(state);
      }
    } else {
      this.updateRoute(state);
    }

    return this._currentRoute;
  }

  /**
   * 경로 진행도 업데이트
   */
  updateRouteProgress(routeId: string, progress: number): void {
    this._routeProgress.set(routeId, progress);
  }

  /**
   * 경로 진행도 가져오기
   */
  getRouteProgressById(routeId: string): number {
    return this._routeProgress.get(routeId) || 0;
  }

  /**
   * 경로 캐시에서 경로 가져오기
   */
  getCachedPath(from: HexCoord, to: HexCoord): HexCoord[] | null {
    const key = `${from.col},${from.row}-${to.col},${to.row}`;
    return this._pathCache.get(key) || null;
  }

  /**
   * 경로 캐시에 경로 저장
   */
  setCachedPath(from: HexCoord, to: HexCoord, path: HexCoord[]): void {
    const key = `${from.col},${from.row}-${to.col},${to.row}`;
    this._pathCache.set(key, path);
  }

  /**
   * 상태 리셋 (게임 재시작 시)
   */
  reset(): void {
    console.log(`[AIPlayer] ${this.name}: 상태 리셋`);
    this._currentRoute = null;
    this._routeProgress.clear();
    this._pathCache.clear();
  }

  /**
   * 디버깅용 상태 로그
   */
  logStrategyState(): void {
    if (!this._currentRoute) {
      console.log(`[AIPlayer] ${this.name}: 경로 없음`);
      return;
    }

    console.log(`[AIPlayer] ${this.name}:`);
    console.log(`  - 전략: 화물 기반 동적 전략`);
    console.log(`  - 현재 경로: ${this._currentRoute.from} → ${this._currentRoute.to}`);
  }
}
