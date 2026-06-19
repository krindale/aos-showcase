/**
 * VP 환산기 (ΔVP 공통 화폐)
 *
 * 모든 Phase의 의사결정을 "예상 VP 증분(ΔVP)" 단위로 통일하기 위한 순수 함수 모음.
 *
 * 룰북 VP 공식: income × 3 + 완성된 링크의 트랙 구간 × 1 - 발행 주식 × 3
 *  - income +1          = +3 VP (영구: income 트랙은 게임 끝까지 유지)
 *  - 완성 링크 트랙 1개 = +1 VP, 미완성 트랙 = 0 VP
 *  - 주식 1주           = -3 VP + 매턴 $1 비용
 *  - 돈 자체            = 0 VP (게임 종료 시 무가치, 도구일 뿐)
 *
 * 모든 튜닝 상수는 이 파일 상단에 모아둔다.
 * 게임 파라미터(엔진 상한, 턴 수)는 MapAIConfig에서 주입 — 맵 하드코딩 금지.
 */

import { GameState, PlayerId, GamePhase, HexCoord, GAME_CONSTANTS } from '@/types/game';
import { getMapAIConfig } from './mapConfig';
import { DeliveryOpportunity, DeliveryRoute } from './types';
import {
  findOptimalPathAvoidingOpponent,
  getTerrainBuildCost,
  getRouteProgress,
  isRouteComplete,
} from './analyzer';
import { getCurrentRoute } from './state';
import { hexCoordsEqual } from '@/utils/hexGrid';

// ===== VP 환산 상수 =====
export const VP_PER_INCOME = 3;
export const VP_PER_LINK_TRACK = 1;
export const VP_PER_SHARE = -3;

/**
 * 현금 $1의 한계 VP 가치 (λ 기본값)
 * 근거: 평지 트랙 $2 = 완성 시 +1 VP → 0.5 VP/$.
 * 베이스라인 스윕 측정(0.3:7.28 / 0.4:9.88 / 0.5:10.10 / 0.6:9.28)으로 0.5 확정.
 */
export const LAMBDA_BASE = 0.5;

/** 미래 배달(다음 턴 이후) 실현 확률 할인 — 상대 방해/화물 소진 리스크 */
export const FUTURE_DELIVERY_DISCOUNT = 0.7;

/** 같은 턴 내 실현 가능한 배달의 할인 (round 1 업그레이드 → round 2 배달) */
export const SAME_TURN_DELIVERY_DISCOUNT = 0.9;

// ===== 수입 감소 (룰북 Phase VIII) =====

/** income 위치에서 매턴 깎이는 수입 감소량 */
export function incomeReductionAt(income: number): number {
  if (income >= 50) return 10;
  if (income >= 41) return 8;
  if (income >= 31) return 6;
  if (income >= 21) return 4;
  if (income >= 11) return 2;
  return 0;
}

/**
 * income +gain의 한계 VP
 *
 * 기본은 gain × 3이지만, 수입 감소 구간 경계를 넘으면 남은 턴 동안
 * 매턴 추가로 깎이는 income(= VP)을 차감한다.
 * 튜토리얼(income < 11)에서는 자연히 gain × 3 그대로 — 큰 맵 대비 로직.
 */
export function incomeMarginalVP(state: GameState, playerId: PlayerId, gain: number = 1): number {
  const player = state.players[playerId];
  if (!player || gain <= 0) return 0;

  const config = getMapAIConfig(state);
  const remainingReductions = Math.max(0, config.totalTurns - state.currentTurn + 1);

  const before = Math.max(0, player.income);
  const after = before + gain;
  // 구간 상승으로 매턴 추가 감소가 생기면 그만큼 income이 도로 깎임 (income 1 = 3VP)
  const extraReductionPerTurn = incomeReductionAt(after) - incomeReductionAt(before);
  const lostIncome = Math.min(gain, extraReductionPerTurn * remainingReductions);

  return (gain - Math.max(0, lostIncome)) * VP_PER_INCOME;
}

// ===== 현금의 한계 가치 (λ) =====

/** buildTrack 이전(건설 기회가 남은) Phase 집합 */
const PHASES_BEFORE_BUILD: GamePhase[] = [
  'issueShares',
  'determinePlayerOrder',
  'selectActions',
  'buildTrack',
];

/**
 * 이번 턴을 포함해 남은 "건설 기회가 있는 턴" 수
 * 현재 Phase가 buildTrack 이후면 이번 턴 건설 기회는 소진된 것으로 본다.
 */
export function remainingBuildTurns(state: GameState): number {
  const config = getMapAIConfig(state);
  const futureTurns = Math.max(0, config.totalTurns - state.currentTurn);
  const thisTurnBuildable = PHASES_BEFORE_BUILD.includes(state.currentPhase) ? 1 : 0;
  return futureTurns + thisTurnBuildable;
}

/**
 * 현금 $1의 한계 VP 가치 λ
 *
 * 건설 기회가 남아있으면 LAMBDA_BASE, 더 이상 돈을 VP로 바꿀 기회가 없으면 0.
 * (돈은 게임 종료 시 무가치이므로, 마지막 턴 건설 이후의 현금은 가치가 없다)
 */
export function cashToVPRate(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player || player.eliminated) return 0;

  return remainingBuildTurns(state) > 0 ? LAMBDA_BASE : 0;
}

// ===== 상대 견제 가중치 =====

/**
 * 상대 income +1이 내 상대적 순위에 주는 피해 가중치
 * N인 게임에서 특정 상대 1명의 이득은 1/(N-1)로 정규화 (2인전 = 1.0)
 */
export function opponentWeight(state: GameState): number {
  const n = state.activePlayers.length;
  return n > 1 ? 1 / (n - 1) : 0;
}

// ===== 의사결정용 ΔVP =====

/**
 * 배달 1회의 ΔVP
 *
 * @param ownLinks 내 소유 링크 수 (각각 내 income +1)
 * @param oppLinks 상대 소유 링크 수 (각각 상대 income +1 — 상대를 도와줌)
 */
export function deliveryDeltaVP(
  state: GameState,
  playerId: PlayerId,
  ownLinks: number,
  oppLinks: number,
): number {
  const config = getMapAIConfig(state);
  const lambda = cashToVPRate(state, playerId);

  // 영구 income VP (수입 감소 구간 반영)
  const incomeVP = incomeMarginalVP(state, playerId, ownLinks);

  // 잔여 턴 현금흐름: income +1은 이번 턴 Collect Income부터 매턴 $1
  const remainingIncomeTurns = Math.max(0, config.totalTurns - state.currentTurn + 1);
  const cashflowVP = ownLinks * remainingIncomeTurns * lambda;

  // 상대 income 증가 = 상대 VP +3 → 내 상대적 손해 (N인 정규화)
  const opponentVP = oppLinks * VP_PER_INCOME * opponentWeight(state);

  return incomeVP + cashflowVP - opponentVP;
}

/**
 * 엔진 +1레벨의 ΔVP
 *
 * @param unlockedDeliveryVP 업그레이드로 해금되는 배달의 ΔVP (호출자가 deliveryDeltaVP로 계산)
 * @param realizationProb 해금 배달의 실현 확률 (같은 턴 실현=0.9, 다음 턴 이후=0.7)
 * @param plannedSpending 이번 턴 예정된 추가 지출 (건설 예산 등 — 생존 시나리오에 반영)
 */
export function engineUpgradeDeltaVP(
  state: GameState,
  playerId: PlayerId,
  unlockedDeliveryVP: number,
  realizationProb: number = FUTURE_DELIVERY_DISCOUNT,
  plannedSpending: number = 0,
): number {
  const player = state.players[playerId];
  if (!player) return -Infinity;

  const config = getMapAIConfig(state);
  if (player.engineLevel >= config.engineMax) return -Infinity;

  const lambda = cashToVPRate(state, playerId);

  // 매턴 +$1 비용 (이번 턴 Pay Expenses부터 게임 끝까지)
  const remainingExpenseTurns = Math.max(0, config.totalTurns - state.currentTurn + 1);
  const costVP = remainingExpenseTurns * lambda;

  // 생존 체크: 업그레이드 후 이번 턴 비용을 감당 못 하면 절대 불가
  const futureExpenses = player.issuedShares + (player.engineLevel + 1);
  if (player.cash + Math.max(0, player.income) < futureExpenses) return -Infinity;

  // 비관 시나리오(해금 배달 실패 → income 정체) 1턴 시야 생존 시뮬레이션:
  //  - 현금 부족분 $1 = income -1 = -3VP (수입 감소)
  //  - income이 음수로 떨어지면 파산 → 절대 불가 (-Infinity)
  //  - 수입 감소 비용은 "배달 실패 확률(1-prob)"만큼만 기대 비용으로 차감
  // (2턴 시야는 과보수적 — 다음 턴에는 배달/주식 발행 등 회복 수단이 있음)
  let shortfallVP = 0;
  const pessimisticCash = player.cash - plannedSpending + Math.max(0, player.income) - futureExpenses;
  if (pessimisticCash < 0) {
    const incomeAfterReduction = Math.max(0, player.income) + pessimisticCash;
    if (incomeAfterReduction < 0) return -Infinity; // 파산 위험은 확률과 무관하게 차단
    shortfallVP = -pessimisticCash * VP_PER_INCOME;
  }

  return unlockedDeliveryVP * realizationProb - costVP - shortfallVP * (1 - realizationProb);
}

// ===== 경로(배달 기회)의 기대 ΔVP =====

export interface RouteVPEstimate {
  /** 경로의 기대 ΔVP (완성 불가능하면 -Infinity) */
  deltaVP: number;
  /** 완성까지 남은 건설 트랙 수 */
  tracksToBuild: number;
  /** 남은 건설 비용 (지형별 실비) */
  buildCost: number;
  /** 남은 턴 안에 완성 + 자금 조달이 가능한가 */
  completable: boolean;
  /** 기대 배달 횟수 (남은 턴과 매칭 큐브 수에서 유도) */
  expectedDeliveries: number;
  /** A* 전체 경로 */
  fullPath: HexCoord[] | null;
}

/**
 * 배달 기회의 기대 ΔVP 추정 — scoreOpportunity의 ΔVP 대체물
 *
 * 핵심 원칙: 미완성 트랙은 0VP. 남은 턴 안에 완성할 수 없는 경로는 -Infinity로
 * 원천 배제해 산발 건설을 차단한다.
 *
 *   deltaVP = ρ × (기대배달 × 배달ΔVP + 완성트랙 VP)
 *           − 건설비 × λ − 조달 주식 비용
 *   ρ: 경쟁 할인 (상대가 같은 경로를 노리거나 이미 진행 중이면 가치 하락)
 */
export function estimateRouteVP(
  state: GameState,
  playerId: PlayerId,
  opp: DeliveryOpportunity,
): RouteVPEstimate {
  const player = state.players[playerId];
  const { board } = state;
  const config = getMapAIConfig(state);

  const none: RouteVPEstimate = {
    deltaVP: -Infinity, tracksToBuild: 0, buildCost: 0,
    completable: false, expectedDeliveries: 0, fullPath: null,
  };
  if (!player) return none;

  const targetCity = board.cities.find(c => c.id === opp.targetCityId);
  if (!targetCity) return none;
  // 출발은 도시(튜토리얼) 또는 트랙 위 큐브 위치(St. Lucia) — sourceCoord로 일반화
  const sourceCity = board.cities.find(c => c.id === opp.sourceCityId); // 트랙 큐브 출발이면 null
  const sourceCoord = opp.sourceCoord;

  // 1. A* 경로와 남은 건설량/비용 (출발: 도시 또는 트랙 큐브 위치)
  const fullPath = findOptimalPathAvoidingOpponent(
    sourceCoord, targetCity.coord, board, playerId
  );
  if (fullPath.length < 2) return none;

  let tracksToBuild = 0;
  let buildCost = 0;
  for (const coord of fullPath) {
    if (board.cities.some(c => hexCoordsEqual(c.coord, coord))) continue;
    if (board.trackTiles.some(t => t.owner === playerId && hexCoordsEqual(t.coord, coord))) continue;
    tracksToBuild++;
    buildCost += getTerrainBuildCost(coord, board);
  }

  // 2. 완성 가능성 게이트 (시간 + 자금)
  const remainingTurnsIncl = Math.max(0, config.totalTurns - state.currentTurn + 1);
  const timeFeasible = tracksToBuild <= remainingTurnsIncl * config.buildsPerTurn;
  // 자금: 보유 현금 + 턴당 2주 발행 여력 (보수적 1턴치)
  const fundingCapacity = player.cash + 2 * GAME_CONSTANTS.SHARE_VALUE;
  const fundFeasible = buildCost <= fundingCapacity + Math.max(0, player.income) * remainingTurnsIncl;
  const completable = timeFeasible && fundFeasible;
  if (!completable) {
    return { deltaVP: -Infinity, tracksToBuild, buildCost, completable, expectedDeliveries: 0, fullPath };
  }

  const links = opp.distance; // 이미 "예상 링크 수"

  // 3. 배달 가능 턴 수: 완성 시점과 엔진 준비 시점 이후
  const completionTurns = Math.ceil(tracksToBuild / config.buildsPerTurn); // 이번 턴 포함
  const engineDelay = Math.max(0, Math.min(links, config.engineMax) - player.engineLevel);
  if (links > config.engineMax) {
    // 엔진 상한으로 배달 자체가 불가능한 경로
    return { deltaVP: -Infinity, tracksToBuild, buildCost, completable: false, expectedDeliveries: 0, fullPath };
  }
  const deliverableTurns = remainingTurnsIncl - Math.max(completionTurns - 1, engineDelay);

  // 4. 기대 배달 횟수: 매칭 큐브 수와 배달 가능 턴 (턴당 1회 보수 가정)
  //   income 원천을 맵별로 일반화 — ① 출발 도시 안의 큐브(튜토리얼 등) +
  //   ② 이 경로 위에 놓인 트랙 큐브 중 도착 도시 색(St. Lucia 헥스큐브 등).
  //   (맵 이름 하드코딩 없이, 보드에 실제로 존재하는 income 원천만 본다)
  const cityCubes = (sourceCity?.cubes ?? []).filter(cube => cube === targetCity.color).length;
  const trackCubesOnPath = board.trackTiles.filter(t =>
    t.cube === targetCity.color && fullPath.some(pc => hexCoordsEqual(pc, t.coord))
  ).length;
  const matchingCubes = cityCubes + trackCubesOnPath;
  const expectedDeliveries = Math.max(0, Math.min(deliverableTurns, matchingCubes));

  // 5. 경쟁 할인 ρ
  let rho = 1.0;
  const route: DeliveryRoute = { from: opp.sourceCityId, to: opp.targetCityId, priority: 1 };
  // 타사 트랙 포함 이미 완성된 경로: 평행 건설은 보통 비효율
  if (isRouteComplete(state, route)) {
    rho *= 0.4;
  }
  for (const oppId of state.activePlayers) {
    if (oppId === playerId) continue;
    const oppRoute = getCurrentRoute(oppId);
    if (oppRoute) {
      const sameRoute =
        (oppRoute.from === route.from && oppRoute.to === route.to) ||
        (oppRoute.from === route.to && oppRoute.to === route.from);
      if (sameRoute) { rho *= 0.4; continue; }
      if (oppRoute.from === route.from) rho *= 0.7; // 같은 출발지 → 건설 경합
    }
    const progFwd = getRouteProgress(state, oppId, route);
    const progRev = getRouteProgress(state, oppId, { from: route.to, to: route.from, priority: 1 });
    if (Math.max(progFwd, progRev) > 0.3) rho *= 0.6;
  }

  // 6. ΔVP 합산
  // 트랙 VP는 건설 슬롯의 기회비용을 차감해 절반만 인정:
  // 트랙 1개를 이 경로에 쓰면 다른 경로의 트랙 VP를 벌 기회를 잃는다.
  // (안 그러면 "트랙이 많이 필요한 먼 경로"가 가까운 경로보다 점수가 높아지는 왜곡 발생)
  const lambda = cashToVPRate(state, playerId);
  const perDeliveryVP = deliveryDeltaVP(state, playerId, links, 0);
  const fundShares = Math.ceil(Math.max(0, buildCost - player.cash) / GAME_CONSTANTS.SHARE_VALUE);
  const netTrackVP = tracksToBuild * VP_PER_LINK_TRACK * 0.5;

  const deltaVP =
    rho * (expectedDeliveries * perDeliveryVP + netTrackVP)
    - buildCost * lambda
    - fundShares * -VP_PER_SHARE;

  return { deltaVP, tracksToBuild, buildCost, completable, expectedDeliveries, fullPath };
}
