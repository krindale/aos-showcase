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
import { findReachableDestinations, hexCoordsEqual, getNeighborHex, findTrackCubeDeliveries, isTrackPartOfCompletedLink } from '@/utils/hexGrid';
import { debugLog } from '@/utils/debugConfig';
import { getMapProfile } from '@/maps/getMapProfile';
import { planUrbanizationCached } from './urbanization';

/**
 * 사용 가능한 행동 목록 반환 (맵 룰에서 금지된 행동 제외 — 예: St. Lucia의 production)
 */
function getAvailableActions(state: GameState): SpecialAction[] {
  const selectedActions = Object.values(state.players)
    .map(p => p.selectedAction)
    .filter((a): a is SpecialAction => a !== null);

  const disabled = getMapProfile(state.mapId).disabledActions;

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
 * 사용 가능한 행동을 ΔVP 내림차순으로 랭킹 (동점은 TIE_BREAK_ORDER).
 *
 * 행동 선택(decideAction)뿐 아니라 경매(auction.ts의 estimateFirstSeatVP)에서도
 * "1등이면 선점할 절실한 행동"의 가치를 얻기 위해 재사용한다.
 */
export function rankActionsByDeltaVP(
  state: GameState,
  playerId: PlayerId,
  plan: TurnPlan,
): { action: SpecialAction; deltaVP: number }[] {
  return getAvailableActions(state)
    .map(action => ({
      action,
      deltaVP: evaluateActionDeltaVP(state, playerId, action, plan),
    }))
    .sort((a, b) => {
      if (b.deltaVP !== a.deltaVP) return b.deltaVP - a.deltaVP;
      return TIE_BREAK_ORDER.indexOf(a.action) - TIE_BREAK_ORDER.indexOf(b.action);
    });
}

/**
 * 행동 선택 결정 — 모든 후보를 ΔVP로 평가해 최대값 선택
 */
export function decideAction(state: GameState, playerId: PlayerId): SpecialAction {
  const player = state.players[playerId];
  const plan = ensureTurnPlan(state, playerId);
  const ranking = rankActionsByDeltaVP(state, playerId, plan);

  if (ranking.length === 0) {
    console.error('[AI 행동] 선택 가능한 행동 없음');
    return 'turnOrder';
  }
  if (!player) return ranking[0].action;

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
      // 트랙큐브 맵(St. Lucia): 도시 = 배달 목적지. 도시가 많을수록 픽업 큐브가 배달 가능해져
      // income으로 전환된다. 도시화는 income 전제 조건이므로, 매칭 안 된 큐브가 많으면 가치↑.
      // (배달 목적지 부족이 건설→배달 전환율의 핵심 병목)
      if (getMapAIConfig(state).incomeSources.includes('trackCubes')) {
        return evaluateUrbanizationForTrackCubes(state);
      }
      // cityCubes 다인: 도시화 가치를 "실제 배치 계획"과 일치시킨다 (2026-07 사용자 피드백:
      // 타일 색만 보던 구 평가가 매 턴 도시화 남발 + 미연결 신도시 36%의 원인).
      // planUrbanization이 배치할 마을·타일·가치를 함께 계산 — 배치할 곳이 없거나(계획 경로 밖뿐)
      // 신도시 수요색이 이미 가까운 도시로 커버되면(중복 목적지) 소액이라 다른 행동이 이긴다.
      if (state.activePlayers.length >= 3) {
        const urbanPlan = planUrbanizationCached(state, playerId);
        if (!urbanPlan) return 0.2;
        return Math.max(0.2, urbanPlan.deltaVP);
      }
      return 0.2;
    }
    case 'turnOrder': return evaluateTurnOrder(state, playerId);
    default: return 0;
  }
}

/**
 * 트랙큐브 맵(St. Lucia)에서 도시화의 가치 — 배달 목적지(매칭 색 도시) 확충.
 * 아직 도시가 없는 색의 큐브(보드 위 헥스/트랙)가 많을수록, 그 색 도시를 만들면
 * 그 큐브들이 배달 가능해져 income으로 전환된다. (건설→배달 전환율의 핵심 병목 해소)
 */
function evaluateUrbanizationForTrackCubes(state: GameState): number {
  const { board } = state;
  const availableTiles = state.newCityTiles.filter(t => !t.used);
  if (availableTiles.length === 0) return 0.2;
  const existingColors = new Set(board.cities.map(c => c.color));

  // 도시 없는 색별 큐브 수 (헥스 + 트랙)
  const cubesByColor = new Map<string, number>();
  const bump = (c: string | null | undefined) => { if (c) cubesByColor.set(c, (cubesByColor.get(c) ?? 0) + 1); };
  board.hexTiles.forEach(h => bump(h.cube));
  board.trackTiles.forEach(t => bump(t.cube));

  // 만들 수 있는(타일 보유) 색 중, 아직 도시 없고 큐브가 가장 많은 색
  // (더 많은 도시 = 더 많은 배달 목적지 = 더 많은 income 기회 — 공격적 도시화가 유리)
  let bestUnlock = 0;
  for (const tile of availableTiles) {
    if (existingColors.has(tile.color)) continue;
    bestUnlock = Math.max(bestUnlock, cubesByColor.get(tile.color) ?? 0);
  }
  if (bestUnlock === 0) return 0.2; // 새로 열 색 없음 — 도시화 무의미

  // 해금되는 잠재 배달 1건당 대략 income 1 ΔVP 수준 — 보수적으로 일부만 실현 가정.
  const base = Math.min(8, bestUnlock * 1.5);

  // ★ 도시 수에 따른 체감 (사용자 분석: AI가 매 턴 도시화 남발 → 갓 만든 도시에 1링크 배달만 →
  // 깊은 배달 불가). 도시가 늘수록 추가 도시화 가치를 깎아, 라인 확장·깊은 배달을 우선하게 한다.
  // 도시 1개→×1, 2개→×0.6, 3개→×0.4, 4개+→×0.3. (도시화는 income 전제라 0으로는 안 만듦)
  const cityCount = board.cities.length;
  const decay = cityCount <= 1 ? 1 : Math.max(0.3, 1 - (cityCount - 1) * 0.3);
  return base * decay;
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

  // ★ trackCubes 엔진 스케줄 (사용자: "엔진업 중 1개 이상 Locomotive로", "T6엔 최소 4"): 엔진을 공짜
  // 액션으로 미리 올려둔다. move-round를 희생하는 moveGoods front-load보다 우선 — income 손실 없이 엔진 확보.
  // 현재 경로가 엔진을 더 요구하지 않아도(아래 routeLinks 충분 분기) 미래 깊은 배달의 영구 자산으로 평가.
  // 스케줄 floor: T1→2, T2~5→3, T6+→4 (T4 이후 move-round 금지이므로 4는 Locomotive로만 달성).
  // 후반 엔진 4는 깊은 체인(≈5 지원)을 실제로 쓰게 해 income↑·VP↑ (측정: VP −11.7→−8.7).
  // ★ 단 엔진 4 floor는 "내 네트워크에 4링크+ 배달 가능한 깊은 큐브가 있을 때만" 적용 — 체인이 얕게
  //   끝난 게임엔 엔진 4가 순수 비용($1/턴)이라 파산을 유발하므로(파산 11→12 원인), 그땐 floor 3 유지.
  let hasDeepCube = false;
  if (state.currentTurn >= 6 && config.incomeSources.includes('trackCubes')) {
    for (const track of state.board.trackTiles) {
      if (!track.cube || (track.owner !== playerId && track.secondaryOwner !== playerId)) continue;
      if (findTrackCubeDeliveries(state.board, track.id, Infinity, playerId).some(d => d.linkCount >= 4)) {
        hasDeepCube = true; break;
      }
    }
  }
  // 다인 cityCubes: 장거리(4-5링크) 배달이 핵심이므로 T5+ 엔진 floor를 4로 올린다.
  // (사용자 지침: T4까지 move-round로 3, T5+ 는 Locomotive 액션으로만 4-5까지)
  const multiCity = state.activePlayers.length >= 3 && !config.incomeSources.includes('trackCubes');
  const engineFloor = hasDeepCube ? 4
    : (multiCity && state.currentTurn >= 5) ? 4   // 다인 후반: 4링크 장거리 배달 (측정상 최적)
    : state.currentTurn >= 2 ? 3 : 2;
  const frontLoadTarget = Math.min(config.engineMax, engineFloor);
  let locoFrontLoad = 0;
  if ((config.incomeSources.includes('trackCubes') || multiCity)
    && player.engineLevel < frontLoadTarget
    && config.totalTurns - state.currentTurn > 0) {
    // 뒤처짐 정도 + 마감(T6 floor 4) 임박 시 강하게 — urbanization(≤8)을 확실히 이겨 floor 보장.
    const behind = frontLoadTarget - player.engineLevel;
    locoFrontLoad = (state.currentTurn >= 6 ? 12 : 4) + behind * 2;
  }

  if (plan.routeLinks <= player.engineLevel) return locoFrontLoad; // 현재 엔진 충분 → front-load만

  // 실현 시점: 이번 턴 완성 가능하면 같은 턴 배달, 아니면 미래
  const turnsAfterThis = Math.max(0, config.totalTurns - state.currentTurn);
  const completableThisTurn = plan.tracksNeeded <= config.buildsPerTurn;
  if (!completableThisTurn && turnsAfterThis === 0) return locoFrontLoad; // 마지막 턴 + 미래 실현
  // 경로 자체가 남은 턴 안에 완성 불가능하면 업그레이드도 무의미 (단 front-load 자산은 유지)
  const completable = plan.tracksNeeded <= (1 + turnsAfterThis) * config.buildsPerTurn;
  if (!completable) return locoFrontLoad;

  const prob = completableThisTurn ? SAME_TURN_DELIVERY_DISCOUNT : FUTURE_DELIVERY_DISCOUNT;
  const unlockedVP = deliveryDeltaVP(state, playerId, plan.routeLinks, 0);
  // 생존 시나리오에 이번 턴 건설 예산을 반영 (건설 후 현금으로 비용을 감당해야 함).
  // (relaxSurvival은 측정상 엔진이 안 오르고 파산만↑라 미사용 — 병목은 생존체크가 아니라 routeLinks 깊이)
  const value = engineUpgradeDeltaVP(state, playerId, unlockedVP, prob, plan.buildBudget);

  // ★ trackCubes: T4 이후 엔진은 오직 Locomotive로만 올릴 수 있으므로(move-round 금지),
  // 깊은 경로가 엔진을 요구할 때(routeLinks>engine) Locomotive가 건설/도시화에 밀리지 않도록 강화 —
  // "필요에 따라 기관사로 엔진을 4-5까지" (깊은 배달 실현 = income↑ = 주식 스파이럴 탈출).
  const boosted = config.incomeSources.includes('trackCubes') && value > 0 ? value * 3 : value;
  return value === -Infinity ? locoFrontLoad : Math.max(0, boosted, locoFrontLoad);
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
    const base = VP_PER_INCOME * (1 + opponentWeight(state)) / 4;
    // ★ 내 순번이 뒤일수록 Move Goods에서 화물을 선점당하므로 First Move(선수송)로 만회하는
    //   가치가 크다. 꼴찌(rank=n-1)일수록 강하게 — 뒤 순번이 First Move를 잡아 수송·income을 회복.
    const rank = state.playerOrder.indexOf(playerId);
    const n = state.activePlayers.length;
    const rankFactor = n > 1 && rank > 0 ? rank / (n - 1) : 0; // 1번=0, 꼴찌=1
    return base * (1 + 2 * rankFactor); // 뒤 순번일수록 최대 3배
  }

  return 0.2; // 경합 없으면 순서 우위는 미미
}

/**
 * FirstBuild: 내 경로의 미건설 헥스가 상대 트랙과 인접(경합 가능)할 때 선점 가치
 */
function evaluateFirstBuild(state: GameState, playerId: PlayerId, plan: TurnPlan): number {
  if (!plan.fullPath || plan.tracksNeeded === 0) return 0;

  const base = hasContestedBuildHex(state, playerId, plan)
    ? 2 * cashToVPRate(state, playerId) // 막히면 우회 비용(~$2) → 선점 가치
    : 0.3;                              // 경합 없으면 소액

  // ★ 완성철도 목표(targetCompletedTracks, Western US=7) 미달이고 내 순번이 뒤일수록 First Build로
  //   경로를 먼저 깔아 선점·완성하는 가치↑. 뒤 순번은 좋은 헥스를 선점당해 완성철도가 부족하므로
  //   (p6 5.7), 먼저 건설해 완성 경로를 확보하게 한다.
  const target = getMapProfile(state.mapId).targetCompletedTracks;
  if (target > 0) {
    const myCompleted = state.board.trackTiles.filter(
      t => t.owner === playerId && isTrackPartOfCompletedLink(t.coord, state.board)
    ).length;
    if (myCompleted < target) {
      const rank = state.playerOrder.indexOf(playerId);
      const n = state.activePlayers.length;
      const rankFactor = n > 1 && rank > 0 ? rank / (n - 1) : 0; // 1번=0, 꼴찌=1
      // 완성철도 부족분 × 뒤 순번 가중 — 부족할수록·뒤일수록 강하게
      return base + (target - myCompleted) * 0.4 * (1 + rankFactor);
    }
  }
  return base;
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
 * Turn Order: 순서 탈환의 가치 — 내 현재 순번이 뒤일수록 높다.
 *
 * 룰북의 정식 행동(경매에서 무료 패스 1회)을 사람처럼 전략적으로 쓴다:
 * "계속 뒤로 밀리는 사람이 Turn Order를 잡아 순서를 되찾는다" → 순서 고착의 자연 해소.
 * 같은 ΔVP 단위라 engineer(최대 9) 같은 진짜 절실한 행동이 있으면 그게 우선되고,
 * 순서 외엔 절실한 게 없는 뒷순번 플레이어만 Turn Order를 선택하게 된다.
 */
function evaluateTurnOrder(state: GameState, playerId: PlayerId): number {
  const rank = state.playerOrder.indexOf(playerId); // 0 = 1번
  const n = state.activePlayers.length;
  if (n <= 1 || rank <= 0) return 0.1; // 이미 1번이거나 단독이면 순서 탈환 가치 없음
  const seatVP = getMapProfile(state.mapId).turnOrderSeatVP; // 맵별 격리(기본 0.1)
  return seatVP * (rank / (n - 1)); // 꼴찌(rank=n-1)일수록 최대
}

/**
 * Production: 물품 디스플레이에 빈 칸이 있어야 의미 (첫 턴에는 무의미)
 */
function evaluateProduction(state: GameState): number {
  // 마지막 턴: 물품 성장 직후 게임이 끝나 새 큐브를 배달할 기회가 없음
  const config = getMapAIConfig(state);
  if (state.currentTurn >= config.totalTurns) return 0;

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
