/**
 * Phase IV: 트랙 건설 전략
 *
 * AI가 선택한 전략의 목표 경로를 향해 트랙을 건설합니다.
 */

import { GameState, PlayerId, HexCoord, GAME_CONSTANTS, TRACK_REPLACE_COSTS } from '@/types/game';
import { calculateMinCashReserve } from '../evaluator';
import {
  validateFirstTrackRule,
  validateTrackConnection,
  isTrackPartOfCompletedLink,
  stationInMasterNetwork,
} from '@/utils/trackValidation';
import { hexCoordsEqual, hexDistance, getNeighborHex, getOppositeEdge, playerEdgesAtTrack, cityEverAcceptsCube } from '@/utils/hexGrid';
import { getCurrentRoute, getCurrentRouteState, setCurrentRoute, incrementInvestedTracks } from '../strategy/state';
import { getNextTargetRoute, findNextTargetRoute, getTopPriorityRoutes } from '../strategy/selector';
import { getMapAIConfig } from '../strategy/mapConfig';
import { getMapProfile } from '@/maps/getMapProfile';
import {
  getConnectedCities,
  isRouteComplete,
  clearPathCache,
  findOptimalPathAvoidingOpponent,
  getEdgeBetweenHexes,
  findStopById,
  analyzeDeliveryOpportunities,
} from '../strategy/analyzer';
import { estimateRouteVP } from '../strategy/vp';
import type { DeliveryRoute } from '../strategy/types';
import { debugLog } from '@/utils/debugConfig';

export type TrackBuildDecision =
  | { action: 'build'; coord: HexCoord; edges: [number, number] }
  | { action: 'buildComplex'; coord: HexCoord; edges: [number, number]; trackType: 'crossing' | 'coexist' }
  | { action: 'buildSpur'; townCoord: HexCoord } // 마을 가닥 단독 건설 (미연결 트랙의 연결 완성)
  | { action: 'skip' }; // 건설 스킵

// ===== 모듈 레벨: 건설 실패 좌표 추적 (턴 기반 자동 초기화) =====
const failedBuildCoords: Map<string, { turn: number; coords: HexCoord[] }> = new Map();

export function addFailedBuildCoord(playerId: PlayerId, coord: HexCoord, currentTurn: number) {
  let entry = failedBuildCoords.get(playerId);
  if (!entry || entry.turn !== currentTurn) {
    // 새 턴이면 이전 실패 좌표 자동 초기화
    entry = { turn: currentTurn, coords: [] };
    failedBuildCoords.set(playerId, entry);
  }
  entry.coords.push(coord);
}

function isFailedCoord(playerId: PlayerId, coord: HexCoord, currentTurn: number): boolean {
  const entry = failedBuildCoords.get(playerId);
  if (!entry || entry.turn !== currentTurn) return false;
  return entry.coords.some(c => hexCoordsEqual(c, coord));
}

/**
 * 트랙 건설 결정
 *
 * 전략:
 * 1. 건설 가능한 모든 위치 탐색
 * 2. 각 위치의 전략적 가치 평가 (기본 + 경로 점수)
 * 3. 비용 대비 가치가 높은 위치 선택
 * 4. 현금이 부족하면 건설 스킵
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 건설 결정
 */
export function decideBuildTrack(state: GameState, playerId: PlayerId): TrackBuildDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'skip' };

  // ===== 0. 통과 마을 연결 (사용자 지적: 마을 미연결로 끝내지 말 것) — guard보다 먼저 =====
  // 내 트랙이 2변 이상 닿은 마을은 가닥 연결 시 through-link가 완성된다(깊은 배달의 전제).
  // 새 fragment 타일을 깔기 전에 이 링크부터 완성한다. 특히 이번 턴 이미 그 마을을 연결했다면
  // 추가 변 가닥은 0카운트(무료)라 3/3에서도 가능 — (7,1) 연결 후 (6,0)으로 새 연결이 생긴 경우를 같은 턴에 메움.
  if (player.cash >= 1 /* TOWN_SPUR_COST */) {
    const passThroughTown = findPassThroughDanglingTown(state, playerId);
    if (passThroughTown) {
      const spurredThisTurn = (state.board.townSpurs ?? []).some(
        sp => hexCoordsEqual(sp.townCoord, passThroughTown) && sp.owner === playerId && sp.builtTurn === state.currentTurn
      );
      const townCount = spurredThisTurn ? 0 : 1; // 이미 이번 턴 연결한 마을이면 추가 변은 무료
      if (state.phaseState.builtTracksThisTurn + townCount <= state.phaseState.maxTracksThisTurn) {
        debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player.name}: 통과 마을 가닥 연결 (${passThroughTown.col},${passThroughTown.row})${townCount === 0 ? ' [무료]' : ''}`);
        return { action: 'buildSpur', townCoord: passThroughTown };
      }
    }
  }

  // 이미 이번 턴 트랙 건설 완료 확인 (무료 통과-마을 연결은 위에서 이미 처리됨)
  if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
    debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player.name}: 이번 턴 건설 완료`);
    return { action: 'skip' };
  }

  // ===== 1. 타일 건설 우선 (수익 위해 타일을 최대한 — 마을 가닥은 타일 후순위로) =====
  // 마을에 닿아도 가닥은 자동 생성되지 않으므로(미연결), 가닥 연결은 타일을 다 짓고
  // 남는 카운트나 다음 턴에 처리한다. 타일 비용 이상일 때만 타일 건설을 시도한다.
  if (player.cash >= GAME_CONSTANTS.PLAIN_TRACK_COST) {

  // ===== 1. 이번 턴 목표 경로 결정 =====
  let targetRoute: DeliveryRoute | null;

  if (state.phaseState.builtTracksThisTurn > 0) {
    // 연속 건설: 기존 경로 유지 (경로 커밋 — 미완성 트랙은 0VP이므로 완성이 거의 항상 최적)
    targetRoute = getCurrentRoute(playerId);
    debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player.name}: 연속 건설 - 기존 경로 유지 (${targetRoute?.from}→${targetRoute?.to})`);
  } else {
    // 첫 건설: 이전 턴 경로가 유효하면 유지, 아니면 새로 탐색
    clearPathCache();
    targetRoute = resolveTurnRoute(state, playerId);
  }

  // ===== 2. 후보 경로 목록: 목표 경로 → 상위 우선순위 경로 → 네트워크 확장 =====
  const candidateRoutes: DeliveryRoute[] = [];
  const pushUnique = (r: DeliveryRoute | null) => {
    if (!r) return;
    if (!candidateRoutes.some(c => c.from === r.from && c.to === r.to)) {
      candidateRoutes.push(r);
    }
  };

  pushUnique(targetRoute);
  for (const r of getTopPriorityRoutes(state, playerId, 5)) {
    pushUnique(r);
  }

  // Montréal 마스터 네트워크: 첫 건설은 "네트워크에 닿은 정거장"에서만 시작할 수 있다.
  // 위 후보가 전부 네트워크 밖 경로면(예: Snowdon 주변) 봇이 한 타일도 못 깔고 스킵하므로,
  // 네트워크 앵커(닿은 정거장)가 끝점인 배달 기회를 후보에 보충한다.
  // ⚠️ 반드시 findNetworkExpansionTarget(일반 확장 폴백)보다 먼저 — 뒤에 두면 폴백의 저가치
  // 인접 도시쌍(coteVertu↔henri 1링크 4타일)이 ΔVP 상위 보충(berri→atwater 21.0)을 가로챈다
  // (2026-07-14 실전 관찰 2건 모두 이 순서 문제).
  {
    const mnProfile = getMapProfile(state.mapId);
    const hasOwnTracks = state.board.trackTiles.some(
      t => t.owner === playerId || t.secondaryOwner === playerId
    );
    // 달(Moon): 시드 도시(Moon Base)가 있으면 빈 보드에도 네트워크가 존재한다 — 첫 건설부터 앵커 보충
    const networkExists = state.board.trackTiles.length > 0 || (state.board.townSpurs ?? []).length > 0
      || !!mnProfile.masterNetworkSeedCityId;
    if (mnProfile.masterNetwork && !hasOwnTracks && networkExists) {
      const inNet = (cityId: string) => {
        const stop = findStopById(state.board, cityId);
        return !!stop && stationInMasterNetwork(state.board, stop.coord, mnProfile.masterNetworkSeedCityId);
      };
      // ΔVP순 정렬 후 상위 5개만 보충 — 기회 목록(도시 배열) 순서 그대로 넣으면 저가치
      // 장거리(예: henriBourassa→berriUqam)가 고가치 직행(berriUqam→atwater 21.0)보다 먼저
      // 시도돼 봇이 다턴 괴물 경로를 착공한다 (2026-07-14 실전 버그).
      const anchored = analyzeDeliveryOpportunities(state)
        .filter(o => inNet(o.sourceCityId) || inNet(o.targetCityId))
        .map(o => ({ o, vp: estimateRouteVP(state, playerId, o).deltaVP }))
        .filter(x => x.vp > -Infinity)
        .sort((a, b) => b.vp - a.vp);
      for (const { o } of anchored.slice(0, 5)) {
        pushUnique({ from: o.sourceCityId, to: o.targetCityId, priority: 3 });
      }
    }
  }

  pushUnique(findNetworkExpansionTarget(state, playerId, targetRoute ? [targetRoute.to] : []));

  // ===== 3. 순서대로 결정론적 경로 추적 건설 (A* 경로를 따라 frontier 다음 칸에 건설) =====
  // 산발 방지(사용자 지침): 내 기존 네트워크와 분리된 새 도시에서 시작하는 경로는 깔지 않는다 —
  //   출발·도착 둘 다 내 연결 도시가 아니면 분리된 새 조각이라 미완성으로 공용화되는 산발. 내 트랙이
  //   아예 없는 첫 건설은 예외. 다인 cityCubes만(trackCubes 미완성 배달/튜토리얼 회귀 보존).
  const banScatter = state.activePlayers.length >= 3 &&
    !getMapAIConfig(state).incomeSources.includes('trackCubes');
  const myConnectedCities = banScatter ? getConnectedCities(state, playerId) : [];
  const hasMyTracks = state.board.trackTiles.some(t => t.owner === playerId);
  // Germany: 미완성 링크 금지 — 이번 턴 슬롯으로 완성 못 할 링크는 착공하지 않는다(다음 턴 이어붙이기 불가).
  const requireCompleteLinks = getMapProfile(state.mapId).requireCompleteLinks;
  // ★ 첫 착공 완성 가능성 게이트 (1게임 추적: player5가 seattle→memphis 대륙횡단 경로에 3트랙을
  //   미완성으로 깔아 현금 소진→income 0→파산). 다인 맵에서 첫 착공 시, 시간·자금 안에 완성 불가능한
  //   경로(estimateRouteVP.completable=false, selectStandardRoute의 fallback opportunities[0] 등)는
  //   건너뛴다 — 미완성 트랙(0VP)에 전 재산을 쏟느니 짧은 완성 경로를 찾거나 skip해 돈을 보존한다.
  // ★ 중간 슬롯 신규 착공에도 게이트 적용 (2026-07 사용자 피드백 "건설 엉망"): 3번째 슬롯에서
  //   잔여 현금으로 완성 불가능한 새 경로(예: 산악 $9 경로에 현금 $6)에 착공해 dangling 트랙을
  //   남기던 사례 — 커밋된 현재 경로(매몰비용)는 계속 허용하되, "다른 경로로의 신규 착공"은
  //   턴 중간에도 완성 가능성을 검사한다.
  const gateFirstSlot = state.phaseState.builtTracksThisTurn === 0;
  const oppsForGate = banScatter ? analyzeDeliveryOpportunities(state) : [];
  for (const route of candidateRoutes) {
    // 내 트랙만으로 이미 완성된 경로는 더 지을 필요 없음
    if (isRouteComplete(state, route, playerId)) continue;

    if (banScatter && hasMyTracks &&
        !myConnectedCities.includes(route.from) && !myConnectedCities.includes(route.to)) {
      continue;
    }

    // 완성 불가능한 배달 경로는 착공에서 제외 (미완성 건설 = 돈 낭비 + 죽음의 나선).
    // 첫 슬롯이거나, 커밋된 경로가 아닌 새 경로로 갈아탈 때 적용.
    const isCommittedRoute = !!targetRoute && route.from === targetRoute.from && route.to === targetRoute.to;
    if (banScatter && (gateFirstSlot || !isCommittedRoute)) {
      const opp = oppsForGate.find(o => o.sourceCityId === route.from && o.targetCityId === route.to);
      if (opp && !estimateRouteVP(state, playerId, opp).completable) continue;
    }

    // Germany 미완성 링크 금지: 첫 착공 시 이번 턴 잔여 슬롯으로 완성 가능한 경로만 시작한다.
    if (requireCompleteLinks && state.phaseState.builtTracksThisTurn === 0) {
      const missing = countMissingTrackHexes(state, route, playerId);
      if (missing === null || missing > state.phaseState.maxTracksThisTurn) continue;
    }

    const decision = tryDirectPathBuild(state, playerId, route);
    if (decision) {
      // 경로 전환 시 전역 상태 동기화 (moveGoods 등 후속 Phase 일관성)
      if (!targetRoute || route.from !== targetRoute.from || route.to !== targetRoute.to) {
        debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player.name}: 경로 전환 ${route.from}→${route.to}`);
        setCurrentRoute(playerId, route);
      }
      return decision;
    }
  }
  } // ===== 타일 건설 시도 끝 (현금이 타일 비용 미만이면 이 블록을 건너뛴다) =====

  // ===== 2. 타일을 더 못 깔면(경로 없음/현금 부족) 미연결 마을 가닥을 연결한다 (타일 후순위) =====
  // 타일을 최대한 짓고 남는 카운트로만 마을을 연결한다. 가닥은 $1 + 마을 진입 1카운트.
  if (player.cash >= 1 /* TOWN_SPUR_COST */) {
    const danglingTown = findDanglingTownConnection(state, playerId);
    if (danglingTown) {
      debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player.name}: 미연결 마을 가닥 완성 (${danglingTown.col},${danglingTown.row})`);
      return { action: 'buildSpur', townCoord: danglingTown };
    }
  }

  // ===== 3. 모든 시도 실패 → 스킵 (미완성 트랙 = 0VP, 무리한 건설은 돈 낭비) =====
  debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player.name}: 건설 가능한 경로 없음 → 스킵`);
  return { action: 'skip' };
}

/**
 * Germany 미완성 링크 금지용: route(도시→도시) 완성에 아직 필요한 신규 트랙 타일 수.
 * A* 경로상 헥스 중 도시/마을이 아니고 내 트랙이 아직 없는 칸 수. 경로가 없으면 null.
 */
function countMissingTrackHexes(state: GameState, route: DeliveryRoute, playerId: PlayerId): number | null {
  const board = state.board;
  const from = board.cities.find(c => c.id === route.from);
  const to = board.cities.find(c => c.id === route.to);
  if (!from || !to) return null;
  const path = findOptimalPathAvoidingOpponent(from.coord, to.coord, board, playerId, undefined, false);
  if (path.length < 3) return null;
  let missing = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const c = path[i];
    if (board.cities.some(ci => hexCoordsEqual(ci.coord, c))) continue; // 도시 통과
    if (board.towns.some(t => hexCoordsEqual(t.coord, c) && t.newCityColor === null)) continue; // 마을(가닥 별도)
    const t = board.trackTiles.find(tt => hexCoordsEqual(tt.coord, c));
    if (t && t.owner === playerId) continue; // 이미 내 트랙
    missing++;
  }
  return missing;
}

/**
 * 내 트랙이 마을 변에 닿아 있으나 가닥이 없는 마을 찾기
 * (카운트 부족으로 타일만 지어진 미연결 상태 — buildTownSpur 대상)
 */
function findDanglingTownConnection(state: GameState, playerId: PlayerId): HexCoord | null {
  const board = state.board;
  for (const tile of board.trackTiles) {
    const myEdgeSets: number[][] = [];
    if (tile.owner === playerId) myEdgeSets.push(tile.edges);
    if (tile.secondaryOwner === playerId && tile.secondaryEdges) myEdgeSets.push(tile.secondaryEdges);

    for (const edges of myEdgeSets) {
      for (const e of edges) {
        const nb = getNeighborHex(tile.coord, e, board);
        const isTown = board.towns.some(t => hexCoordsEqual(t.coord, nb) && t.newCityColor === null);
        if (!isTown) continue;
        const spurEdge = getOppositeEdge(e);
        const hasSpur = (board.townSpurs ?? []).some(
          sp => hexCoordsEqual(sp.townCoord, nb) && sp.edge === spurEdge
        );
        if (!hasSpur) return nb;
      }
    }
  }
  return null;
}

/**
 * 통과 마을(내 트랙이 2변 이상 닿아, 가닥을 연결하면 through-link가 완성되는 마을) 찾기.
 * 마을 미연결 = 링크 미완성 = 깊은 배달 불가이므로, 이런 마을은 새 fragment 타일보다 먼저 연결한다.
 * (단일 변만 닿은 끝단 마을은 through-link가 아니므로 제외 — 후순위로 둔다.)
 */
function findPassThroughDanglingTown(state: GameState, playerId: PlayerId): HexCoord | null {
  const board = state.board;
  const townInfo = new Map<string, { coord: HexCoord; myEdges: Set<number>; spurEdges: Set<number> }>();
  for (const tile of board.trackTiles) {
    const myEdgeSets: number[][] = [];
    if (tile.owner === playerId) myEdgeSets.push(tile.edges);
    if (tile.secondaryOwner === playerId && tile.secondaryEdges) myEdgeSets.push(tile.secondaryEdges);
    for (const edges of myEdgeSets) {
      for (const e of edges) {
        const nb = getNeighborHex(tile.coord, e, board);
        const isTown = board.towns.some(t => hexCoordsEqual(t.coord, nb) && t.newCityColor === null);
        if (!isTown) continue;
        const key = `${nb.col},${nb.row}`;
        if (!townInfo.has(key)) townInfo.set(key, { coord: nb, myEdges: new Set(), spurEdges: new Set() });
        townInfo.get(key)!.myEdges.add(getOppositeEdge(e)); // 마을 쪽에서 내 트랙을 향한 변
      }
    }
  }
  for (const sp of board.townSpurs ?? []) {
    const info = townInfo.get(`${sp.townCoord.col},${sp.townCoord.row}`);
    if (info) info.spurEdges.add(sp.edge);
  }
  for (const { coord, myEdges, spurEdges } of Array.from(townInfo.values())) {
    // 내 트랙이 2변 이상 닿았는데 가닥이 빠진 변이 있으면 = 통과 마을 미완성
    if (myEdges.size >= 2 && Array.from(myEdges).some(e => !spurEdges.has(e))) return coord;
  }
  return null;
}

/**
 * 무료로 메울 수 있는 통과 마을 가닥이 남아있는가 — 이번 턴 이미 그 마을을 연결했으면(0카운트)
 * 빌드 카운트(3/3)를 다 써도 추가 변 가닥을 무료로 연결할 수 있다. AI 실행 루프가 빌드 종료 직전
 * 이걸 확인해, 마지막 타일이 마을에 새 연결을 만든 경우를 같은 턴에 메운다(미연결 토막 방지).
 */
export function hasPendingFreeSpur(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player || player.cash < GAME_CONSTANTS.PLAIN_TRACK_COST) return false; // 가닥 비용($1+) 못 내면 메울 수 없음(루프 방지)
  const town = findPassThroughDanglingTown(state, playerId);
  if (!town) return false;
  return (state.board.townSpurs ?? []).some(
    sp => hexCoordsEqual(sp.townCoord, town) && sp.owner === playerId && sp.builtTurn === state.currentTurn
  );
}

/**
 * 이번 턴 목표 경로 결정 (턴 간 경로 커밋)
 *
 * 이전 경로가 미완성이고 (화물이 남았거나 투자가 2트랙 이상이면) 유지한다.
 * 미완성 트랙은 0VP이므로 일단 투자한 경로는 완성하는 것이 거의 항상 최적.
 * 경로 변경은 (a) 완성됨 (b) 화물 소진 & 투자 < 2 인 경우만.
 */
function resolveTurnRoute(state: GameState, playerId: PlayerId): DeliveryRoute | null {
  const player = state.players[playerId];
  const previousRoute = getCurrentRoute(playerId);

  if (previousRoute) {
    const isComplete = isRouteComplete(state, previousRoute, playerId);
    const sourceCity = state.board.cities.find(c => c.id === previousRoute.from);
    const targetCity = state.board.cities.find(c => c.id === previousRoute.to);

    // 세그먼트인 경우 전체 경로의 최종 목적지도 화물 확인 대상에 포함
    const finalDestId = previousRoute.overallTo || previousRoute.to;
    const finalDestCity = state.board.cities.find(c => c.id === finalDestId);
    // 도착 도시 수요색 매칭 — 한국(동적 색상)은 도시 cubes 기반 (cityEverAcceptsCube), 그 외 city.color
    const hasMatchingCargo = !!(sourceCity && (
      (targetCity && sourceCity.cubes.some(cube => cityEverAcceptsCube(targetCity, cube, state.board))) ||
      (finalDestCity && finalDestId !== previousRoute.to && sourceCity.cubes.some(cube => cityEverAcceptsCube(finalDestCity, cube, state.board)))
    ));

    const investedCount = getCurrentRouteState(playerId)?.investedTrackCount ?? 0;

    debugLog.trackBuilding(
      `[Phase IV: 트랙 건설] ${player?.name}: 이전 경로 검증 (${previousRoute.from}→${previousRoute.to}, 최종→${finalDestId}) - 완성=${isComplete}, 화물=${hasMatchingCargo}, 투자=${investedCount}`
    );

    if (!isComplete && (hasMatchingCargo || investedCount >= 2)) {
      // ★ 건설 차례에 그 경로가 "지금도" 완성 가능한지 재확인 (사용자 지침: 인터랙션 게임에서
      //   다른 사람 건설을 100% 예측 못 하니, 내 차례에 현재 보드로 경로를 다시 검증해야 한다).
      //   턴 시작에 잡은 경로가 다른 플레이어 건설로 막혔으면(completable=false) 고집하지 않고
      //   아래로 떨어져 재평가 → 막힌 경로에 미완성 트랙을 흩뿌리는 것을 막는다. (다인 cityCubes만)
      const config = getMapAIConfig(state);
      const interactive = state.activePlayers.length >= 3 && !config.incomeSources.includes('trackCubes');
      if (!interactive) return previousRoute;
      // ★ 남의 트랙으로 이미 완성된 연결이면 중복 부설 — 커밋 유지 대상이 아니다.
      //   턴 시작 계획은 앞 순번의 건설을 모르므로, 앞 사람이 방금 같은 경로를 완성했는데
      //   그대로 따라 지으면 한정된 매칭 화물을 나눠 먹는 $10+ 중복 투자가 된다 (2026-07-14
      //   실전: green이 snowdon↔atwater 완성 직후 blue가 VEN 경유로 같은 연결 재부설).
      //   재평가로 떨어지면 ρ 할인(같은 경로 ×0.4·완성 경로 ×0.4)이 반영돼 다른 경로를 고른다.
      if (isRouteComplete(state, previousRoute)) {
        debugLog.trackBuilding(
          `[Phase IV: 트랙 건설] ${player?.name}: 이전 경로 ${previousRoute.from}→${previousRoute.to}는 이미 타인 트랙으로 완성(중복 부설 방지) → 재평가`
        );
      } else {
      const opp = analyzeDeliveryOpportunities(state).find(
        o => o.sourceCityId === previousRoute.from && o.targetCityId === previousRoute.to
      );
      // 내가 이번 턴 도시화한 직후라면, 기회 목록에 없어도 화물 매칭이 확인된 경로는 유지 —
      // 신도시행 커밋 경로는 방금 생긴 도시라 top-K 기회 목록에 아직 없을 수 있는데, 여기서
      // 드롭하면 연결 커밋이 무효화된다. (그 외 턴은 기존대로 재평가 — 상시 유지로 넓히면
      // 저가치 경로 고착으로 VP가 깎이는 것을 100시드로 확인)
      const justUrbanized = player?.selectedAction === 'urbanization' && state.phaseState.urbanizationUsed;
      if (!opp && hasMatchingCargo && justUrbanized) return previousRoute;
      // 기회가 아직 있고 현재 보드에서 완성 가능하면 고수, 아니면(막힘/화물소진) 재평가
      if (opp && estimateRouteVP(state, playerId, opp).completable) {
        return previousRoute;
      }
      debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player?.name}: 이전 경로 ${previousRoute.from}→${previousRoute.to}가 더 이상 완성 불가(막힘) → 재평가`);
      }
    }
  }

  // 이전 경로가 무효하면 새로 탐색
  const routeResult = findNextTargetRoute(state, playerId);
  if (routeResult.route) return routeResult.route;
  if (routeResult.needsStrategyReeval) return getNextTargetRoute(state, playerId);
  return null;
}



/**
 * 두 트랙이 교차(crossing)인지 공존(coexist)인지 판단
 *
 * 교차: 두 트랙이 헥스 중앙을 지나며 실제로 교차
 * 공존: 두 트랙이 헥스 가장자리를 따라 교차하지 않음
 */
function determineComplexTrackType(
  existingEdges: [number, number],
  newEdges: [number, number]
): 'crossing' | 'coexist' {
  // 단순화된 교차 판단: 반대편 엣지끼리 연결되면 교차 가능성 높음
  const existingDiff = Math.abs(existingEdges[0] - existingEdges[1]);
  const newDiff = Math.abs(newEdges[0] - newEdges[1]);

  // 직선(반대편 연결, diff=3)과 직선이 만나면 교차
  if ((existingDiff === 3 || existingDiff === 3) && (newDiff === 3 || newDiff === 3)) {
    return 'crossing';
  }

  // 그 외에는 공존
  return 'coexist';
}

/**
 * AI용 복합 트랙 건설 가능 여부 확인
 *
 * gameStore.ts의 canBuildComplexTrack과 유사하지만, 특정 플레이어 기준으로 검증
 */
function canBuildComplexTrackForAI(
  state: GameState,
  coord: HexCoord,
  newEdges: [number, number],
  playerId: PlayerId
): boolean {
  const { board } = state;

  // 기존 트랙이 있어야 함
  const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
  if (!existingTrack) return false;

  // 기존 트랙이 단순 트랙이어야 함
  if (existingTrack.trackType !== 'simple') return false;

  // 새 경로가 기존 경로와 겹치지 않아야 함
  const existingEdges = existingTrack.edges;
  if (
    newEdges[0] === existingEdges[0] ||
    newEdges[0] === existingEdges[1] ||
    newEdges[1] === existingEdges[0] ||
    newEdges[1] === existingEdges[1]
  ) {
    return false;
  }

  // 연결성 검증: 새 경로가 플레이어의 기존 트랙/도시에 연결되어야 함
  // (Western US: 대륙횡단 전 연속성 강제 — 엔진 canBuildComplexTrack과 동일)
  const profile = getMapProfile(state.mapId);
  const requireNetwork = profile.requireContiguousUntilTranscontinental && !state.players[playerId]?.transcontinental;
  if (!validateTrackConnection(coord, newEdges, board, playerId, requireNetwork)) {
    return false;
  }

  return true;
}

/**
 * 물품이 없을 때 네트워크 확장 목표 찾기
 *
 * 연결된 도시에서 가장 가까운 미연결 도시를 찾아 경로 생성
 */
export function findNetworkExpansionTarget(
  state: GameState,
  playerId: PlayerId,
  excludeCityIds: string[] = []
): DeliveryRoute | null {
  const connectedCities = getConnectedCities(state, playerId);
  const { board } = state;

  // 연결 안 된 도시 찾기 (제외 목록 필터링)
  const unconnectedCities = board.cities.filter(
    c => !connectedCities.includes(c.id) && !excludeCityIds.includes(c.id)
  );

  if (unconnectedCities.length === 0) return null;

  // 연결된 도시가 없으면 (첫 트랙) 임의 도시 선택
  // 거리 < 2(변을 공유하는 인접 도시)는 사이 헥스가 없어 일반 트랙으로 이을 수 없다
  // (직결 링크는 사람 전용) — 목표로 잡으면 건설이 항상 실패해 턴 전체를 스킵하게 된다.
  if (connectedCities.length === 0) {
    const firstCity = board.cities[0];
    const buildable = unconnectedCities.filter(c => hexDistance(firstCity.coord, c.coord) >= 2);
    if (buildable.length === 0) return null;
    const nearestUnconnected = buildable.reduce((nearest, city) => {
      const dist = hexDistance(firstCity.coord, city.coord);
      const nearestDist = hexDistance(firstCity.coord, nearest.coord);
      return dist < nearestDist ? city : nearest;
    });

    debugLog.trackBuilding(`[Phase IV: 트랙 건설] 네트워크 확장: ${firstCity.id} → ${nearestUnconnected.id} (첫 트랙)`);
    return { from: firstCity.id, to: nearestUnconnected.id, priority: 3 };
  }

  // 연결된 도시에서 가장 가까운 (트랙으로 이을 수 있는) 미연결 도시 찾기
  let bestTarget: { from: string; to: string; distance: number } | null = null;

  for (const connectedId of connectedCities) {
    const connectedCity = board.cities.find(c => c.id === connectedId);
    if (!connectedCity) continue;

    for (const unconnected of unconnectedCities) {
      const distance = hexDistance(connectedCity.coord, unconnected.coord);
      if (distance < 2) continue; // 인접 도시: 사이 헥스 없음 → 건설 불가 목표
      if (!bestTarget || distance < bestTarget.distance) {
        bestTarget = { from: connectedId, to: unconnected.id, distance };
      }
    }
  }

  if (bestTarget) {
    debugLog.trackBuilding(`[Phase IV: 트랙 건설] 네트워크 확장: ${bestTarget.from} → ${bestTarget.to}`);
    return { from: bestTarget.from, to: bestTarget.to, priority: 3 };
  }

  return null;
}

/**
 * 지형에 따른 건설 비용
 */
function getTerrainCost(coord: HexCoord, board: { hexTiles: { coord: HexCoord; terrain: string; fixedCost?: number }[] }): number {
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (!hexTile) return GAME_CONSTANTS.PLAIN_TRACK_COST;
  if (hexTile.fixedCost !== undefined) return hexTile.fixedCost; // 헥스 고정비용 우선 (Germany/Western US)

  switch (hexTile.terrain) {
    case 'river':
    case 'swamp':
      return GAME_CONSTANTS.RIVER_TRACK_COST;
    case 'mountain':
      return GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
    default:
      return GAME_CONSTANTS.PLAIN_TRACK_COST;
  }
}

/**
 * 결정론적 경로 추적 건설
 *
 * A* 최적 경로를 단계별로 따라가면서, 출발지에서부터 연속된 frontier의
 * 다음 위치에 정확한 엣지로 트랙을 건설합니다.
 *
 * 점수 기반 시스템의 문제 (산발적 건설)를 근본적으로 해결합니다.
 * 실패하면 null을 반환하여 기존 점수 기반 시스템으로 fallback합니다.
 */
function tryDirectPathBuild(
  state: GameState,
  playerId: PlayerId,
  route: DeliveryRoute
): TrackBuildDecision | null {
  const { board } = state;
  const player = state.players[playerId];
  let sourceCity = findStopById(board, route.from);
  let targetCity = findStopById(board, route.to);
  if (!sourceCity || !targetCity || !player) return null;

  // 내 트랙 = primary 소유 + secondaryOwner(복합 트랙 크로싱)도 포함. 각 타일에서 내가 통과
  // 가능한 엣지를 함께 들고 다닌다 — 안 그러면 내가 깐 크로싱에서 frontier 체인이 끊겨
  // (크로싱의 primary owner는 상대) 거의 완성된 경로를 추적 못 하고 다른 경로로 갈아탄다.
  const playerTracks = board.trackTiles
    .map(t => {
      const edges = playerEdgesAtTrack(t, playerId);
      return edges ? { coord: t.coord, edges } : null;
    })
    .filter((x): x is { coord: HexCoord; edges: number[] } => x !== null);
  const hasExistingTrack = playerTracks.length > 0;

  const profile = getMapProfile(state.mapId);
  // Western US: 첫 트랙은 "시작 도시"(서부/동부) 인접에서만 시작할 수 있다.
  // 대륙횡단 전까지는 모든 신설 트랙이 네트워크에 연속이어야 한다.
  const allowedStartCityIds = profile.startingCitiesOnly
    ? new Set(board.cities.filter(c => profile.isStartingCity(c)).map(c => c.id))
    : undefined;
  const requireNetwork = profile.requireContiguousUntilTranscontinental && !player.transcontinental;

  // 첫 트랙은 도시 인접에서만 시작할 수 있다 (정규 룰). 경로가 마을→도시 방향이면
  // 마을 쪽 첫 칸은 도시 비인접이라 건설이 막히므로, source/target을 교환해
  // 도시 끝에서부터 건설을 시작한다 (배달 경로는 양방향 동일 — St. Lucia 도시화 1턴 등).
  if (!hasExistingTrack) {
    if (allowedStartCityIds) {
      // 시작 도시 끝에서부터 건설. 둘 다 시작 도시가 아니면 이 경로는 첫 건설 불가.
      const sStart = allowedStartCityIds.has(sourceCity!.id);
      const tStart = allowedStartCityIds.has(targetCity!.id);
      if (!sStart && tStart) [sourceCity, targetCity] = [targetCity, sourceCity];
      else if (!sStart && !tStart) return null;
    } else {
      const sourceIsCity = board.cities.some(c => hexCoordsEqual(c.coord, sourceCity!.coord));
      const targetIsCity = board.cities.some(c => hexCoordsEqual(c.coord, targetCity!.coord));
      if (!sourceIsCity && targetIsCity) {
        [sourceCity, targetCity] = [targetCity, sourceCity];
      }
    }

    // Montréal 마스터 네트워크: 첫 타일이 기존 네트워크(아무 트랙)에 닿아야 canBuildTrack을
    // 통과한다 → 네트워크에 닿은 정거장 끝에서부터 짓는다. 둘 다 안 닿았으면 이 경로는 지금 불가
    // (canBuildTrack이 전부 거부해 봇이 턴을 통째로 스킵하던 원인 — 후보 루프가 다음 경로로 넘어가게 null).
    if (profile.masterNetwork) {
      // 달(Moon): 시드 도시(Moon Base)가 있으면 빈 보드에도 네트워크가 존재 — 시드에서만 착공 가능
      const seedId = profile.masterNetworkSeedCityId;
      const networkExists = board.trackTiles.length > 0 || (board.townSpurs ?? []).length > 0 || !!seedId;
      if (networkExists) {
        const sIn = stationInMasterNetwork(board, sourceCity!.coord, seedId);
        const tIn = stationInMasterNetwork(board, targetCity!.coord, seedId);
        if (!sIn && tIn) [sourceCity, targetCity] = [targetCity, sourceCity];
        else if (!sIn && !tIn) return null;
      }
    }
  }

  // 자사 트랙 엣지 비호환 시 회피 좌표를 추가하며 최대 3회 재탐색
  const avoidCoords: HexCoord[] = [];

  // 마을 경유 우대: 화물이 마을 링크를 더 지나 다링크 배달 → income↑.
  // trackCubes(4-5링크 깊은 배달) + 다인 cityCubes(장거리 도시 배달, 사용자 목표 income 20) 모두 적용.
  // (route 선택·평가와 동일 경로를 빌드해야 일관됨 — vp.estimateRouteVP/turnPlan과 맞춤)
  const cfg = getMapAIConfig(state);
  const preferTowns = cfg.incomeSources.includes('trackCubes') || state.activePlayers.length >= 3;

  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. A* 경로 계산 (상대 트랙 회피, 자사 트랙 우대, 비호환 트랙 회피)
    const optimalPath = findOptimalPathAvoidingOpponent(
      sourceCity.coord, targetCity.coord, board, playerId,
      avoidCoords.length > 0 ? avoidCoords : undefined,
      preferTowns,
    );
    if (optimalPath.length < 3) return null;

    // 2. Frontier 탐색: 출발 도시에서 연속된 마지막 위치
    // 중간 도시도 체인으로 인식, 순방향 엣지 연결도 검증
    let frontierIndex = 0;
    let edgeBlockedHex: HexCoord | null = null;

    for (let i = 1; i < optimalPath.length - 1; i++) {
      const pathCoord = optimalPath[i];

      // 중간 허브(도시/마을) 체크 — 마을도 타일 없이 모든 진입 트랙을 연결
      const isIntermediateCity = board.cities.some(c => hexCoordsEqual(c.coord, pathCoord))
        || board.towns.some(t => hexCoordsEqual(t.coord, pathCoord) && t.newCityColor === null);
      if (isIntermediateCity) {
        const prevCoord = optimalPath[i - 1];
        const prevIsCity = board.cities.some(c => hexCoordsEqual(c.coord, prevCoord))
          || board.towns.some(t => hexCoordsEqual(t.coord, prevCoord) && t.newCityColor === null);

        if (prevIsCity) {
          frontierIndex = i;
          continue;
        }

        const prevTrack = playerTracks.find(t => hexCoordsEqual(t.coord, prevCoord));
        if (prevTrack) {
          const edgeToCity = getEdgeBetweenHexes(prevCoord, pathCoord, board);
          if (edgeToCity >= 0 && prevTrack.edges.includes(edgeToCity)) {
            // ★ 사용자 지침: 경로가 마을을 지날 땐, 다음 타일을 짓기 전에 "들어온 변" 가닥을 먼저 짓는다.
            // 마을은 가닥이 있어야 실제 연결 — frontier만 넘기면 다음 타일이 미연결 마을에서 시작돼 실패/토막.
            const pathIsTown = board.towns.some(t => hexCoordsEqual(t.coord, pathCoord) && t.newCityColor === null);
            if (pathIsTown) {
              const townEntryEdge = getEdgeBetweenHexes(pathCoord, prevCoord, board); // 마을에서 prev를 향한 변
              const hasEntrySpur = (board.townSpurs ?? []).some(
                sp => hexCoordsEqual(sp.townCoord, pathCoord) && sp.edge === townEntryEdge
              );
              if (!hasEntrySpur && townEntryEdge >= 0 && player.cash >= GAME_CONSTANTS.PLAIN_TRACK_COST) {
                debugLog.trackBuilding(`[직접 경로] 마을 (${pathCoord.col},${pathCoord.row}) 들어온 변 가닥 먼저 연결 (다음 타일 전)`);
                return { action: 'buildSpur', townCoord: pathCoord };
              }
            }
            frontierIndex = i;
            continue;
          }
        }
        break;
      }

      // 일반 헥스: 역방향 + 순방향 엣지 연결 모두 확인
      const trackHere = playerTracks.find(t => hexCoordsEqual(t.coord, pathCoord));
      if (trackHere) {
        const prevCoord = optimalPath[i - 1];
        const edgeToPrev = getEdgeBetweenHexes(pathCoord, prevCoord, board);
        if (edgeToPrev >= 0 && trackHere.edges.includes(edgeToPrev)) {
          // 역방향 OK. 순방향 검증: 다음 위치로 연결되는 엣지가 있는지.
          // 다음이 도시여도 트랙이 그 도시를 향한 변(레일)을 실제로 가져야 연결된다 —
          // 그렇지 않으면(예: 코엑시스가 도시 쪽 변 없음) 미완성인데 "완성"으로 오판한다.
          if (i + 1 < optimalPath.length) {
            const nextPathCoord = optimalPath[i + 1];
            const edgeToNext = getEdgeBetweenHexes(pathCoord, nextPathCoord, board);
            if (edgeToNext < 0 || !trackHere.edges.includes(edgeToNext)) {
              // 순방향 엣지 비호환 → 이 트랙을 회피해야 함
              edgeBlockedHex = pathCoord;
              break;
            }
          }
          frontierIndex = i;
        } else {
          break; // 역방향 엣지 불일치
        }
      } else {
        break; // 트랙 없으면 chain 끊김
      }
    }

    // 순방향 엣지 비호환 발견 → 해당 좌표를 회피하고 재탐색
    if (edgeBlockedHex) {
      avoidCoords.push(edgeBlockedHex);
      debugLog.trackBuilding(
        `[직접 경로] (${edgeBlockedHex.col},${edgeBlockedHex.row}) 엣지 비호환 → 회피 재탐색 (시도 ${attempt + 1}/3)`
      );
      continue;
    }

    // 3. 다음 건설 위치 결정 (자기 완성 링크 연속 통과 포함)
    let nextIndex = frontierIndex + 1;
    if (nextIndex >= optimalPath.length) return null;

    let nextCoord = optimalPath[nextIndex];

    // [수정 A] 자기 완성 링크 연속 통과 루프
    while (true) {
      // 이번 턴에 이미 건설한 좌표면 건너뜀 (중복 건설/리다이렉트 방지)
      const alreadyBuiltThisTurn = state.phaseState.lastBuiltCoords.some(
        c => hexCoordsEqual(c, nextCoord)
      );
      if (alreadyBuiltThisTurn) {
        debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) 이번 턴 건설 완료 → 건너뜀`);
        nextIndex++;
        if (nextIndex >= optimalPath.length) return null;
        nextCoord = optimalPath[nextIndex];
        continue;
      }

      // 허브(도시/마을) 헥스 처리: 도착지면 경로 완성, 중간이면 건너뜀 (타일 배치 불가/불필요)
      if (board.cities.some(c => hexCoordsEqual(c.coord, nextCoord))
        || board.towns.some(t => hexCoordsEqual(t.coord, nextCoord) && t.newCityColor === null)) {
        if (hexCoordsEqual(nextCoord, targetCity.coord)) {
          debugLog.trackBuilding(`[직접 경로] 도착 도시(${nextCoord.col},${nextCoord.row}) 도달 → 경로 완성`);
          return null;
        }
        debugLog.trackBuilding(`[직접 경로] 중간 도시(${nextCoord.col},${nextCoord.row}) 건너뜀 → 다음 위치`);
        nextIndex++;
        if (nextIndex >= optimalPath.length) return null;
        nextCoord = optimalPath[nextIndex];
        continue;
      }

      // 기존 트랙 확인
      const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, nextCoord));
      if (!existingTrack) break; // 빈 헥스 → 여기에 건설

      // [NEW] 자기 완성 링크이고 엣지가 경로와 호환 → 통과
      if (existingTrack.owner === playerId && isTrackPartOfCompletedLink(existingTrack.coord, board)) {
        const prevCoordLoop = optimalPath[nextIndex - 1];
        const entryEdgeLoop = getEdgeBetweenHexes(nextCoord, prevCoordLoop, board);
        let canPassThrough = false;

        if (entryEdgeLoop >= 0 && existingTrack.edges.includes(entryEdgeLoop)) {
          if (nextIndex + 1 < optimalPath.length) {
            const nextNext = optimalPath[nextIndex + 1];
            const isNextCity = board.cities.some(c => hexCoordsEqual(c.coord, nextNext))
              || board.towns.some(t => hexCoordsEqual(t.coord, nextNext) && t.newCityColor === null);
            if (isNextCity) {
              canPassThrough = true; // 다음이 도시면 항상 연결
            } else {
              const exitEdgeLoop = getEdgeBetweenHexes(nextCoord, nextNext, board);
              canPassThrough = exitEdgeLoop >= 0 && existingTrack.edges.includes(exitEdgeLoop);
            }
          }
        }

        if (canPassThrough) {
          debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) 자기 완성 링크 통과`);
          nextIndex++;
          if (nextIndex >= optimalPath.length) return null;
          nextCoord = optimalPath[nextIndex];
          continue;
        }
      }

      // 통과 불가 → 복합 트랙(교차/공존) 건설 시도
      const isOwnCompletedLink = existingTrack.owner === playerId && isTrackPartOfCompletedLink(existingTrack.coord, board);
      if ((existingTrack.owner !== playerId || isOwnCompletedLink) && existingTrack.trackType === 'simple') {
        const prevCoordForComplex = optimalPath[nextIndex - 1];
        const nextNextCoordForComplex = nextIndex + 1 < optimalPath.length ? optimalPath[nextIndex + 1] : null;
        const entryEdgeComplex = getEdgeBetweenHexes(nextCoord, prevCoordForComplex, board);
        let exitEdgeComplex = -1;
        if (nextNextCoordForComplex) {
          exitEdgeComplex = getEdgeBetweenHexes(nextCoord, nextNextCoordForComplex, board);
        }
        const existingEdges = existingTrack.edges;

        if (entryEdgeComplex >= 0 && exitEdgeComplex >= 0) {
          const complexEdges: [number, number] = [entryEdgeComplex, exitEdgeComplex];
          const edgesOverlap = complexEdges[0] === existingEdges[0] || complexEdges[0] === existingEdges[1]
            || complexEdges[1] === existingEdges[0] || complexEdges[1] === existingEdges[1];
          if (!edgesOverlap && canBuildComplexTrackForAI(state, nextCoord, complexEdges, playerId)) {
            const trackType = determineComplexTrackType(existingEdges, complexEdges);
            const cost = trackType === 'crossing'
              ? TRACK_REPLACE_COSTS.simpleToCrossing
              : TRACK_REPLACE_COSTS.default;
            const directPathMinReserve = calculateMinCashReserve(state, playerId);
            if (player.cash >= cost + directPathMinReserve) {
              debugLog.trackBuilding(`[직접 경로] 트랙 위 복합 트랙(${trackType}) 건설: (${nextCoord.col},${nextCoord.row}) edges=[${complexEdges}] $${cost}`);
              incrementInvestedTracks(playerId);
              return { action: 'buildComplex', coord: nextCoord, edges: complexEdges, trackType };
            } else {
              debugLog.trackBuilding(`[직접 경로] 복합 트랙 현금 부족 ($${player.cash} < $${cost} + 예비금 $${directPathMinReserve})`);
              return null;
            }
          }

          // 엣지 겹침 → 대안 엣지 조합 탐색
          if (edgesOverlap) {
            debugLog.trackBuilding(`[직접 경로] 엣지 겹침 → 대안 엣지 탐색: (${nextCoord.col},${nextCoord.row}) existing=[${existingEdges}] wanted=[${complexEdges}]`);
            const availableEdges = [0, 1, 2, 3, 4, 5].filter(
              e => e !== existingEdges[0] && e !== existingEdges[1]
            );

            let bestAltEdges: [number, number] | null = null;
            let bestAltScore = -Infinity;
            let bestAltType: 'crossing' | 'coexist' = 'crossing';

            for (let i = 0; i < availableEdges.length; i++) {
              for (let j = i + 1; j < availableEdges.length; j++) {
                const altEdges: [number, number] = [availableEdges[i], availableEdges[j]];
                if (!canBuildComplexTrackForAI(state, nextCoord, altEdges, playerId)) continue;

                // 원래 경로 방향과 가까운 엣지 조합 우선
                let score = 0;
                if (altEdges.includes(entryEdgeComplex)) score += 100;
                if (altEdges.includes(exitEdgeComplex)) score += 100;

                if (score > bestAltScore) {
                  bestAltScore = score;
                  bestAltEdges = altEdges;
                  bestAltType = determineComplexTrackType(existingEdges, altEdges);
                }
              }
            }

            if (bestAltEdges) {
              const cost = bestAltType === 'crossing'
                ? TRACK_REPLACE_COSTS.simpleToCrossing
                : TRACK_REPLACE_COSTS.default;
              const directPathMinReserve = calculateMinCashReserve(state, playerId);
              if (player.cash >= cost + directPathMinReserve) {
                debugLog.trackBuilding(`[직접 경로] 대안 복합 트랙(${bestAltType}) 건설: (${nextCoord.col},${nextCoord.row}) edges=[${bestAltEdges}] $${cost}`);
                incrementInvestedTracks(playerId);
                return { action: 'buildComplex', coord: nextCoord, edges: bestAltEdges, trackType: bestAltType };
              }
            }
          }
        }
      }
      debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) 이미 점유 → fallback`);
      return null;
    }

    // [수정 B] 실패 좌표 체크: 즉시 포기하지 않고 회피 좌표에 넣어 대체 경로 재탐색
    if (isFailedCoord(playerId, nextCoord, state.currentTurn)) {
      avoidCoords.push(nextCoord);
      debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) 이전 실패 좌표 → 회피 재탐색 (시도 ${attempt + 1}/3)`);
      continue;
    }

    // 맵 유효성 확인
    const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, nextCoord));
    if (!hex || hex.terrain === 'lake') return null;

    // 4. 엣지 결정
    const prevCoord = optimalPath[nextIndex - 1];
    const nextNextCoord = nextIndex + 1 < optimalPath.length
      ? optimalPath[nextIndex + 1]
      : null;

    const entryEdge = getEdgeBetweenHexes(nextCoord, prevCoord, board);
    if (entryEdge < 0) return null;

    let exitEdge = -1;
    if (nextNextCoord) {
      exitEdge = getEdgeBetweenHexes(nextCoord, nextNextCoord, board);
    }
    if (exitEdge < 0) return null;

    const edges: [number, number] = [entryEdge, exitEdge];

    // 5. 순방향 연결 최종 검증: frontier 트랙이 건설 위치로 연결되는지
    const frontierCoord = optimalPath[frontierIndex];
    const frontierIsCity = board.cities.some(c => hexCoordsEqual(c.coord, frontierCoord));
    if (!frontierIsCity && frontierIndex > 0) {
      const frontierTrack = playerTracks.find(t => hexCoordsEqual(t.coord, frontierCoord));
      if (frontierTrack) {
        const edgeFromFrontier = getEdgeBetweenHexes(frontierCoord, nextCoord, board);
        if (edgeFromFrontier >= 0 && !frontierTrack.edges.includes(edgeFromFrontier)) {
          // frontier 트랙이 건설 위치 방향 엣지 없음 → 회피 재탐색
          avoidCoords.push(frontierCoord);
          debugLog.trackBuilding(
            `[직접 경로] frontier(${frontierCoord.col},${frontierCoord.row}) → 건설위치(${nextCoord.col},${nextCoord.row}) 연결 불가 → 회피 재탐색`
          );
          continue;
        }
      }
    }

    // 6. 연결 규칙 검증 (Western US: 시작도시 제한 + 연속성 강제)
    if (hasExistingTrack) {
      if (!validateTrackConnection(nextCoord, edges, board, playerId, requireNetwork)) {
        debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) edges=[${edges}] 연결 검증 실패`);
        return null;
      }
    } else {
      if (!validateFirstTrackRule(nextCoord, edges, board, allowedStartCityIds)) {
        debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) edges=[${edges}] 첫 트랙 규칙 실패`);
        return null;
      }
    }

    // 7. 비용 확인 (예비금 포함)
    // ★ 예비금 데드락 해제 (2026-07 파산 궤적 진단): 적자 플레이어는 예비금(지출−income)이 커서
    //   현금을 쥐고도 영원히 건설을 못 하고(SKIP 연속) 생존발행 15주 → 파산하는 좀비가 됐다.
    //   이번 턴 잔여 슬롯으로 이 경로를 완성할 수 있고 출발지에 배달 화물이 있으면(= 이번 턴
    //   배달 income으로 회수 가능) 예비금을 헐어서라도 완성한다 — skip은 어차피 확정 사망이다.
    const cost = getTerrainCost(nextCoord, board);
    let directPathMinReserve = calculateMinCashReserve(state, playerId);
    // (다인 한정 — 좀비 데드락은 다인 경쟁 맵의 현상. 2인 tutorial은 파산 0/20 게이트 보존)
    if (directPathMinReserve > 0 && player.cash >= cost && state.activePlayers.length >= 3) {
      let missingAhead = 0;
      for (let i = nextIndex; i < optimalPath.length - 1; i++) {
        const c = optimalPath[i];
        const isHub = board.cities.some(ci => hexCoordsEqual(ci.coord, c))
          || board.towns.some(t => hexCoordsEqual(t.coord, c) && t.newCityColor === null);
        if (isHub) continue;
        if (!playerTracks.some(pt => hexCoordsEqual(pt.coord, c))) missingAhead++;
      }
      const remainingSlots = state.phaseState.maxTracksThisTurn - state.phaseState.builtTracksThisTurn;
      const srcCity = board.cities.find(c => c.id === route.from);
      const dstCity = board.cities.find(c => c.id === route.to);
      const hasDeliverableCargo = !!(srcCity && dstCity &&
        srcCity.cubes.some(cube => cityEverAcceptsCube(dstCity, cube, board)));
      if (missingAhead <= remainingSlots && hasDeliverableCargo) {
        // 전액 면제 (부분 완화 "생존 하한"도 실험했으나 파산이 오히려 늘었다 — 30시드:
        // Korea 17→18, Rust 22→25. 완성→배달 도박이 신중한 보류보다 기대값이 높다)
        debugLog.trackBuilding(`[직접 경로] 이번 턴 완성+배달 가능(잔여 ${missingAhead}/${remainingSlots}타일) → 예비금 $${directPathMinReserve} 면제`);
        directPathMinReserve = 0;
      }
    }
    if (player.cash < cost + directPathMinReserve) {
      debugLog.trackBuilding(`[직접 경로] 현금 부족 ($${player.cash} < $${cost} + 예비금 $${directPathMinReserve})`);
      return null;
    }

    // 8. 건설!
    debugLog.trackBuilding(`[Phase IV: 트랙 건설] ${player.name}: 직접 경로 추적 (${nextCoord.col},${nextCoord.row}) edges=[${edges}] $${cost} 경로=${route.from}→${route.to} (frontier=${frontierIndex}, path=[${optimalPath.map(p => `(${p.col},${p.row})`).join('→')}])`);
    incrementInvestedTracks(playerId);
    return { action: 'build', coord: nextCoord, edges };
  }

  return null; // 모든 재탐색 시도 실패
}
