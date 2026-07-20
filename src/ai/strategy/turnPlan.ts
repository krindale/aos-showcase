/**
 * TurnPlan — 가벼운 턴 계획
 *
 * 턴 시작(issueShares 시점)에 "이번 턴 계획"을 한 번 세우고
 * 이후 Phase들(행동 선택, 주식 발행, 경매, 건설)이 공유합니다.
 * Phase마다 독립적으로 재평가하면서 생기는 턴 내 비일관성을 막는 것이 목적입니다.
 *
 * 재평가 규칙:
 *  - issueShares 시작: 항상 새로 생성 (ensureTurnPlan이 턴 번호로 감지)
 *  - 경매 종료 후: 경로 유지, 예산만 갱신 (refreshBudget)
 *  - buildTrack 직전: 경로 차단 감지 시에만 무효화 (invalidateTurnPlan)
 *
 * 경로 선정 자체는 기존 reevaluateStrategy/state.ts를 재사용하며,
 * plan 갱신은 setCurrentRoute와 자동으로 동기화됩니다 (단일 소스).
 */

import { GameState, PlayerId, HexCoord, GAME_CONSTANTS } from '@/types/game';
import { DeliveryRoute } from './types';
import { getCurrentRoute } from './state';
import { reevaluateStrategy } from './selector';
import {
  analyzeDeliveryOpportunities,
  findOptimalPathAvoidingOpponent,
  getTerrainBuildCost,
  findStopById,
} from './analyzer';
import { getMapAIConfig } from './mapConfig';
import { getMapProfile } from '@/maps/getMapProfile';
import { hexCoordsEqual } from '@/utils/hexGrid';
import { debugLog } from '@/utils/debugConfig';

export interface TurnPlan {
  playerId: PlayerId;
  turn: number;
  /** 이번 턴 목표 경로 (state.ts의 currentRoute와 동기화됨) */
  targetRoute: DeliveryRoute | null;
  /** 목표 경로의 A* 전체 경로 (건설 Phase가 소비) */
  fullPath: HexCoord[] | null;
  /** 경로 완성까지 남은 건설 트랙 수 */
  tracksNeeded: number;
  /** 경로 완성까지 남은 총 건설 비용 (지형별 실비) */
  totalBuildCost: number;
  /** 이번 턴 건설 예산 (경로 순서대로 이번 턴에 지을 트랙들의 비용) */
  buildBudget: number;
  /** 이번 턴 필요 현금 = 건설 예산 + 비용 지불 + 경매 예비금 */
  cashNeeded: number;
  /** 목표 경로의 예상 링크 수 (엔진 필요 레벨 판단용) */
  routeLinks: number;
  /** 경매 입찰 상한 (4단계에서 가치 기반 계산, 그 전까지 예비금 수준) */
  auctionMaxBid: number;
}

/** 플레이어별 턴 계획 저장소 (state.ts와 같은 모듈 레벨 패턴) */
const turnPlans: Map<PlayerId, TurnPlan> = new Map();

/**
 * 현재 턴의 계획 가져오기 — 없거나 턴이 지났으면 새로 생성
 */
export function ensureTurnPlan(state: GameState, playerId: PlayerId): TurnPlan {
  const existing = turnPlans.get(playerId);
  if (existing && existing.turn === state.currentTurn) {
    return existing;
  }
  return refreshTurnPlan(state, playerId);
}

/**
 * 계획 강제 재생성 (턴 시작, 또는 경로 차단으로 무효화된 후)
 */
export function refreshTurnPlan(state: GameState, playerId: PlayerId): TurnPlan {
  const plan = computeTurnPlan(state, playerId);
  turnPlans.set(playerId, plan);

  debugLog.preparation(
    `[TurnPlan] ${playerId} T${plan.turn}: 경로=${plan.targetRoute ? `${plan.targetRoute.from}→${plan.targetRoute.to}` : '없음'}, ` +
    `남은트랙=${plan.tracksNeeded}($${plan.totalBuildCost}), 이번턴예산=$${plan.buildBudget}, 필요현금=$${plan.cashNeeded}, 링크=${plan.routeLinks}`
  );

  return plan;
}

/**
 * 현금 변동(경매 지불 등) 후 예산만 재계산 — 경로는 유지
 */
export function refreshBudget(state: GameState, playerId: PlayerId): TurnPlan {
  const existing = turnPlans.get(playerId);
  if (!existing || existing.turn !== state.currentTurn) {
    return refreshTurnPlan(state, playerId);
  }
  const updated = { ...existing, ...computeBudget(state, playerId, existing.buildBudget) };
  turnPlans.set(playerId, updated);
  return updated;
}

/**
 * 계획 무효화 — 다음 ensureTurnPlan에서 재생성
 */
export function invalidateTurnPlan(playerId: PlayerId, reason: string): void {
  if (turnPlans.delete(playerId)) {
    debugLog.preparation(`[TurnPlan] ${playerId}: 계획 무효화 (${reason})`);
  }
}

/**
 * 모든 계획 초기화 (게임 리셋 시)
 */
export function clearTurnPlans(): void {
  turnPlans.clear();
}

// ===== 내부 계산 =====

/**
 * 경매 + 불확실성 예비금 기본값
 * (경매 지불, 지형 오차, 턴 중 경로 변경 등 계획 외 지출의 충격 흡수 버퍼.
 *  입찰 상한 자체는 4단계에서 가치 기반으로 계산)
 */
const DEFAULT_AUCTION_RESERVE = 4;

function computeBudget(
  state: GameState,
  playerId: PlayerId,
  buildBudget: number,
): Pick<TurnPlan, 'cashNeeded' | 'auctionMaxBid'> {
  const player = state.players[playerId];
  const rawExpenses = player ? player.issuedShares + player.engineLevel + (player.dgel ?? 0) : 0;
  // 맵별: 운영비를 income으로 상계 (기본 false = 전액 계상, 기존 동작). 달은 true —
  // income이 이미 내주는 몫까지 예산에 넣으면 매 턴 발행 캡을 채우는 자기증폭이 생긴다.
  const expenses = getMapProfile(state.mapId).aiPlanExpensesNetOfIncome
    ? Math.max(0, rawExpenses - Math.max(0, player?.income ?? 0))
    : rawExpenses;
  return {
    cashNeeded: buildBudget + expenses + DEFAULT_AUCTION_RESERVE,
    auctionMaxBid: DEFAULT_AUCTION_RESERVE,
  };
}

function computeTurnPlan(state: GameState, playerId: PlayerId): TurnPlan {
  const { board } = state;
  const config = getMapAIConfig(state);

  // 1. 경로 선정 (기존 선택 로직 재사용 — setCurrentRoute와 자동 동기화)
  reevaluateStrategy(state, playerId);
  const targetRoute = getCurrentRoute(playerId);

  let fullPath: HexCoord[] | null = null;
  let tracksNeeded = 0;
  let totalBuildCost = 0;
  let buildBudget = 0;
  let routeLinks = 0;

  if (targetRoute) {
    const sourceCity = findStopById(board, targetRoute.from);
    const targetCity = findStopById(board, targetRoute.to);

    if (sourceCity && targetCity) {
      // 마을 경유 우대(다링크 체인) — vp.estimateRouteVP/buildTrack과 동일 경로로 일관성 유지.
      const preferStops = config.incomeSources.includes('trackCubes') || state.activePlayers.length >= 3;
      const path = findOptimalPathAvoidingOpponent(
        sourceCity.coord, targetCity.coord, board, playerId, undefined, preferStops
      );
      if (path.length >= 2) {
        fullPath = path;

        // 미건설 헥스(도시 아님 + 내 트랙 아님)의 수와 비용
        const unbuiltCosts: number[] = [];
        for (const coord of path) {
          const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
          if (isCity) continue;
          const myTrack = board.trackTiles.some(
            t => t.owner === playerId && hexCoordsEqual(t.coord, coord)
          );
          if (myTrack) continue;
          unbuiltCosts.push(getTerrainBuildCost(coord, board));
        }
        tracksNeeded = unbuiltCosts.length;
        totalBuildCost = unbuiltCosts.reduce((a, b) => a + b, 0);
        // 이번 턴 예산: 건설 슬롯 전체 기준 (Engineer 가능성 +1 포함)
        // 경로에 필요한 트랙이 슬롯보다 적으면, 남는 슬롯은 다음 경로 착공에
        // 쓰이므로 평지 비용으로 추정해 자금을 확보한다.
        const slotsToFund = config.buildsPerTurn + 1;
        const routeCost = unbuiltCosts.slice(0, slotsToFund).reduce((a, b) => a + b, 0);
        const spareSlots = Math.max(0, slotsToFund - unbuiltCosts.length);
        buildBudget = routeCost + spareSlots * GAME_CONSTANTS.PLAIN_TRACK_COST;
      }

      // 목표 경로의 예상 링크 수 (배달 기회 분석에서)
      const finalTo = targetRoute.overallTo || targetRoute.to;
      const opportunities = analyzeDeliveryOpportunities(state);
      const matchingOpp = opportunities.find(opp =>
        opp.sourceCityId === targetRoute.from &&
        (opp.targetCityId === targetRoute.to || opp.targetCityId === finalTo)
      );
      routeLinks = matchingOpp?.distance ?? 1;

      // trackCubes 맵: 경로가 지나는 stop(도시/마을) 수를 엔진 목표로 — 마을 경유로 깊어진 체인의
      // 먼 큐브를 배달하려면 엔진을 그 깊이로 키워야 한다(locomotive/엔진 업그레이드가 이 깊이를 노림).
      if (config.incomeSources.includes('trackCubes') && fullPath) {
        let stops = 0;
        for (const c of fullPath) {
          if (board.cities.some(ct => hexCoordsEqual(ct.coord, c))
            || board.towns.some(t => hexCoordsEqual(t.coord, c) && t.newCityColor === null)) stops++;
        }
        routeLinks = Math.max(routeLinks, Math.min(stops, getMapAIConfig(state).engineMax));
      }
    }
  }

  // 경로가 없어도 운영비는 필요 (건설 예산은 기본 트랙 1개 가정)
  if (!targetRoute) {
    buildBudget = GAME_CONSTANTS.PLAIN_TRACK_COST;
  }

  return {
    playerId,
    turn: state.currentTurn,
    targetRoute,
    fullPath,
    tracksNeeded,
    totalBuildCost,
    buildBudget,
    routeLinks,
    ...computeBudget(state, playerId, buildBudget),
  };
}
