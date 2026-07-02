/**
 * AIPlayer 클래스 - 각 AI 플레이어의 독립적인 인스턴스
 *
 * 책임:
 * - 자신만의 전략 상태 관리 (전역 상태 사용 안함)
 * - Phase별 결정 위임
 * - 동적 화물 기반 전략 사용
 */

import { GameState, PlayerId, SpecialAction, HexCoord, NewCityTileId } from '@/types/game';
import { hexDistance, hexCoordsEqual } from '@/utils/hexGrid';
import { getMapData } from '@/utils/mapRegistry';
import {
  DeliveryRoute,
  DynamicStrategy,
} from './strategy/types';

// 동적 경로 선택 함수
import {
  getNextTargetRoute as _getNextTargetRoute,
  reevaluateStrategy,
} from './strategy/selector';
void _getNextTargetRoute; // 향후 확장용

// 전역 상태 동기화용
import { getCurrentRoute, setCurrentRoute } from './strategy/state';
import { refreshTurnPlan, ensureTurnPlan } from './strategy/turnPlan';
import { getMapAIConfig } from './strategy/mapConfig';
import { planUrbanization } from './strategies/urbanization';

// 분석 함수들 (순수 함수)
import {
  hasMatchingCubes,
  getRouteProgress,
  analyzeDeliveryOpportunities as _analyzeDeliveryOpportunities,
  isRouteBlockedByOpponent as _isRouteBlockedByOpponent,
} from './strategy/analyzer';
void _analyzeDeliveryOpportunities; void _isRouteBlockedByOpponent; // 향후 확장용

// 기존 결정 함수들 임포트
import { decideSharesIssue } from './strategies/issueShares';
import { decideAuctionBid, decideTurnOrderOffer, AuctionDecision } from './strategies/auction';
import { decideAction } from './strategies/selectAction';
import { decideBuildTrack, TrackBuildDecision } from './strategies/buildTrack';
import { decideMoveGoods, MoveGoodsDecision } from './strategies/moveGoods';
import { getMapProfile } from '@/maps/getMapProfile';

/**
 * AI 결정 타입
 */
export type AIDecision =
  | { type: 'issueShares'; amount: number }
  | { type: 'auction'; decision: AuctionDecision }
  | { type: 'placeNewCity'; townCoord: HexCoord; tileId: NewCityTileId } // 도시화 (buildTrack 단계 첫머리)
  | { type: 'turnOrderOffer'; accept: boolean } // 교대 선공권 응답 (alternateTurnOrder 맵)
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

  // === 재평가 중복 방지 ===
  private _lastEvaluatedTurn: number = -1;
  private _lastEvaluatedPhase: string = '';

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

    // 턴 시작 시 턴 계획 수립 (경로 재평가 포함 — refreshTurnPlan이 reevaluateStrategy 호출)
    if (phase === 'issueShares') {
      this._lastEvaluatedTurn = state.currentTurn;
      this._lastEvaluatedPhase = phase;
      refreshTurnPlan(state, this.playerId);
      this._currentRoute = getCurrentRoute(this.playerId);
    }

    // Phase별 결정
    switch (phase) {
      case 'issueShares': {
        const amount = decideSharesIssue(state, this.playerId);
        return { type: 'issueShares', amount };
      }

      case 'determinePlayerOrder': {
        // 교대 선공권 맵 (St. Lucia): 경매 대신 선공권 수락/거절 결정
        const profile = getMapProfile(state.mapId);
        if (profile.alternateTurnOrder) {
          if (state.turnOrderOffer && state.turnOrderOffer.offerPlayer === this.playerId) {
            const accept = decideTurnOrderOffer(state, this.playerId, profile.firstSeatCost);
            return { type: 'turnOrderOffer', accept };
          }
          // 제안이 이미 해결됨 → 다음 단계로
          return { type: 'skip' };
        }

        const decision = decideAuctionBid(state, this.playerId);
        return { type: 'auction', decision };
      }

      case 'selectActions': {
        // 경로가 없을 때만 재평가 (과다 호출 방지)
        if (!this._currentRoute) {
          this.updateRoute(state);
        }
        const action = decideAction(state, this.playerId);
        return { type: 'selectAction', action };
      }

      case 'buildTrack': {
        // 도시화(Urbanization): 트랙 건설 전에 신규 도시 배치 (룰북: before they build their track)
        // St. Lucia처럼 도시가 없는 맵에서는 배달 목적지를 만드는 필수 행동
        if (
          player.selectedAction === 'urbanization' &&
          !state.phaseState.urbanizationUsed &&
          state.currentPlayer === this.playerId
        ) {
          const plan = planUrbanization(state, this.playerId);
          if (plan) {
            // ★ 신도시 연결 커밋: 도시화 직후 건설이 무관한 경로로 가서 신도시가 끝까지
            // 미연결로 남던 문제 — 신도시로의 배달 경로를 현재 경로로 커밋해 같은 턴에 잇는다.
            // (동적색 맵 제외: 한국은 신도시 수요가 소모성·전역 공유라 기존 경로를 밀어내면서까지
            //  잇는 게 손해 — 커밋 적용 시 VP 회귀를 100시드로 확인)
            if (plan.connectRoute && !state.board.dynamicCityColors) {
              setCurrentRoute(this.playerId, plan.connectRoute);
              this._currentRoute = plan.connectRoute;
            }
            return { type: 'placeNewCity', townCoord: plan.townCoord, tileId: plan.tileId };
          }
        }

        // 경로가 없을 때만 재평가 (과다 호출 방지)
        if (!this._currentRoute) {
          this.updateRoute(state);
        }
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
