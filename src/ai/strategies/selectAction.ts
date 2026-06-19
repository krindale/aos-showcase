/**
 * Phase III: 행동 선택 전략 (ΔVP 기반)
 *
 * 고정 우선순위 배열 대신, 사용 가능한 각 행동의 "예상 VP 증분(ΔVP)"을
 * 계산해 최대값을 선택합니다. 동점이면 tie-break 순서를 따릅니다.
 *
 *  - engineer:   4번째 트랙으로 경로 완성이 가능해지거나 1턴 조기화될 때 가치
 *  - locomotive: 목표 경로 링크 > 엔진 레벨일 때 해금 배달 가치 − 매턴 비용
 *  - firstMove:  경합 배달(상대도 같은 큐브 배달 가능)이 있을 때 선점 가치
 *  - firstBuild: 내 경로의 미건설 헥스가 상대와 경합할 때 선점 가치
 *  - production/urbanization/turnOrder: 소액 (tie-break 수준)
 */

import { GameState, PlayerId, SpecialAction, GAME_CONSTANTS } from '@/types/game';
import { calculateMinCashReserve } from '../evaluator';
import { getConnectedCities, analyzeDeliveryOpportunities } from '../strategy/analyzer';
import { ensureTurnPlan, TurnPlan } from '../strategy/turnPlan';
import { getMapAIConfig } from '../strategy/mapConfig';
import {
  deliveryDeltaVP,
  engineUpgradeDeltaVP,
  opponentWeight,
  VP_PER_INCOME,
  VP_PER_LINK_TRACK,
  SAME_TURN_DELIVERY_DISCOUNT,
  FUTURE_DELIVERY_DISCOUNT,
  cashToVPRate,
} from '../strategy/vp';
import { findReachableDestinations, hexCoordsEqual, getNeighborHex } from '@/utils/hexGrid';
import { debugLog } from '@/utils/debugConfig';
import { getMapRules } from '@/utils/mapRegistry';

/**
 * 사용 가능한 행동 목록 반환 (맵 룰에서 금지된 행동 제외 — 예: St. Lucia의 production)
 */
function getAvailableActions(state: GameState): SpecialAction[] {
  const selectedActions = Object.values(state.players)
    .map(p => p.selectedAction)
    .filter((a): a is SpecialAction => a !== null);

  const disabled = getMapRules(state.mapId).disabledActions;

  const allActions: SpecialAction[] = [
    'firstMove',
    'firstBuild',
    'engineer',
    'locomotive',
    'urbanization',
    'production',
    'turnOrder',
  ];

  return allActions.filter(a => !selectedActions.includes(a) && !disabled.includes(a));
}

/** 동점 시 선호 순서 (앞이 우선) */
const TIE_BREAK_ORDER: SpecialAction[] = [
  'engineer',
  'firstBuild',
  'firstMove',
  'locomotive',
  'production',
  'urbanization',
  'turnOrder',
];

/**
 * 행동 선택 결정 — 모든 후보를 ΔVP로 평가해 최대값 선택
 */
export function decideAction(state: GameState, playerId: PlayerId): SpecialAction {
  const available = getAvailableActions(state);
  const player = state.players[playerId];

  if (available.length === 0) {
    console.error('[AI 행동] 선택 가능한 행동 없음');
    return 'turnOrder';
  }
  if (!player) return available[0];

  const plan = ensureTurnPlan(state, playerId);

  const ranking = available
    .map(action => ({
      action,
      deltaVP: evaluateActionDeltaVP(state, playerId, action, plan),
    }))
    .sort((a, b) => {
      if (b.deltaVP !== a.deltaVP) return b.deltaVP - a.deltaVP;
      return TIE_BREAK_ORDER.indexOf(a.action) - TIE_BREAK_ORDER.indexOf(b.action);
    });

  const best = ranking[0];
  const routeStr = plan.targetRoute ? `${plan.targetRoute.from}→${plan.targetRoute.to}` : '없음';
  debugLog.preparation(
    `[Phase III: 행동 선택] ${player.name}: ${best.action} (ΔVP=${best.deltaVP.toFixed(2)}, 경로=${routeStr}) ` +
    `[${ranking.map(r => `${r.action}:${r.deltaVP.toFixed(1)}`).join(', ')}]`
  );

  return best.action;
}

/**
 * 행동별 ΔVP 평가
 */
function evaluateActionDeltaVP(
  state: GameState,
  playerId: PlayerId,
  action: SpecialAction,
  plan: TurnPlan,
): number {
  // 도시가 하나도 없으면(St. Lucia 1턴, 도시화 전) 첫 트랙은 도시 인접만 허용되므로 건설 자체가 불가능하고,
  // 완성 링크가 없어 배달도 불가능하다. 건설/이동 행동(firstBuild·firstMove·engineer)은 무의미 → ΔVP 0.
  // (urbanization=도시 생성, locomotive=미래 엔진 자산만 의미 있음)
  if (
    state.board.cities.length === 0 &&
    (action === 'firstBuild' || action === 'firstMove' || action === 'engineer')
  ) {
    return 0;
  }

  switch (action) {
    case 'engineer': return evaluateEngineer(state, playerId, plan);
    case 'locomotive': return evaluateLocomotive(state, playerId, plan);
    case 'firstMove': return evaluateFirstMove(state, playerId);
    case 'firstBuild': return evaluateFirstBuild(state, playerId, plan);
    case 'production': return evaluateProduction(state);
    case 'urbanization': {
      const towns = state.board.towns.filter(t => !t.newCityColor);
      if (towns.length === 0) return 0;
      // 배달 목적지(도시)가 없는 맵(St. Lucia 초기): 도시화는 income의 전제 조건 → 최우선
      if (state.board.cities.length === 0) return 10;
      // 도시가 1개뿐이면 두 번째 목적지의 가치도 큼
      if (state.board.cities.length === 1) return 3;
      return 0.2;
    }
    case 'turnOrder': return 0.1;
    default: return 0;
  }
}

/**
 * Engineer: 이번 턴 4번째 트랙의 가치
 *
 * 핵심 가치는 "경로 완성이 가능해지거나 1턴 빨라지는" 경우.
 * 단순 진행 가속은 소액 (트랙 자체는 λ에 이미 반영된 등가 교환).
 */
function evaluateEngineer(state: GameState, playerId: PlayerId, plan: TurnPlan): number {
  const player = state.players[playerId];
  if (!player || !plan.targetRoute) return 0;

  const config = getMapAIConfig(state);
  const minReserve = calculateMinCashReserve(state, playerId);
  // 4개 건설 자금 게이트 (평균 비용으로 4번째 트랙 추정)
  const avgCost = plan.tracksNeeded > 0 ? plan.totalBuildCost / plan.tracksNeeded : GAME_CONSTANTS.PLAIN_TRACK_COST;
  const fourTrackCost = plan.buildBudget + avgCost;
  if (player.cash < fourTrackCost + minReserve) return 0;

  const turnsAfterThis = Math.max(0, config.totalTurns - state.currentTurn);

  if (plan.tracksNeeded >= 4) {
    const completableWith3 = plan.tracksNeeded <= (1 + turnsAfterThis) * config.buildsPerTurn;
    const completableWith4 = plan.tracksNeeded <= 4 + turnsAfterThis * config.buildsPerTurn;

    // engineer가 완성 자체를 가능하게 함 (예: 마지막 턴에 4트랙 필요)
    if (!completableWith3 && completableWith4) {
      const deliveryVP = deliveryDeltaVP(state, playerId, plan.routeLinks, 0) * SAME_TURN_DELIVERY_DISCOUNT;
      return plan.tracksNeeded * VP_PER_LINK_TRACK + deliveryVP;
    }
    if (!completableWith4) return 0; // 어차피 완성 불가 → 4번째 트랙 무의미

    // 완성 턴 조기화 여부 (이번 턴 4개 vs 3개 후 매턴 buildsPerTurn)
    const turnsToComplete3 = Math.ceil(Math.max(0, plan.tracksNeeded - config.buildsPerTurn) / config.buildsPerTurn);
    const turnsToComplete4 = Math.ceil(Math.max(0, plan.tracksNeeded - 4) / config.buildsPerTurn);
    if (turnsToComplete4 < turnsToComplete3) {
      // 배달 시작 1턴 조기화 ≈ 배달 1회 조기 실현
      return deliveryDeltaVP(state, playerId, plan.routeLinks, 0) * FUTURE_DELIVERY_DISCOUNT;
    }
    return 0.5; // 4번째 트랙이 경로 진행에 직접 기여
  }

  // 현 경로에 4번째 트랙이 필요 없어도, 남은 건설 슬롯으로 다음 경로를 시작할 수 있음
  // (경로 완성 후 잔여 건설 기회는 buildTrack의 새 경로 탐색이 활용)
  if (plan.tracksNeeded >= 1 && turnsAfterThis > 0) {
    const opportunities = analyzeDeliveryOpportunities(state);
    const otherOpportunities = opportunities.filter(opp =>
      !(opp.sourceCityId === plan.targetRoute!.from && opp.targetCityId === plan.targetRoute!.to)
    );
    if (otherOpportunities.length > 0) {
      return 1.0; // 다음 경로 조기 착공 가치
    }
  }

  return 0.2; // 진행 가속 소액
}

/**
 * Locomotive: 목표 경로 배달을 해금하는 엔진 업그레이드
 */
function evaluateLocomotive(state: GameState, playerId: PlayerId, plan: TurnPlan): number {
  const player = state.players[playerId];
  if (!player) return 0;

  const config = getMapAIConfig(state);

  // 도시가 0개라 이번 턴 건설 자체가 불가능할 때(St. Lucia 1턴, 도시화 빼앗김) —
  // 건설 행동은 모두 0이므로, 엔진 업그레이드를 다음 턴 이후 배달을 위한 영구 자산으로 평가한다.
  if (state.board.cities.length === 0) {
    const turnsLeft = config.totalTurns - state.currentTurn;
    return player.engineLevel < 6 && turnsLeft > 0 ? 0.5 : 0;
  }

  if (plan.routeLinks <= player.engineLevel) return 0; // 현재 엔진으로 충분

  // 실현 시점: 이번 턴 완성 가능하면 같은 턴 배달, 아니면 미래
  const turnsAfterThis = Math.max(0, config.totalTurns - state.currentTurn);
  const completableThisTurn = plan.tracksNeeded <= config.buildsPerTurn;
  if (!completableThisTurn && turnsAfterThis === 0) return 0; // 마지막 턴 + 미래 실현 = 무가치
  // 경로 자체가 남은 턴 안에 완성 불가능하면 업그레이드도 무의미
  const completable = plan.tracksNeeded <= (1 + turnsAfterThis) * config.buildsPerTurn;
  if (!completable) return 0;

  const prob = completableThisTurn ? SAME_TURN_DELIVERY_DISCOUNT : FUTURE_DELIVERY_DISCOUNT;
  const unlockedVP = deliveryDeltaVP(state, playerId, plan.routeLinks, 0);
  // 생존 시나리오에 이번 턴 건설 예산을 반영 (건설 후 현금으로 비용을 감당해야 함)
  const value = engineUpgradeDeltaVP(state, playerId, unlockedVP, prob, plan.buildBudget);

  return value === -Infinity ? 0 : Math.max(0, value);
}

/**
 * FirstMove: 경합 배달이 있을 때 선점 가치
 * (내 income 확보 + 상대 income 차단)
 */
function evaluateFirstMove(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;

  // 배달 가능한 네트워크가 없으면 무의미
  const connectedCities = getConnectedCities(state, playerId);
  if (connectedCities.length < 2) return 0;

  if (hasContestedDelivery(state, playerId)) {
    // 선점 가치: 경합 큐브를 빼앗겨도 보통 다른 배달이 가능하므로
    // 실제 스윙은 income 1 차이의 절반 수준으로 평가
    return VP_PER_INCOME * (1 + opponentWeight(state)) / 4;
  }

  return 0.2; // 경합 없으면 순서 우위는 미미
}

/**
 * FirstBuild: 내 경로의 미건설 헥스가 상대 트랙과 인접(경합 가능)할 때 선점 가치
 */
function evaluateFirstBuild(state: GameState, playerId: PlayerId, plan: TurnPlan): number {
  if (!plan.fullPath || plan.tracksNeeded === 0) return 0;

  if (hasContestedBuildHex(state, playerId, plan)) {
    // 막히면 우회 비용(~$2) 발생 → 선점 가치 ≈ 우회 비용 × λ
    return 2 * cashToVPRate(state, playerId);
  }

  return 0.3; // 경합 없으면 소액 (건설 순서 우위)
}

/**
 * 내 경로의 미건설 헥스가 상대 트랙과 인접해 경합 가능한지
 * (auction의 1등 순서 가치 평가에서도 재사용)
 */
export function hasContestedBuildHex(state: GameState, playerId: PlayerId, plan: TurnPlan): boolean {
  if (!plan.fullPath) return false;
  const { board } = state;

  for (const coord of plan.fullPath) {
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    if (isCity) continue;
    const occupied = board.trackTiles.some(t => hexCoordsEqual(t.coord, coord));
    if (occupied) continue;

    // 미건설 헥스가 상대 트랙과 인접 → 상대가 막거나 선점할 수 있음
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighborHex(coord, edge);
      const oppTrack = board.trackTiles.some(
        t => t.owner !== null && t.owner !== playerId && hexCoordsEqual(t.coord, neighbor)
      );
      if (oppTrack) return true;
    }
  }

  return false;
}

/**
 * Production: 물품 디스플레이에 빈 칸이 있어야 의미 (첫 턴에는 무의미)
 */
function evaluateProduction(state: GameState): number {
  const hasEmptySlot = state.goodsDisplay.slots.some(s => s === null);
  return hasEmptySlot ? 0.3 : 0;
}

/**
 * 나와 상대가 같은 큐브를 같은 목적지로 배달할 수 있는지 (경합 배달 존재 여부)
 * (auction의 1등 순서 가치 평가에서도 재사용)
 */
export function hasContestedDelivery(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player) return false;

  const { board } = state;
  const opponents = state.activePlayers.filter(id => id !== playerId);

  for (const city of board.cities) {
    for (const cubeColor of city.cubes) {
      const myReach = findReachableDestinations(
        city.coord, board, playerId, player.engineLevel, cubeColor
      );
      if (myReach.length === 0) continue;

      for (const oppId of opponents) {
        const opp = state.players[oppId];
        if (!opp || opp.eliminated) continue;
        const oppReach = findReachableDestinations(
          city.coord, board, oppId, opp.engineLevel, cubeColor
        );
        if (oppReach.some(d => myReach.some(m => hexCoordsEqual(m.coord, d.coord)))) {
          return true;
        }
      }
    }
  }

  return false;
}
