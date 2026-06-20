/**
 * AIPlayer 클래스 - 각 AI 플레이어의 독립적인 인스턴스
 *
 * 책임:
 * - 자신만의 전략 상태 관리 (전역 상태 사용 안함)
 * - Phase별 결정 위임
 * - 동적 화물 기반 전략 사용
 */

import { GameState, PlayerId, SpecialAction, HexCoord, NewCityTileId } from '@/types/game';
import { hexDistance } from '@/utils/hexGrid';
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
import { getCurrentRoute } from './strategy/state';
import { refreshTurnPlan } from './strategy/turnPlan';

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
          const placement = decideUrbanizationPlacement(state, this.playerId);
          if (placement) {
            return { type: 'placeNewCity', ...placement };
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


/**
 * 도시화 배치 휴리스틱: 어느 마을에 어떤 색 신규 도시를 놓을까
 *
 * - 타일 색: 보드 위 큐브(헥스/트랙/도시) 중 가장 많은 색의 미사용 타일
 *   → 그 색 큐브들의 배달 목적지가 생겨 income 기회 최대화
 * - 마을: 그 색 큐브가 많은 주변 + 내 트랙과 가까운 마을 우선
 */
export function decideUrbanizationPlacement(
  state: GameState,
  playerId: PlayerId,
): { townCoord: HexCoord; tileId: NewCityTileId } | null {
  const { board } = state;
  const towns = board.towns.filter(t => !t.newCityColor);
  const availableTiles = state.newCityTiles.filter(t => !t.used);
  if (towns.length === 0 || availableTiles.length === 0) return null;

  // 보드 위 큐브 색 분포 (헥스 큐브 + 트랙 큐브 + 도시 큐브)
  const colorCount = new Map<string, number>();
  const bump = (c: string | null | undefined) => {
    if (c) colorCount.set(c, (colorCount.get(c) ?? 0) + 1);
  };
  board.hexTiles.forEach(h => bump(h.cube));
  board.trackTiles.forEach(t => bump(t.cube));
  board.cities.forEach(city => city.cubes.forEach(bump));

  // 이미 같은 색 도시가 있으면 후순위 (목적지 중복)
  const existingColors = new Set(board.cities.map(c => c.color));

  let bestTile = availableTiles[0];
  let bestTileScore = -1;
  for (const tile of availableTiles) {
    const cubes = colorCount.get(tile.color) ?? 0;
    const score = cubes - (existingColors.has(tile.color) ? 100 : 0);
    if (score > bestTileScore) {
      bestTileScore = score;
      bestTile = tile;
    }
  }

  // 마을 점수: 타일 색 큐브와의 근접성 + 내 트랙 근접성
  const myTracks = board.trackTiles.filter(t => t.owner === playerId);
  let bestTown = towns[0];
  let bestTownScore = -Infinity;
  for (const town of towns) {
    let score = 0;
    // 주변 3칸 내 해당 색 큐브 수 (배달 실현 쉬운 위치)
    for (const hex of board.hexTiles) {
      if (hex.cube === bestTile.color && hexDistance(hex.coord, town.coord) <= 3) score += 2;
    }
    for (const track of board.trackTiles) {
      if (track.cube === bestTile.color && hexDistance(track.coord, town.coord) <= 3) score += 2;
    }
    // 내 트랙과의 거리 — 신규 도시를 내 연결망에 "인접"(거리1) 배치하면 그 도시가
    // 연결망에 합류해 하나의 긴 철도가 된다. 멀리 떨어진 도시는 별도 앵커=파편을 만들므로 강하게 억제.
    if (myTracks.length > 0) {
      const minDist = Math.min(...myTracks.map(t => hexDistance(t.coord, town.coord)));
      if (minDist <= 1) score += 20;          // 연결망 인접 = 하나의 철도로 합류 (강하게 우선)
      else score += Math.max(0, 4 - minDist); // 떨어질수록 파편 위험 ↑
    }
    if (score > bestTownScore) {
      bestTownScore = score;
      bestTown = town;
    }
  }

  return { townCoord: bestTown.coord, tileId: bestTile.id };
}
