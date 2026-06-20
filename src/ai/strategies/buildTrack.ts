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
} from '@/utils/trackValidation';
import { hexCoordsEqual, hexDistance, getNeighborHex, getOppositeEdge } from '@/utils/hexGrid';
import { getCurrentRoute, getCurrentRouteState, setCurrentRoute, incrementInvestedTracks } from '../strategy/state';
import { getNextTargetRoute, findNextTargetRoute, getTopPriorityRoutes } from '../strategy/selector';
import { getMapAIConfig } from '../strategy/mapConfig';
import {
  getConnectedCities,
  isRouteComplete,
  clearPathCache,
  findOptimalPathAvoidingOpponent,
  getEdgeBetweenHexes,
  findStopById,
} from '../strategy/analyzer';
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
  pushUnique(findNetworkExpansionTarget(state, playerId, targetRoute ? [targetRoute.to] : []));

  // ===== 3. 순서대로 결정론적 경로 추적 건설 (A* 경로를 따라 frontier 다음 칸에 건설) =====
  for (const route of candidateRoutes) {
    // 내 트랙만으로 이미 완성된 경로는 더 지을 필요 없음
    if (isRouteComplete(state, route, playerId)) continue;

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
        const nb = getNeighborHex(tile.coord, e);
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
        const nb = getNeighborHex(tile.coord, e);
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
    const hasMatchingCargo = !!(sourceCity && (
      (targetCity && sourceCity.cubes.some(cube => cube === targetCity.color)) ||
      (finalDestCity && finalDestId !== previousRoute.to && sourceCity.cubes.some(cube => cube === finalDestCity.color))
    ));

    const investedCount = getCurrentRouteState(playerId)?.investedTrackCount ?? 0;

    debugLog.trackBuilding(
      `[Phase IV: 트랙 건설] ${player?.name}: 이전 경로 검증 (${previousRoute.from}→${previousRoute.to}, 최종→${finalDestId}) - 완성=${isComplete}, 화물=${hasMatchingCargo}, 투자=${investedCount}`
    );

    if (!isComplete && (hasMatchingCargo || investedCount >= 2)) {
      return previousRoute;
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
  if (!validateTrackConnection(coord, newEdges, board, playerId)) {
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
  if (connectedCities.length === 0) {
    const firstCity = board.cities[0];
    const nearestUnconnected = unconnectedCities.reduce((nearest, city) => {
      const dist = hexDistance(firstCity.coord, city.coord);
      const nearestDist = hexDistance(firstCity.coord, nearest.coord);
      return dist < nearestDist ? city : nearest;
    });

    debugLog.trackBuilding(`[Phase IV: 트랙 건설] 네트워크 확장: ${firstCity.id} → ${nearestUnconnected.id} (첫 트랙)`);
    return { from: firstCity.id, to: nearestUnconnected.id, priority: 3 };
  }

  // 연결된 도시에서 가장 가까운 미연결 도시 찾기
  let bestTarget: { from: string; to: string; distance: number } | null = null;

  for (const connectedId of connectedCities) {
    const connectedCity = board.cities.find(c => c.id === connectedId);
    if (!connectedCity) continue;

    for (const unconnected of unconnectedCities) {
      const distance = hexDistance(connectedCity.coord, unconnected.coord);
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
function getTerrainCost(coord: HexCoord, board: { hexTiles: { coord: HexCoord; terrain: string }[] }): number {
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (!hexTile) return GAME_CONSTANTS.PLAIN_TRACK_COST;

  switch (hexTile.terrain) {
    case 'river':
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

  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
  const hasExistingTrack = playerTracks.length > 0;

  // 첫 트랙은 도시 인접에서만 시작할 수 있다 (정규 룰). 경로가 마을→도시 방향이면
  // 마을 쪽 첫 칸은 도시 비인접이라 건설이 막히므로, source/target을 교환해
  // 도시 끝에서부터 건설을 시작한다 (배달 경로는 양방향 동일 — St. Lucia 도시화 1턴 등).
  if (!hasExistingTrack) {
    const sourceIsCity = board.cities.some(c => hexCoordsEqual(c.coord, sourceCity!.coord));
    const targetIsCity = board.cities.some(c => hexCoordsEqual(c.coord, targetCity!.coord));
    if (!sourceIsCity && targetIsCity) {
      [sourceCity, targetCity] = [targetCity, sourceCity];
    }
  }

  // 자사 트랙 엣지 비호환 시 회피 좌표를 추가하며 최대 3회 재탐색
  const avoidCoords: HexCoord[] = [];

  // trackCubes 맵: 건설 경로도 마을을 경유하도록(route 선택과 동일) → 화물이 마을 링크를 지나 4-5링크 배달
  const preferTowns = getMapAIConfig(state).incomeSources.includes('trackCubes');

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
          const edgeToCity = getEdgeBetweenHexes(prevCoord, pathCoord);
          if (edgeToCity >= 0 && prevTrack.edges.includes(edgeToCity)) {
            // ★ 사용자 지침: 경로가 마을을 지날 땐, 다음 타일을 짓기 전에 "들어온 변" 가닥을 먼저 짓는다.
            // 마을은 가닥이 있어야 실제 연결 — frontier만 넘기면 다음 타일이 미연결 마을에서 시작돼 실패/토막.
            const pathIsTown = board.towns.some(t => hexCoordsEqual(t.coord, pathCoord) && t.newCityColor === null);
            if (pathIsTown) {
              const townEntryEdge = getEdgeBetweenHexes(pathCoord, prevCoord); // 마을에서 prev를 향한 변
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
        const edgeToPrev = getEdgeBetweenHexes(pathCoord, prevCoord);
        if (edgeToPrev >= 0 && trackHere.edges.includes(edgeToPrev)) {
          // 역방향 OK. 순방향 검증: 다음 위치로 연결되는 엣지가 있는지
          if (i + 1 < optimalPath.length) {
            const nextPathCoord = optimalPath[i + 1];
            const nextIsCity = board.cities.some(c => hexCoordsEqual(c.coord, nextPathCoord))
              || board.towns.some(t => hexCoordsEqual(t.coord, nextPathCoord) && t.newCityColor === null);
            if (!nextIsCity) {
              // 다음이 일반 헥스 → 트랙이 해당 방향 엣지를 가져야 함
              const edgeToNext = getEdgeBetweenHexes(pathCoord, nextPathCoord);
              if (edgeToNext < 0 || !trackHere.edges.includes(edgeToNext)) {
                // 순방향 엣지 비호환 → 이 트랙을 회피해야 함
                edgeBlockedHex = pathCoord;
                break;
              }
            }
            // 다음이 도시면 항상 연결 (도시는 모든 엣지 연결)
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
        const entryEdgeLoop = getEdgeBetweenHexes(nextCoord, prevCoordLoop);
        let canPassThrough = false;

        if (entryEdgeLoop >= 0 && existingTrack.edges.includes(entryEdgeLoop)) {
          if (nextIndex + 1 < optimalPath.length) {
            const nextNext = optimalPath[nextIndex + 1];
            const isNextCity = board.cities.some(c => hexCoordsEqual(c.coord, nextNext))
              || board.towns.some(t => hexCoordsEqual(t.coord, nextNext) && t.newCityColor === null);
            if (isNextCity) {
              canPassThrough = true; // 다음이 도시면 항상 연결
            } else {
              const exitEdgeLoop = getEdgeBetweenHexes(nextCoord, nextNext);
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
        const entryEdgeComplex = getEdgeBetweenHexes(nextCoord, prevCoordForComplex);
        let exitEdgeComplex = -1;
        if (nextNextCoordForComplex) {
          exitEdgeComplex = getEdgeBetweenHexes(nextCoord, nextNextCoordForComplex);
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

    const entryEdge = getEdgeBetweenHexes(nextCoord, prevCoord);
    if (entryEdge < 0) return null;

    let exitEdge = -1;
    if (nextNextCoord) {
      exitEdge = getEdgeBetweenHexes(nextCoord, nextNextCoord);
    }
    if (exitEdge < 0) return null;

    const edges: [number, number] = [entryEdge, exitEdge];

    // 5. 순방향 연결 최종 검증: frontier 트랙이 건설 위치로 연결되는지
    const frontierCoord = optimalPath[frontierIndex];
    const frontierIsCity = board.cities.some(c => hexCoordsEqual(c.coord, frontierCoord));
    if (!frontierIsCity && frontierIndex > 0) {
      const frontierTrack = playerTracks.find(t => hexCoordsEqual(t.coord, frontierCoord));
      if (frontierTrack) {
        const edgeFromFrontier = getEdgeBetweenHexes(frontierCoord, nextCoord);
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

    // 6. 연결 규칙 검증
    if (hasExistingTrack) {
      if (!validateTrackConnection(nextCoord, edges, board, playerId)) {
        debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) edges=[${edges}] 연결 검증 실패`);
        return null;
      }
    } else {
      if (!validateFirstTrackRule(nextCoord, edges, board)) {
        debugLog.trackBuilding(`[직접 경로] (${nextCoord.col},${nextCoord.row}) edges=[${edges}] 첫 트랙 규칙 실패`);
        return null;
      }
    }

    // 7. 비용 확인 (예비금 포함)
    const cost = getTerrainCost(nextCoord, board);
    const directPathMinReserve = calculateMinCashReserve(state, playerId);
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
