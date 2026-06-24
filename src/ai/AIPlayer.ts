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
import { getCurrentRoute } from './strategy/state';
import { refreshTurnPlan, ensureTurnPlan } from './strategy/turnPlan';
import { getMapAIConfig } from './strategy/mapConfig';

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

  const myTracks = board.trackTiles.filter(t => t.owner === playerId);
  // 그 도시가 해당 색 화물을 받는 수요 도시인지 (동적색 맵=현재 큐브, 그 외=고정 색).
  const acceptsColor = (c: { color?: string | null; cubes: string[] }, color: string) =>
    board.dynamicCityColors ? c.cubes.some(cu => (cu as string) === color) : (c.color as string) === color;

  // ★ 도시화 타일 색 선택 (사용자 지침): "내 철도에 있는(픽업 가능한) 화물색" 중에서,
  // "그 화물의 목적지(같은 색 수요 도시)가 내 철도 기준 멀리 있는(또는 없는) 색"을 우선한다.
  // → 가까이 없는 목적지를 신도시로 신설해 그 화물 배달을 연다. 이미 가까운 그 색 도시가 있으면 중복.
  // 1) 내가 픽업 가능한 화물색별 수 = 내 철도 근처(≤3) 도시 큐브 + 내 트랙 위 큐브 (+헥스큐브: trackCubes 맵)
  const cargoByColor = new Map<string, number>();
  const bumpCargo = (c: string | null | undefined) => { if (c) cargoByColor.set(c, (cargoByColor.get(c) ?? 0) + 1); };
  board.cities.forEach(c => {
    if (myTracks.some(tr => hexDistance(tr.coord, c.coord) <= 3)) c.cubes.forEach(bumpCargo);
  });
  board.trackTiles.forEach(t => { if (t.owner === playerId) bumpCargo(t.cube); });
  board.hexTiles.forEach(h => bumpCargo(h.cube));

  // 2) 색별 목적지 거리: 내 철도 기준 그 색을 받는 수요 도시까지 최소 거리 (없으면 ∞=가장 우선).
  const destDistOf = (color: string): number => {
    if (myTracks.length === 0) return Infinity;
    let best = Infinity;
    board.cities.forEach(c => {
      if (!acceptsColor(c, color)) return;
      const d = Math.min(...myTracks.map(tr => hexDistance(tr.coord, c.coord)));
      if (d < best) best = d;
    });
    return best;
  };

  // ★ 타일의 "예상 신도시 수요색": 동적색+디스플레이 보충 맵(한국)은 신도시 수요색이 tile.color가 아니라
  // placeNewCity가 그 타일 칸(A~H)에서 옮겨오는 디스플레이 큐브로 정해진다 → 그 칸 큐브색으로 평가.
  // (그 외 맵은 [tile.color] 그대로 — 기존 동작 보존)
  const displayCount = getMapProfile(state.mapId).urbanizeFromDisplayCount;
  const useDisplayColor = board.dynamicCityColors && displayCount > 0;
  const columnMapping = useDisplayColor ? getMapData(state.mapId).columnMapping : null;
  const expectedColorsOf = (tileId: string, tileColor: string): string[] => {
    if (!useDisplayColor || !columnMapping) return [tileColor];
    let startIndex = -1, rowCount = 0, slotIdx = 0;
    for (const m of columnMapping) {
      if (m.cityId === tileId) { startIndex = slotIdx; rowCount = m.rowCount; break; }
      slotIdx += m.rowCount;
    }
    if (startIndex < 0) return [];
    const colors: string[] = [];
    for (let i = 0; i < rowCount && colors.length < displayCount; i++) {
      const cube = state.goodsDisplay.slots[startIndex + i];
      if (cube) colors.push(cube as string);
    }
    return colors;
  };

  // 3) 타일 색 점수: 그 타일이 만들 신도시 수요색이 "내 화물색 + 목적지 먼 색"일수록 높음.
  const colorScore = (color: string): number => {
    const cargo = cargoByColor.get(color) ?? 0;
    if (cargo === 0) return -100;                                   // 내 철도에 그 색 화물 없음 → 무의미
    const dd = destDistOf(color);
    const farBonus = dd === Infinity ? 30 : Math.min(30, dd * 5);   // 목적지 멀수록/없을수록 우선
    return cargo * 2 + farBonus;
  };
  let bestTile = availableTiles[0];
  let bestTileScore = -Infinity;
  for (const tile of availableTiles) {
    const colors = expectedColorsOf(tile.id, tile.color as string);
    // 타일이 만들 수요색 중 최고가치로 평가 (한국은 디스플레이 큐브 2개 = 2색 수요 가능)
    const score = colors.length ? Math.max(...colors.map(colorScore)) : -100;
    if (score > bestTileScore) { bestTileScore = score; bestTile = tile; }
  }
  const bestTileColors = expectedColorsOf(bestTile.id, bestTile.color as string);

  // ★ 마을 점수: "이번 턴에 철도로 연결할 수 있는 범위"의 마을만 — 가까울수록 가점 (사용자 지침).
  const areaMulti = state.activePlayers.length >= 3 && !getMapAIConfig(state).incomeSources.includes('trackCubes');
  // 이번 턴 목표 경로(트랙 건설 전 도시화 시점에 이 경로로 연결할 계획) — 그 경로가 지나는 마을 우선
  const planPath = areaMulti ? (ensureTurnPlan(state, playerId).fullPath ?? null) : null;
  const onPlanPath = (t: { coord: HexCoord }) =>
    planPath ? planPath.some(c => hexCoordsEqual(c, t.coord)) : false;
  // ★ 이번 턴에 철도로 연결할 수 있는 범위 = 남은 건설 슬롯 수 (도시화는 build 단계 첫머리라 0개 건설 상태).
  // 마을까지 거리가 이 슬롯을 넘으면 이번 턴에 못 잇는다 → 그런 마을은 도시화 후보에서 제외 (사용자 지침).
  const slots = state.phaseState.maxTracksThisTurn ?? 3;

  let bestTown: { coord: HexCoord } | null = null;
  let bestTownScore = -Infinity;
  for (const town of towns) {
    let score = 0;

    // 1) 연결성: 트랙이 있으면 이번 턴 연결 가능 범위(슬롯) 안의 마을만 허용, 가까울수록 가점.
    if (myTracks.length > 0) {
      const minDist = Math.min(...myTracks.map(t => hexDistance(t.coord, town.coord)));
      if (minDist > slots) continue;                       // 이번 턴 연결 불가 → 도시화 후보 제외
      if (onPlanPath(town)) score += 30;
      if (minDist <= 1) score += 20;                       // 즉시 합류
      else if (minDist <= 2) score += 14;                  // 한두 칸이면 이번 턴 닿음
      else score += Math.max(0, 10 - minDist * 2);         // 슬롯 내 더 먼 곳도 연결 가능(가점만 체감)
    } else {
      // 트랙이 아직 없으면(초반 첫 도시화) 연결 판단 불가 → 도시 생성 자체가 목적, 큐브 근처로만
      if (onPlanPath(town)) score += 30;
    }

    // 2) 큐브 배달 잠재력 (보조): 신도시가 가질 수요색 큐브가 가까이 있으면 배달처로서 가치
    for (const city of board.cities) {
      if (city.cubes.some(c => bestTileColors.includes(c as string))
          && hexDistance(city.coord, town.coord) <= 2) score += 8;
    }
    for (const hex of board.hexTiles) {
      if (hex.cube && bestTileColors.includes(hex.cube as string) && hexDistance(hex.coord, town.coord) <= 3) score += 2;
    }

    if (score > bestTownScore) {
      bestTownScore = score;
      bestTown = town;
    }
  }

  // 트랙이 있는데 이번 턴 연결 가능 범위에 마을이 하나도 없으면 도시화 보류(엉뚱한 먼 곳에 안 만든다).
  if (!bestTown) return null;
  return { townCoord: bestTown.coord, tileId: bestTile.id };
}
