/**
 * AIPlayer 클래스 - 각 AI 플레이어의 독립적인 인스턴스
 *
 * 책임:
 * - 자신만의 전략 상태 관리 (전역 상태 사용 안함)
 * - Phase별 결정 위임
 * - 전략 선택 및 재평가
 */

import { GameState, PlayerId, SpecialAction, HexCoord } from '@/types/game';
import {
  AIStrategy,
  AIStrategyState,
  DeliveryRoute,
  STRATEGY_SWITCH_THRESHOLD,
} from './strategy/types';

// 전략 평가 함수들
import {
  selectInitialStrategy,
  evaluateAllScenarios,
  evaluateStrategyFeasibility,
} from './strategy/selector';

// 전역 상태 동기화용 (레거시 호환성)
import { setSelectedStrategy } from './strategy/state';

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

  // === 전략 상태 (인스턴스 내부에 캡슐화) ===
  private _strategy: AIStrategy | null = null;
  private _strategySelectedTurn: number = 0;
  private _routeProgress: Map<string, number> = new Map();

  // === 분석 캐시 ===
  private _pathCache: Map<string, HexCoord[]> = new Map();

  constructor(playerId: PlayerId, name: string) {
    this.playerId = playerId;
    this.name = name;
    console.log(`[AIPlayer] 인스턴스 생성: ${name} (${playerId})`);
  }

  // === 전략 관련 getter ===
  get strategy(): AIStrategy | null {
    return this._strategy;
  }

  get hasStrategy(): boolean {
    return this._strategy !== null;
  }

  get strategySelectedTurn(): number {
    return this._strategySelectedTurn;
  }

  get strategyState(): AIStrategyState | null {
    if (!this._strategy) return null;
    return {
      playerId: this.playerId,
      strategy: this._strategy,
      selectedTurn: this._strategySelectedTurn,
      routeProgress: new Map(this._routeProgress),
    };
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
      this.reevaluateStrategy(state);
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
        this.reevaluateStrategy(state);
        const action = decideAction(state, this.playerId);
        return { type: 'selectAction', action };
      }

      case 'buildTrack': {
        // buildTrack에서도 전략 재평가 (다른 AI 건설 이후)
        this.reevaluateStrategy(state);
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
   * 초기 전략 선택
   */
  initializeStrategy(state: GameState): void {
    if (this._strategy) {
      console.log(`[AIPlayer] ${this.name}: 이미 전략 선택됨 (${this._strategy.nameKo})`);
      return;
    }

    const selected = selectInitialStrategy(state, this.playerId);
    this.setStrategy(selected, state.currentTurn);
    this.logStrategyState();
  }

  /**
   * 전략 재평가 (매 턴 또는 중요 시점)
   */
  reevaluateStrategy(state: GameState): void {
    // 전략이 없으면 초기화
    if (!this._strategy) {
      console.log(`[AIPlayer] ${this.name}: 전략 없음 - 초기 선택`);
      this.initializeStrategy(state);
      return;
    }

    // 현재 전략 실현 가능성 평가
    const feasibility = evaluateStrategyFeasibility(this._strategy, state, this.playerId);

    // 실현 가능성이 낮으면 대안 검토
    if (feasibility.score < STRATEGY_SWITCH_THRESHOLD) {
      const alternatives = evaluateAllScenarios(state, this.playerId);
      alternatives.sort((a, b) => b.score - a.score);

      const best = alternatives[0];

      // 현재 전략보다 확실히 나은 경우만 변경
      if (best.scenario.name !== this._strategy.name && best.score > feasibility.score) {
        console.log(`[AIPlayer] ${this.name}: 전략 변경 ${this._strategy.nameKo} → ${best.scenario.nameKo}`);
        console.log(`  - 이전 실현 가능성: ${feasibility.score.toFixed(1)}`);
        console.log(`  - 새 전략 점수: ${best.score.toFixed(1)}`);

        if (feasibility.blockedRoutes.length > 0) {
          console.log(`  - 차단된 경로: ${feasibility.blockedRoutes.join(', ')}`);
        }
        if (feasibility.noGoodsRoutes.length > 0) {
          console.log(`  - 물품 없는 경로: ${feasibility.noGoodsRoutes.join(', ')}`);
        }

        this.setStrategy(best.scenario, state.currentTurn);
        return;
      }
    }

    // 경로 우선순위 조정 (내부 상태만 수정)
    this.adjustRoutePrioritiesInternal(state);
  }

  /**
   * 전략 설정 (내부용)
   *
   * 내부 상태 업데이트 + 전역 상태 동기화 (레거시 호환)
   */
  private setStrategy(strategy: AIStrategy, turn: number): void {
    this._strategy = strategy;
    this._strategySelectedTurn = turn;
    this._routeProgress.clear();

    // 전역 상태 동기화 (레거시 decision 함수들이 사용)
    setSelectedStrategy(this.playerId, strategy, turn);
  }

  /**
   * 전역 상태와 내부 상태 동기화
   *
   * 결정 함수(decideAction, decideBuildTrack 등) 호출 전에 호출하여
   * 레거시 함수들이 올바른 전략을 읽을 수 있도록 함
   */
  private syncToGlobalState(): void {
    if (this._strategy) {
      setSelectedStrategy(this.playerId, this._strategy, this._strategySelectedTurn);
    }
  }

  /**
   * 경로 우선순위 동적 조정 (인스턴스 내부 상태만 수정)
   *
   * 전역 상태를 사용하지 않고 내부 _strategy만 수정
   */
  private adjustRoutePrioritiesInternal(state: GameState): void {
    if (!this._strategy) return;

    const adjustedRoutes: DeliveryRoute[] = [];

    for (const route of this._strategy.targetRoutes) {
      const progress = getRouteProgress(state, this.playerId, route);
      const hasCubes = hasMatchingCubes(state, route);
      const isBlocked = isRouteBlockedByOpponent(state, this.playerId, route);

      let newPriority = route.priority;

      // 경로가 거의 완성되면 최우선
      if (progress >= 0.8 && hasCubes) {
        newPriority = 1;
      }
      // 물품이 없거나 차단되면 후순위
      else if (!hasCubes || isBlocked) {
        newPriority = 3;
      }
      // 진행 중이면 중간 우선순위
      else if (progress > 0) {
        newPriority = Math.min(2, route.priority);
      }

      adjustedRoutes.push({
        ...route,
        priority: newPriority,
      });
    }

    // 우선순위 재정렬
    adjustedRoutes.sort((a, b) => a.priority - b.priority);

    // 내부 전략 업데이트
    this._strategy = {
      ...this._strategy,
      targetRoutes: adjustedRoutes,
    };

    // 전역 상태 동기화 (레거시 decision 함수들이 사용)
    this.syncToGlobalState();
  }

  /**
   * 다음 목표 경로 가져오기 (인스턴스 내부 상태 사용)
   *
   * 전역 상태를 읽지 않고 내부 _strategy를 사용
   */
  getNextTargetRoute(state: GameState): DeliveryRoute | null {
    if (!this._strategy) return null;

    // 우선순위 순으로 미완성 + 물품 있는 경로 찾기
    for (const route of this._strategy.targetRoutes) {
      const progress = getRouteProgress(state, this.playerId, route);
      const hasCubes = hasMatchingCubes(state, route);

      // 완성되지 않은 경로이고 물품이 있는 경우만
      if (progress < 1.0 && hasCubes) {
        return route;
      }

      // 디버깅: 왜 스킵되는지 로그
      if (progress >= 1.0) {
        console.log(`[AIPlayer] ${route.from}→${route.to} 스킵: 이미 완성됨`);
      } else if (!hasCubes) {
        console.log(`[AIPlayer] ${route.from}→${route.to} 스킵: 물품 없음`);
      }
    }

    // 모든 경로가 완성되었거나 물품이 없으면 전략 재평가
    console.log(`[AIPlayer] ${this.name}: 현재 전략(${this._strategy.nameKo})의 모든 경로 완성/물품없음 - 전략 재평가`);

    // 다른 시나리오 중 물품이 있는 것 찾기
    const scores = evaluateAllScenarios(state, this.playerId);
    const scoredWithGoods = scores.filter(s => s.matchingCubes > 0);

    if (scoredWithGoods.length > 0) {
      scoredWithGoods.sort((a, b) => b.score - a.score);
      const newStrategy = scoredWithGoods[0].scenario;

      // 현재 전략과 다르면 전환 (내부 상태만 수정)
      if (newStrategy.name !== this._strategy.name) {
        console.log(`[AIPlayer] ${this.name}: 전략 변경 ${this._strategy.nameKo} → ${newStrategy.nameKo}`);
        this.setStrategy(newStrategy, state.currentTurn);

        // 새 전략에서 물품 있는 경로 찾기
        for (const route of newStrategy.targetRoutes) {
          if (hasMatchingCubes(state, route)) {
            return route;
          }
        }
      }
    }

    // 어떤 전략도 물품이 없으면 아무 물품이나 배달 가능한 경로 찾기
    const allOpportunities = analyzeDeliveryOpportunities(state);
    if (allOpportunities.length > 0) {
      // 가장 가까운 배달 기회 선택
      const best = allOpportunities[0];
      console.log(`[AIPlayer] ${this.name}: 임시 경로 ${best.sourceCityId}→${best.targetCityId} 사용`);
      return { from: best.sourceCityId, to: best.targetCityId, priority: 1 };
    }

    console.log(`[AIPlayer] ${this.name}: 배달 가능한 물품 없음 - 건설 스킵`);
    return null;
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
    this._strategy = null;
    this._strategySelectedTurn = 0;
    this._routeProgress.clear();
    this._pathCache.clear();
  }

  /**
   * 디버깅용 상태 로그
   */
  logStrategyState(): void {
    if (!this._strategy) {
      console.log(`[AIPlayer] ${this.name}: 전략 없음`);
      return;
    }

    console.log(`[AIPlayer] ${this.name}:`);
    console.log(`  - 시나리오: ${this._strategy.nameKo}`);
    console.log(`  - 선택 턴: ${this._strategySelectedTurn}`);
    console.log(`  - 목표 경로:`);

    for (const route of this._strategy.targetRoutes) {
      const progress = this._routeProgress.get(`${route.from}-${route.to}`) || 0;
      console.log(`    ${route.from} → ${route.to} (우선순위: ${route.priority}, 진행: ${(progress * 100).toFixed(0)}%)`);
    }
  }
}
