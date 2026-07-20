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
import { getMapProfile } from '@/maps/getMapProfile';
import { DeliveryOpportunity, DeliveryRoute } from './types';
import {
  findOptimalPathAvoidingOpponent,
  getTerrainBuildCost,
  getRouteProgress,
  isRouteComplete,
  getConnectedCities,
} from './analyzer';
import { getCurrentRoute } from './state';
import { hexCoordsEqual, cityEverAcceptsCube, isTrackPartOfCompletedLink } from '@/utils/hexGrid';

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

// ===== 경매 1등 입찰 (Phase II) =====
//
// 1등(선공)의 가치 = "이번 턴 가장 절실한 행동을 남에게 뺏기지 않고 선점하는 가치".
// 절실함 = (내 최선 행동 ΔVP − 차선 행동 ΔVP). 그 행동을 못 받으면 차선으로 떨어지는 손실이다.
// "절실할 때만 적극" 정책: 절실한 행동이 없으면(THRESHOLD 미만) 양보($0~1), 절실하면 $FLOOR~$CAP.

/** 절실함(ΔVP)이 이 미만이면 1등 가치가 낮아 양보(거의 입찰 안 함). 1.0→1.5: 입찰 빈도↓ → 현금 소모↓ */
export const DESPERATION_BID_THRESHOLD = 1.5;
/** 절실할 때 입찰 상한의 하한/상한 ($). $3~5→$2~3로 축소: 입찰 비용↓로 VP 손실 완화(고착 해소는 유지) */
export const FIRST_SEAT_BID_FLOOR = 2;
export const FIRST_SEAT_BID_CAP = 3;
/** 이 절실함(ΔVP) 이상이면 상한($CAP)에 포화 */
export const DESPERATION_BID_SAT = 2.5;
/** Turn Order 행동의 순서 탈환 가치 (현재 꼴찌 기준 최대 ΔVP). 진짜 절실한 행동(engineer 등)보단 작게.
 *  ※ 측정 결론(100시드, 전 구간 스윕): turnOrder 가중치로는 순서 균등화 불가 — 0.1~0.2는 무효(평범한
 *    행동 0.3에 밀려 선택 안 됨), 0.3~0.4는 작동하나 VP 악화+독식 재현(Korea 20.2→10.5/9.4), 1.8은
 *    심한 단조 독식. 0.1(거의 끔)이 최적: 단조 편향 해소 + VP 최고. 잔존 편향(Western 앞순서·Korea P2)은
 *    경매 순서/거점이 원인(turnOrder 무관). */
export const TURN_ORDER_SEAT_VP = 0.1;

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

// ===== 경매 1등 입찰 상한 환산 =====

/**
 * 행동 절실함(최선−차선 ΔVP)을 1등 입찰 상한($)으로 환산.
 *
 * - 절실함 < THRESHOLD: 1등 가치가 낮아 양보 → floor(절실함/λ) ≈ $0~1.
 *   (평범한 턴엔 모두 양보 → 경매 규칙상 순서가 자연 역전되어 순환한다)
 * - 절실함 ≥ THRESHOLD: $FLOOR~$CAP 구간에서 절실함에 비례해 입찰 상한 결정.
 */
export function firstSeatBidCeiling(desperation: number, lambda: number): number {
  const d = Math.max(0, desperation);
  if (d < DESPERATION_BID_THRESHOLD) {
    return Math.floor(d / (lambda || LAMBDA_BASE));
  }
  const t = Math.min(1, d / DESPERATION_BID_SAT);
  return Math.round(FIRST_SEAT_BID_FLOOR + t * (FIRST_SEAT_BID_CAP - FIRST_SEAT_BID_FLOOR));
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
  startDelay: number = 0,
): number {
  const config = getMapAIConfig(state);
  const lambda = cashToVPRate(state, playerId);

  // 영구 income VP (수입 감소 구간 반영)
  const incomeVP = incomeMarginalVP(state, playerId, ownLinks);

  // 잔여 턴 현금흐름: income +1은 이번 턴 Collect Income부터 매턴 $1.
  // startDelay = 배달이 시작되기까지의 지연 턴 수(건설 다턴·엔진 준비) — 그만큼 현금을 못 번다.
  // 즉시 배달(moveGoods 실행 시점) 평가는 delay 0.
  const remainingIncomeTurns = Math.max(0, config.totalTurns - state.currentTurn + 1);
  const cashflowVP = ownLinks * Math.max(0, remainingIncomeTurns - startDelay) * lambda;

  // 상대 income 증가 = 상대 VP +3 → 내 상대적 손해 (N인 정규화)
  const opponentVP = oppLinks * VP_PER_INCOME * opponentWeight(state);

  return incomeVP + cashflowVP - opponentVP;
}

/**
 * 엔진 +1레벨 후 이번 턴 생존 판정 — 단일 소스.
 *
 * engineUpgradeDeltaVP(비관 시나리오)와 moveGoods의 front-load 치명 가드가 같은 수식을
 * 공유한다 (구현이 두 파일에 갈라져 미묘하게 달라 보이던 PR #14 잔여 이슈의 통합).
 *
 * - shortage: 엔진업 후 이번 턴 지출을 현금(−예정 지출)+수입으로 못 막는 부족분 ($1 = income −1)
 * - bankrupt: 그 부족분의 수입 감소로 income이 음수가 되는(=파산 확정) 상황
 *
 * ⚠️ front-load(moveGoods)는 bankrupt만 차단하고 shortage>0은 허용한다 — 저현금 front-load
 * (엔진3 → 장거리 income 회복 경로)까지 막는 광범위 게이트는 파산을 오히려 늘렸다(30시드 실측,
 * CLAUDE.md 기각된 시도 ①). 엄격 가드(shortage>0 차단)는 engineUpgradeDeltaVP 경로 전용.
 */
export function engineUpgradeShortfall(
  state: GameState,
  playerId: PlayerId,
  plannedSpending: number = 0,
): { shortage: number; bankrupt: boolean } {
  const player = state.players[playerId];
  if (!player) return { shortage: Infinity, bankrupt: true };
  const futureExpenses = player.issuedShares + player.engineLevel + 1;
  const shortage = Math.max(
    0,
    futureExpenses - (player.cash - plannedSpending + Math.max(0, player.income)),
  );
  return { shortage, bankrupt: Math.max(0, player.income) - shortage < 0 };
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
  relaxSurvival: boolean = false, // 깊은 배달이 셋업된 Locomotive 업그레이드: 비관(배달 실패) 파산 차단을 페널티로 완화
): number {
  const player = state.players[playerId];
  if (!player) return -Infinity;

  const config = getMapAIConfig(state);
  // 엔진업 결정 상한 (맵별, 기본 = engineMax)
  if (player.engineLevel >= (getMapProfile(state.mapId).aiEngineUpgradeCap ?? config.engineMax)) return -Infinity;

  const lambda = cashToVPRate(state, playerId);

  // 매턴 +$1 비용 (이번 턴 Pay Expenses부터 게임 끝까지)
  const remainingExpenseTurns = Math.max(0, config.totalTurns - state.currentTurn + 1);
  const costVP = remainingExpenseTurns * lambda;

  // 생존 체크(엄격): 예정 지출 없이도 이번 턴 비용에 부족분이 생기면 절대 불가
  if (engineUpgradeShortfall(state, playerId).shortage > 0) return -Infinity;

  // 비관 시나리오(해금 배달 실패 → income 정체) 1턴 시야 생존 시뮬레이션:
  //  - 현금 부족분 $1 = income -1 = -3VP (수입 감소)
  //  - income이 음수로 떨어지면 파산 → 절대 불가 (-Infinity)
  //  - 수입 감소 비용은 "배달 실패 확률(1-prob)"만큼만 기대 비용으로 차감
  // (2턴 시야는 과보수적 — 다음 턴에는 배달/주식 발행 등 회복 수단이 있음)
  let shortfallVP = 0;
  const pessimistic = engineUpgradeShortfall(state, playerId, plannedSpending);
  if (pessimistic.shortage > 0) {
    // 비관 파산 위험: 기본은 -Infinity 차단. 단 relaxSurvival(깊은 배달 셋업)이면 차단 대신 무거운
    // VP 페널티로만 — "배달 실패 가정"은 셋업된 깊은 배달엔 과보수적이므로(사용자 결정: 후반 완화).
    if (pessimistic.bankrupt && !relaxSurvival) return -Infinity;
    shortfallVP = pessimistic.shortage * VP_PER_INCOME;
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
  // 마을 경유 우대로 다링크 체인을 평가 — buildTrack/turnPlan과 동일 경로를 써야 일관됨.
  const preferStops = config.incomeSources.includes('trackCubes') || state.activePlayers.length >= 3;
  const fullPath = findOptimalPathAvoidingOpponent(
    sourceCoord, targetCity.coord, board, playerId, undefined, preferStops
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
  // 사용자 지침: 1~2턴 내 완성 가능한 경로만 목표로 잡는다. 7턴 전체로 낙관하면 먼 경로를
  // 잡았다가 자금·경쟁으로 미완성(0링크)으로 끝나 배달 0이 된다. 짧아도 실제로 완성해서
  // 배달하는 게 income에 유리 (다인 cityCubes). 단 trackCubes는 기존(장거리 깊은 배달) 유지.
  const maxBuildTurns = config.incomeSources.includes('trackCubes')
    ? remainingTurnsIncl
    : Math.min(2, remainingTurnsIncl);
  const timeFeasible = tracksToBuild <= maxBuildTurns * config.buildsPerTurn;
  // 자금: 보유 현금 + 턴당 2주 발행 여력 (보수적 1턴치)
  const fundingCapacity = player.cash + 2 * GAME_CONSTANTS.SHARE_VALUE;
  const fundFeasible = buildCost <= fundingCapacity + Math.max(0, player.income) * remainingTurnsIncl;
  const completable = timeFeasible && fundFeasible;
  if (!completable) {
    return { deltaVP: -Infinity, tracksToBuild, buildCost, completable, expectedDeliveries: 0, fullPath };
  }

  // 실제 A* 경로가 지나는 도시/마을 수 = 완성 시 income (지나는 링크마다 +1).
  // (기존엔 직선거리/3 추정이라 마을·도시 경유로 늘어난 income을 평가에 못 반영했다.)
  const linksOnPath = fullPath.filter(c =>
    board.cities.some(ct => hexCoordsEqual(ct.coord, c)) ||
    board.towns.some(t => hexCoordsEqual(t.coord, c) && t.newCityColor === null)
  ).length - 1;
  const links = Math.max(1, linksOnPath);

  // 3. 배달 가능 턴 수: 완성 시점과 엔진 준비 시점 이후
  const completionTurns = Math.ceil(tracksToBuild / config.buildsPerTurn); // 이번 턴 포함
  const engineDelay = Math.max(0, Math.min(links, config.engineMax) - player.engineLevel);
  if (links > config.engineMax) {
    // 엔진 상한으로 배달 자체가 불가능한 경로
    return { deltaVP: -Infinity, tracksToBuild, buildCost, completable: false, expectedDeliveries: 0, fullPath };
  }
  // 배달 시작 지연(건설 다턴 + 엔진 준비 중 늦은 쪽) — 가동률 판정과 배달당 가치가 함께 쓴다
  const deliveryStartDelay = Math.max(completionTurns - 1, engineDelay);
  const deliverableTurns = remainingTurnsIncl - deliveryStartDelay;
  // ⚠️ 밤낮 같은 타이밍 요소를 여기(deliverableTurns)에 곱하면 안 된다 —
  //    expectedDeliveries = min(deliverableTurns, matchingCubes)에서 큐브 쪽이 늘 병목이라
  //    묻혀 무효가 된다(2026-07-21 실측 VP 변화 0.03). 타이밍은 perDeliveryVP에 곱한다.

  // 4. 기대 배달 횟수: 매칭 큐브 수와 배달 가능 턴 (턴당 1회 보수 가정)
  //   income 원천을 맵별로 일반화 — ① 출발 도시 안의 큐브(튜토리얼 등) +
  //   ② 이 경로 위에 놓인 트랙 큐브 중 도착 도시 색(St. Lucia 헥스큐브 등).
  //   (맵 이름 하드코딩 없이, 보드에 실제로 존재하는 income 원천만 본다)
  // 도착 도시 수요색 매칭 — 한국(동적 색상)은 targetCity.cubes 기반 (cityEverAcceptsCube), 그 외 city.color
  const cityCubes = (sourceCity?.cubes ?? []).filter(cube => cityEverAcceptsCube(targetCity, cube, board)).length;
  const trackCubesOnPath = board.trackTiles.filter(t =>
    t.cube != null && cityEverAcceptsCube(targetCity, t.cube, board) && fullPath.some(pc => hexCoordsEqual(pc, t.coord))
  ).length;
  //   ③ 이 경로 위 마을에 놓인 큐브 중 도착 도시 색 (Western US townCubes) — 경로가 마을을
  //      지나면 그 마을 큐브도 같은 색 도시로 배달 가능 → 경로 가치 가산.
  const townCubesOnPath = config.incomeSources.includes('townCubes')
    ? board.towns.filter(t =>
        t.newCityColor === null &&
        t.cubes.some(c => cityEverAcceptsCube(targetCity, c, board)) &&
        fullPath.some(pc => hexCoordsEqual(pc, t.coord))
      ).length
    : 0;
  //   ※ 기각(2026-07-14, Montréal 100시드): ④ 왕복(역방향) 배달 큐브를 expectedDeliveries에
  //      추가하는 실험 — 전액 인정 VP -2.96→-5.11, 절반 가중 -9.05로 모두 악화(파산 1.22→1.4~1.6).
  //      왕복 낙관이 비싼 도시쌍 과잉 투자·조기 파산을 유발. 왕복 가치는 배달 시점의
  //      moveGoods 후보 평가가 이미 자연 반영하므로 착공 평가엔 넣지 않는다.
  const matchingCubes = cityCubes + trackCubesOnPath + townCubesOnPath;
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
  const profile = getMapProfile(state.mapId);
  // Western US: 동↔서 배달이면 매 배달 +$1 income 보너스를 ΔVP에 반영
  // Southern US: 면화(흰 큐브) 배달 +$1 보너스도 동일하게 반영
  const regionBonus = profile.regionDeliveryBonus(sourceCity?.region, targetCity.region)
    + profile.cubeDeliveryBonus(opp.cubeColor);
  // (deliveryStartDelay는 위 가동률 판정과 공유 — 그 턴 수만큼 현금 흐름을 못 버는 차감에도 사용)
  // 맵별 배달 타이밍 계수 (기본 1 = 항등). 달: 검은 큐브는 매 턴 배달처가 있어 우대,
  // 색 큐브는 목적지가 낮인 격턴에만 가능 — 첫 배달 턴이 밤이면 대기 손실만큼 소폭 할인.
  const timingFactor = profile.aiDeliveryTimingFactor(
    targetCity, opp.cubeColor, state.currentTurn + deliveryStartDelay, state, playerId
  );
  const perDeliveryVP = (deliveryDeltaVP(state, playerId, links, 0, deliveryStartDelay)
    + regionBonus * VP_PER_INCOME) * timingFactor;
  const fundShares = Math.ceil(Math.max(0, buildCost - player.cash) / GAME_CONSTANTS.SHARE_VALUE);
  // ★ 완성 트랙 목표 (맵별, MapProfile.targetCompletedTracks — 현재 Western US만 7): 완성트랙이
  //   목표 미만이면 트랙 VP를 기회비용 없이 정상(1.0) 인정해 경로 완성을 적극 추구한다(완성트랙
  //   =VP·income 동반 상승). 목표 도달 후엔 0.5(기회비용)로 income 효율 우선. 0이면 비활성(기존 0.5).
  const targetTracks = profile.targetCompletedTracks;
  let trackVPFactor = 0.5;
  if (targetTracks > 0) {
    const myCompletedTracks = board.trackTiles.filter(
      t => t.owner === playerId && isTrackPartOfCompletedLink(t.coord, board)
    ).length;
    if (myCompletedTracks < targetTracks) trackVPFactor = 1.0;
  }
  const netTrackVP = tracksToBuild * VP_PER_LINK_TRACK * trackVPFactor;

  // ★ 대륙횡단 철도 활용(Western US): 내 네트워크가 한쪽(서/동) 시작도시를 이미 연결했고
  //   이 경로 목적지가 반대쪽 시작도시면 대륙횡단 달성 → income 즉시 +$4(영구) = 큰 VP.
  //   AI가 이 큰 income 원천을 거의 못 쓰던 것(0.4명/게임)을 적극 노리게 만든다. (미달성 시 1회)
  let transcontinentalVP = 0;
  if (profile.transcontinentalBonus && !player.transcontinental &&
      targetCity.region && profile.isStartingCity(targetCity)) {
    const otherRegion = targetCity.region === 'west' ? 'east' : 'west';
    const connectedCityIds = getConnectedCities(state, playerId);
    const reachesOtherSide = connectedCityIds.some(id => {
      const c = board.cities.find(cc => cc.id === id);
      return c && c.region === otherRegion && profile.isStartingCity(c);
    });
    if (reachesOtherSide) {
      // 1철도 연결 보너스 $4 (영구 income) = 큰 VP. 완성 게이트가 미완성 경로를 이미 막으므로
      // 할인 없이 강하게 평가 — AI가 대륙횡단을 적극 노려 income을 점프시킨다(뒤 순번 회복).
      transcontinentalVP = incomeMarginalVP(state, playerId, 4);
    }
  }

  // 1턴 완성 최우선(사용자 지침): 이번 턴에 완성·배달 가능한 경로를 2턴 완성보다 강하게
  // 우선한다. 완성이 늦을수록 페널티 (1턴=0, 2턴=-4VP). cityCubes 다인만 적용.
  const lateCompletionPenalty = config.incomeSources.includes('trackCubes')
    ? 0
    : Math.max(0, completionTurns - 1) * getMapProfile(state.mapId).lateCompletionPenaltyPerTurn;
  // 경로가 요구하는 엔진 증분 유지비: 엔진 +1레벨 = 매턴 $1 지출. k번째 레벨은 (현재+k)턴부터
  // 게임 끝까지 부담 → Σ_{k=1..d}(남은턴 − k + 1). 링크 수가 많은 경로일수록 숨은 고정비가 크다.
  const engineUpkeepVP = engineDelay > 0
    ? (engineDelay * remainingTurnsIncl - (engineDelay * (engineDelay - 1)) / 2) * lambda
    : 0;
  const deltaVP =
    rho * (expectedDeliveries * perDeliveryVP + netTrackVP)
    + transcontinentalVP
    - buildCost * lambda
    - fundShares * -VP_PER_SHARE
    - engineUpkeepVP
    - lateCompletionPenalty;

  return { deltaVP, tracksToBuild, buildCost, completable, expectedDeliveries, fullPath };
}
