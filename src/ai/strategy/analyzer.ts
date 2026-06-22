import { GameState, PlayerId, HexCoord, CubeColor, BoardState, GAME_CONSTANTS } from '@/types/game';
import { debugLog } from '@/utils/debugConfig';
import { DeliveryOpportunity, DeliveryRoute } from './types';
import { getMapAIConfig } from './mapConfig';
import { getNeighborHex, hexCoordsEqual, hexDistance, getConnectedNeighbors, hexToKey, getConnectingEdge, getOppositeEdge, playerEdgesAtTrack } from '@/utils/hexGrid';

// 경로 캐시 (출발지-목적지 → 경로)
const pathCache: Map<string, HexCoord[]> = new Map();

/**
 * 캐시 키 생성
 * 트랙 수를 키에 포함해 보드가 변하면 자동으로 캐시 미스가 나도록 함
 * (현재 비용 함수는 지형만 보지만, 향후 트랙 반영 시에도 stale 경로를 반환하지 않도록 방어)
 */
function getCacheKey(from: HexCoord, to: HexCoord, board: BoardState): string {
  return `${from.col},${from.row}-${to.col},${to.row}-t${board.trackTiles.length}`;
}

/**
 * A* 알고리즘으로 두 지점 간 최적 경로 찾기
 *
 * @param from 출발 좌표
 * @param to 목적지 좌표
 * @param board 보드 상태
 * @returns 경로 (헥스 좌표 배열), 경로 없으면 빈 배열
 */
export function findOptimalPath(
  from: HexCoord,
  to: HexCoord,
  board: BoardState
): HexCoord[] {
  // 캐시 확인
  const cacheKey = getCacheKey(from, to, board);
  const cached = pathCache.get(cacheKey);
  if (cached) return cached;

  // A* 알고리즘 구현
  interface Node {
    coord: HexCoord;
    g: number;  // 시작점에서 현재까지 실제 비용
    h: number;  // 현재에서 목적지까지 휴리스틱 (예상 비용)
    f: number;  // g + h
    parent: Node | null;
  }

  const openSet: Node[] = [];
  const closedSet: Set<string> = new Set();
  const coordKey = (c: HexCoord) => `${c.col},${c.row}`;

  // 지형 비용 계산
  const getTerrainCost = (coord: HexCoord): number => {
    const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
    if (!hex) return Infinity; // 맵 밖
    if (hex.terrain === 'lake') return Infinity; // 호수는 건설 불가
    if (hex.fixedCost !== undefined) return hex.fixedCost; // Germany: 헥스 고정비용 우선
    if (hex.terrain === 'mountain') return GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
    if (hex.terrain === 'river') return GAME_CONSTANTS.RIVER_TRACK_COST;
    return GAME_CONSTANTS.PLAIN_TRACK_COST;
  };

  // 도시/마을인지 확인 (마을도 도시처럼 타일 없이 통과 가능한 허브)
  const isCity = (coord: HexCoord): boolean => {
    return board.cities.some(c => hexCoordsEqual(c.coord, coord))
      || board.towns.some(t => hexCoordsEqual(t.coord, coord));
  };

  // 시작 노드
  const startNode: Node = {
    coord: from,
    g: 0,
    h: hexDistance(from, to),
    f: hexDistance(from, to),
    parent: null,
  };
  openSet.push(startNode);

  while (openSet.length > 0) {
    // f 값이 가장 낮은 노드 선택
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    // 목적지 도달
    if (hexCoordsEqual(current.coord, to)) {
      // 경로 재구성
      const path: HexCoord[] = [];
      let node: Node | null = current;
      while (node) {
        path.unshift(node.coord);
        node = node.parent;
      }
      // 캐시에 저장
      pathCache.set(cacheKey, path);
      return path;
    }

    closedSet.add(coordKey(current.coord));

    // 6방향 이웃 탐색
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighborHex(current.coord, edge);
      const neighborKey = coordKey(neighbor);

      // 이미 방문한 노드 스킵
      if (closedSet.has(neighborKey)) continue;

      // 도시/마을 통과 = 완성 링크 +1 = income +1 (영구 +3VP). 트랙 비용($2≈1VP)보다 가치가
      // 훨씬 크므로, 통과를 0이 아니라 보너스로 우대 → 일직선 대신 마을·도시를 거치는 경로를
      // 선호하게 한다 (income 핵심: 지나는 링크 수만큼 수입). 도착 도시(to)는 보너스 제외.
      if (isCity(neighbor)) {
        const passBonus = hexCoordsEqual(neighbor, to) ? 0 : 1.5;
        const newG = current.g - passBonus;  // 중간 도시/마을 경유 우대

        const existingIndex = openSet.findIndex(n => hexCoordsEqual(n.coord, neighbor));
        if (existingIndex >= 0) {
          if (newG < openSet[existingIndex].g) {
            openSet[existingIndex].g = newG;
            openSet[existingIndex].f = newG + openSet[existingIndex].h;
            openSet[existingIndex].parent = current;
          }
        } else {
          const h = hexDistance(neighbor, to);
          openSet.push({
            coord: neighbor,
            g: newG,
            h,
            f: newG + h,
            parent: current,
          });
        }
        continue;
      }

      // 지형 비용 계산 (도시가 아닌 경우만)
      const terrainCost = getTerrainCost(neighbor);
      if (terrainCost === Infinity) continue; // 건설 불가 지형

      const moveCost = terrainCost;
      const newG = current.g + moveCost;

      // 기존 노드 찾기
      const existingIndex = openSet.findIndex(n => hexCoordsEqual(n.coord, neighbor));
      if (existingIndex >= 0) {
        // 더 좋은 경로면 업데이트
        if (newG < openSet[existingIndex].g) {
          openSet[existingIndex].g = newG;
          openSet[existingIndex].f = newG + openSet[existingIndex].h;
          openSet[existingIndex].parent = current;
        }
      } else {
        // 새 노드 추가
        const h = hexDistance(neighbor, to);
        openSet.push({
          coord: neighbor,
          g: newG,
          h,
          f: newG + h,
          parent: current,
        });
      }
    }
  }

  // 경로 없음
  return [];
}

/**
 * 캐시 초기화 (게임 리셋 시 호출)
 */
export function clearPathCache(): void {
  pathCache.clear();
}

/**
 * 지형에 따른 트랙 건설 비용 (공용 헬퍼)
 */
export function getTerrainBuildCost(coord: HexCoord, board: BoardState): number {
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (!hexTile) return GAME_CONSTANTS.PLAIN_TRACK_COST;
  if (hexTile.fixedCost !== undefined) return hexTile.fixedCost; // Germany: 헥스 고정비용 우선

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
 * 좌표가 최적 경로상에 있는지 확인
 */
export function isOnOptimalPath(
  coord: HexCoord,
  from: HexCoord,
  to: HexCoord,
  board: BoardState
): boolean {
  const path = findOptimalPath(from, to, board);
  return path.some(p => hexCoordsEqual(p, coord));
}

/**
 * 좌표가 최적 경로에서 몇 번째 위치인지 반환 (-1: 경로에 없음)
 */
export function getPositionOnPath(
  coord: HexCoord,
  from: HexCoord,
  to: HexCoord,
  board: BoardState
): number {
  const path = findOptimalPath(from, to, board);
  return path.findIndex(p => hexCoordsEqual(p, coord));
}

/**
 * 도시 색상에 맞는 목적지 도시들 찾기
 */
export function findDestinationCities(
  cubeColor: CubeColor,
  board: BoardState
): { cityId: string; coord: HexCoord }[] {
  return board.cities
    .filter(city => city.color === cubeColor)
    .map(city => ({ cityId: city.id, coord: city.coord }));
}

/**
 * 모든 물품 배달 기회 분석
 *
 * 각 도시의 각 물품에 대해 가능한 목적지와 거리 계산
 */
/**
 * 경로의 예상 링크 수 계산 (Multi-link 고려)
 * 1. 기존 트랙을 통한 연결성 확인 (BFS)
 * 2. 미연결 구간은 거리 기반 휴리스틱 적용
 */
function estimateRouteLinkCount(
  from: HexCoord,
  to: HexCoord,
  board: BoardState
): number {
  // 1. 기존 트랙을 통한 최단 링크 수 탐색 (BFS)
  // (트랙이 연결된 경우, 실제 링크 수(거치는 도시/마을 수)를 반환)

  // 큐: [좌표, 현재 링크 수]
  interface BFSNode {
    coord: HexCoord;
    links: number;
  }

  const queue: BFSNode[] = [{ coord: from, links: 0 }];
  const visited = new Set<string>();
  visited.add(hexToKey(from));

  // 최대 탐색 깊이 (무한 루프 방지 및 성능 제한)
  // 트랙이 없는 곳은 탐색하지 않으므로 트랙 수만큼만 돔.

  // 트랙 연결성을 빠르게 확인하기 위해 단순화된 BFS 사용
  // getConnectedNeighbors는 트랙이 있어야만 이웃을 반환하므로,
  // 트랙이 끊긴 구간은 건너뛰지 못함. 
  // 따라서 "완성된 경로"가 있는 경우에만 유효한 값을 반환.

  const trackPathFound = ((): number | null => {
    const localQueue = [...queue];
    const localVisited = new Set(visited);

    // BFS on Grid
    while (localQueue.length > 0) {
      const { coord, links } = localQueue.shift()!;

      // 목적지 도착
      if (hexCoordsEqual(coord, to)) {
        return links;
      }

      // 이웃 탐색 (소유자 무관 - null 전달)
      const neighbors = getConnectedNeighbors(coord, board, null);

      for (const neighbor of neighbors) {
        const key = hexToKey(neighbor);
        if (localVisited.has(key)) continue;
        localVisited.add(key);

        // 도시나 마을을 지나면 링크 수 증가
        // (출발지 제외)
        const isStop = board.cities.some(c => hexCoordsEqual(c.coord, neighbor)) ||
          board.towns.some(t => hexCoordsEqual(t.coord, neighbor));

        const nextLinks = isStop ? links + 1 : links;

        // 가지치기: 너무 먼 경로는 포기 (최대 10 링크?)
        if (nextLinks > 10) continue;

        localQueue.push({ coord: neighbor, links: nextLinks });
      }
    }
    return null;
  })();

  if (trackPathFound !== null) {
    return trackPathFound;
  }

  // 2. 트랙이 없거나 끊긴 경우: 그래프 기반 휴리스틱
  // 도시/마을을 노드로 하고, "건설 가능한 거리"를 엣지로 하는 그래프 탐색

  const nodes = [...board.cities, ...board.towns];
  const targetNode = nodes.find(n => hexCoordsEqual(n.coord, to));
  if (!targetNode) return Math.max(1, Math.round(hexDistance(from, to) / 3)); // should not happen

  // Dijkstra on Cities/Towns
  interface GraphNode {
    id: string; // 좌표 키
    coord: HexCoord;
    cost: number; // 링크 수
  }

  const pq: GraphNode[] = [{ id: hexToKey(from), coord: from, cost: 0 }];
  const costMap = new Map<string, number>();
  costMap.set(hexToKey(from), 0);

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const textNode = pq.shift()!;
    const u = textNode;

    if (hexCoordsEqual(u.coord, to)) return u.cost;

    for (const v of nodes) {
      const vKey = hexToKey(v.coord);
      if (vKey === u.id) continue;

      // 엣지 가중치 계산
      // 1) 이미 트랙으로 연결됨 (소유자 무관) -> Cost 1 (확인 비용이 비쌀 수 있으므로 생략하거나, 위에서 실패했으므로 부분 연결만 체크?)
      //    여기서는 "잠재 연결" 위주로 봄.
      // 2) 거리가 가까움 -> Cost 1

      const dist = hexDistance(u.coord, v.coord);

      // 임계값: 3헥스 이내면 1링크로 건설 가능하다고 가정
      // 4헥스 이상이면 중간에 다른 타운이 필요하거나 2링크로 침?
      // 일단 단순하게 3.5 이하로 설정
      let weight = Infinity;

      if (dist <= 3) {
        weight = 1;
      } else {
        // 거리가 멀면 링크 수가 늘어남 (대략 3헥스당 1링크)
        weight = Math.ceil(dist / 3);
      }

      // 더 정확한 추정을 위해:
      // 만약 두 도시 사이에 "이미 완성된 링크"가 있다면 weight = 1 (확인 로직 필요하나 복잡하므로 생략)

      const newCost = u.cost + weight;
      if (newCost < (costMap.get(vKey) || Infinity)) {
        costMap.set(vKey, newCost);
        pq.push({ id: vKey, coord: v.coord, cost: newCost });
      }
    }
  }

  // Fallback (unreachable in graph?)
  return Math.max(1, Math.round(hexDistance(from, to) / 3));
}

// 배달 기회 분석 메모이즈: 같은 보드 상태(큐브 배치 + 트랙 수)에서는 결과가 동일한데
// 한 턴에 여러 Phase(turnPlan/selector/selectAction/moveGoods)가 반복 호출하므로 캐시한다.
// 키 계산은 도시 수에 선형 — 전수 분석(도시×큐브×목적지 + 링크 추정 BFS)보다 훨씬 싸다.
let opportunitiesCache: { key: string; result: DeliveryOpportunity[] } | null = null;

function getOpportunitiesCacheKey(state: GameState): string {
  const cubeSignature = state.board.cities
    .map(c => `${c.id}:${c.cubes.join(',')}`)
    .join('|');
  // 트랙 위 큐브 변화(배달로 제거 등)도 캐시 키에 반영 — 안 하면 배달 후 stale 기회 사용
  const trackCubeSig = state.board.trackTiles
    .filter(t => t.cube)
    .map(t => `${t.id}:${t.cube}`)
    .join('|');
  return `${state.currentTurn}-t${state.board.trackTiles.length}-${cubeSignature}-${trackCubeSig}`;
}

export function clearOpportunitiesCache(): void {
  opportunitiesCache = null;
}

export function analyzeDeliveryOpportunities(
  state: GameState
): DeliveryOpportunity[] {
  const cacheKey = getOpportunitiesCacheKey(state);
  if (opportunitiesCache && opportunitiesCache.key === cacheKey) {
    return opportunitiesCache.result;
  }

  const opportunities: DeliveryOpportunity[] = [];
  const { board } = state;

  for (const city of board.cities) {
    // Germany: 외국 터미널 위 큐브는 수용색 마커일 뿐 "물품"이 아니다 → 배달 출발점 제외
    if (city.isTerminal) continue;
    // 각 도시의 각 큐브에 대해
    city.cubes.forEach((cubeColor, cubeIndex) => {
      // 해당 색상의 목적지 도시들 찾기
      const destinations = findDestinationCities(cubeColor, board);

      for (const dest of destinations) {
        // 같은 도시는 제외 (자기 자신으로 배달 불가)
        if (dest.cityId === city.id) continue;

        // [수정] 단순 헥스 거리가 아닌, 예상 '링크 수'를 계산
        const linkCount = estimateRouteLinkCount(city.coord, dest.coord, board);

        opportunities.push({
          sourceCityId: city.id,
          sourceCoord: city.coord,
          cubeColor,
          cubeIndex,
          targetCityId: dest.cityId,
          targetCoord: dest.coord,
          distance: linkCount, // 이제 distance 속성은 '링크 수'를 의미함
        });
      }
    });
  }

  // 트랙 위 큐브 → 같은 색 도시 — 맵 config가 'trackCubes'를 income 원천으로 선언한 맵만 (St. Lucia 등).
  // 맵 이름 하드코딩 없이 MapAIConfig.incomeSources로 켜고 끈다. 새 맵은 config만 추가.
  if (getMapAIConfig(state).incomeSources.includes('trackCubes')) {
    for (const track of board.trackTiles) {
      if (!track.cube) continue;
      const destinations = findDestinationCities(track.cube, board);
      for (const dest of destinations) {
        const linkCount = estimateRouteLinkCount(track.coord, dest.coord, board);
        opportunities.push({
          sourceCityId: `track:${track.id}`, // 도시가 아닌 트랙 큐브 출발 (estimateRouteVP는 sourceCoord 사용)
          sourceCoord: track.coord,
          cubeColor: track.cube,
          cubeIndex: 0,
          targetCityId: dest.cityId,
          targetCoord: dest.coord,
          distance: linkCount,
        });
      }
    }
  }

  opportunitiesCache = { key: cacheKey, result: opportunities };
  return opportunities;
}

/**
 * 경로에 해당하는 물품이 있는지 확인
 *
 * 출발 도시에 목적지 색상의 큐브가 있어야 배달 가능
 */
export function hasMatchingCubes(
  state: GameState,
  route: DeliveryRoute
): boolean {
  const { board } = state;

  // 출발 도시 찾기
  const sourceCity = board.cities.find(c => c.id === route.from);
  if (!sourceCity) {
    return false;
  }

  // 목적지 도시 색상 찾기
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!targetCity) {
    return false;
  }

  // 출발 도시에 목적지 색상의 큐브가 있는지 확인
  const hasMatch = sourceCity.cubes.some(cube => cube === targetCity.color);

  return hasMatch;
}


/**
 * 경로 완성도 계산 (0-1)
 *
 * AI의 트랙이 출발지→목적지를 얼마나 연결했는지
 */
export function getRouteProgress(
  state: GameState,
  playerId: PlayerId,
  route: DeliveryRoute
): number {
  const { board } = state;

  // 출발/목적지 도시 찾기
  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return 0;

  // 총 거리
  const totalDistance = hexDistance(sourceCity.coord, targetCity.coord);
  if (totalDistance === 0) return 1;

  // 실제 연결 여부 확인 - 완성되면 1.0 반환
  // [핵심 수정] 
  // - 첫 트랙 건설 시 (내 트랙이 0개): 누구든 완성한 경로는 피함
  // - 이후 건설 시: 자신의 트랙으로만 완성 여부 확인
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
  const checkPlayerId = playerTracks.length === 0 ? undefined : playerId;

  if (isRouteComplete(state, route, checkPlayerId)) {
    debugLog.verbose(`[AI 경로] ${route.from}→${route.to} 경로 완성됨!`);
    return 1.0;
  }

  // 플레이어 트랙 중 경로에 있는 것 찾기 (위에서 이미 선언됨)

  if (playerTracks.length === 0) return 0;

  // 출발지에 가장 가까운 트랙
  let closestToSource = Infinity;
  let closestToTarget = Infinity;

  for (const track of playerTracks) {
    const distToSource = hexDistance(track.coord, sourceCity.coord);
    const distToTarget = hexDistance(track.coord, targetCity.coord);

    closestToSource = Math.min(closestToSource, distToSource);
    closestToTarget = Math.min(closestToTarget, distToTarget);
  }

  // 진행도 = 1 - (남은 거리 / 총 거리)
  const remainingDistance = Math.max(0, closestToSource + closestToTarget - 1);
  const progress = 1 - (remainingDistance / totalDistance);

  return Math.max(0, Math.min(1, progress));
}

/**
 * 상대가 특정 경로를 차단했는지 확인
 */
export function isRouteBlockedByOpponent(
  state: GameState,
  playerId: PlayerId,
  route: DeliveryRoute
): boolean {
  const { board } = state;

  // 출발/목적지 도시 찾기
  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return true;

  // 상대 트랙이 중간에 있으면 차단으로 판단
  // (단순화: 상대 트랙이 경로 상에 있고, AI 트랙이 없으면 차단)
  const opponentTracks = board.trackTiles.filter(t => t.owner !== playerId && t.owner !== null);
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);

  // 간단한 휴리스틱: 상대 트랙이 출발지/목적지에 인접하면 차단 가능성
  for (const track of opponentTracks) {
    const distToSource = hexDistance(track.coord, sourceCity.coord);
    const distToTarget = hexDistance(track.coord, targetCity.coord);

    // 이 경로 상에 내 트랙이 실제로 있는지 확인 (최적 경로 기반)
    const hasOwnTrackForThisRoute = playerTracks.some(t => {
      return isOnOptimalPath(t.coord, sourceCity.coord, targetCity.coord, state.board);
    });

    // 상대 트랙이 경로 중간에 있고
    if (distToSource <= 2 && distToTarget <= 2) {
      // 내 트랙이 경로 상에 없고, AI 트랙이 그 근처에도 없으면 차단
      const aiNearby = playerTracks.some(
        pt => hexDistance(pt.coord, track.coord) <= 1
      );
      if (!aiNearby && !hasOwnTrackForThisRoute) return true;
    }
  }

  return false;
}

/**
 * 특정 도시 엣지로 도달하는 경로 계산
 *
 * 목표 도시의 특정 엣지로 진입하려면 해당 엣지 방향의 인접 헥스에 도달해야 함
 *
 * @param from 출발 좌표
 * @param targetCity 목표 도시 좌표
 * @param targetEdge 목표 도시의 도착 엣지 번호
 * @param board 보드 상태
 * @param playerId 플레이어 ID
 * @returns 경로 (from에서 엔트리 헥스까지), 경로 없으면 빈 배열
 */
export function findPathToEdge(
  from: HexCoord,
  targetCity: HexCoord,
  targetEdge: number,
  board: BoardState,
  playerId: PlayerId
): HexCoord[] {
  // 목표: targetCity에 인접한 헥스 중 targetEdge 방향의 헥스에 도달
  const entryHex = getNeighborHex(targetCity, targetEdge);

  // 맵 밖이거나 호수이면 경로 없음
  const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, entryHex));
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, entryHex));
  if (!hex && !isCity) return [];
  if (hex?.terrain === 'lake') return [];

  // 출발점과 엔트리 헥스가 같으면 이미 도착
  if (hexCoordsEqual(from, entryHex)) {
    return [entryHex];
  }

  // A*로 from → entryHex 경로 계산
  // 상대 트랙을 피하는 A* 사용 (새 파라미터로 확장)
  return findOptimalPathAvoidingOpponent(from, entryHex, board, playerId);
}

/**
 * 상대 트랙을 피하면서 최적 경로 찾기
 *
 * 기존 A*에서 상대 트랙이 있는 헥스를 피하거나 높은 비용 부여
 */
export function findOptimalPathAvoidingOpponent(
  from: HexCoord,
  to: HexCoord,
  board: BoardState,
  playerId: PlayerId,
  avoidCoords?: HexCoord[],
  preferTowns?: boolean, // trackCubes 맵: 경로가 마을을 경유하도록 우대 (마을=링크 경계 → 4-5링크 배달)
): HexCoord[] {
  // A* 알고리즘 구현
  interface Node {
    coord: HexCoord;
    g: number;  // 시작점에서 현재까지 실제 비용
    h: number;  // 현재에서 목적지까지 휴리스틱 (예상 비용)
    f: number;  // g + h
    parent: Node | null;
  }

  const openSet: Node[] = [];
  const closedSet: Set<string> = new Set();
  const coordKey = (c: HexCoord) => `${c.col},${c.row}`;

  // 지형 비용 계산 + 상대 트랙 페널티
  const getTerrainCost = (coord: HexCoord): number => {
    // 회피 좌표는 매우 높은 비용 (불가능하지는 않지만 회피 유도)
    if (avoidCoords?.some(a => hexCoordsEqual(a, coord))) {
      return 100;
    }

    // 도시는 통과 비용 0 (단 Germany 외국 터미널은 통과 불가 → 무한대)
    const cityHere = board.cities.find(c => hexCoordsEqual(c.coord, coord));
    if (cityHere) {
      return cityHere.isTerminal ? Infinity : 0;
    }
    // [trackCubes] 마을 우대 — 경로가 마을을 경유하면 stop(=링크 경계)이 늘어 화물이 더 많은
    // 링크를 지나 배달된다(4-5링크). 약간의 우회를 감수하고 마을을 거치도록 매우 낮은 비용 부여.
    if (preferTowns && board.towns.some(t => hexCoordsEqual(t.coord, coord) && t.newCityColor === null)) {
      return 1.0; // 마을을 우대해 경로가 마을을 경유 → 체인을 깊게(4-5링크) 만든다
    }

    const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
    if (!hex) return Infinity; // 맵 밖
    if (hex.terrain === 'lake') return Infinity; // 호수는 건설 불가

    let baseCost = GAME_CONSTANTS.PLAIN_TRACK_COST;
    if (hex.fixedCost !== undefined) baseCost = hex.fixedCost; // Germany: 헥스 고정비용 우선
    else if (hex.terrain === 'mountain') baseCost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
    else if (hex.terrain === 'river') baseCost = GAME_CONSTANTS.RIVER_TRACK_COST;

    // [Refinement] 내 트랙이 있으면 매우 낮은 비용 (기존 경로 유지 강력 유도)
    // AI가 한 번 길을 닦기 시작하면, 그 길을 최단 경로로 인식하게 함
    // 복합 트랙에서 secondaryOwner로 가진 크로싱도 "내 트랙"(통과 가능) — 안 그러면 내가
    // 방금 깐 크로싱을 상대 트랙으로 보고 회피해 자기 경로를 추적 못 한다.
    const ownTrack = board.trackTiles.find(
      t => (t.owner === playerId || t.secondaryOwner === playerId) && hexCoordsEqual(t.coord, coord)
    );
    if (ownTrack) {
      return 0.1;
    }

    // 상대 트랙이 있으면 높은 비용 (피하도록 유도)
    // 단, 복합 트랙으로 지나갈 수 있으므로 무한대는 아님 (내가 co-own한 타일은 위에서 이미 own 처리)
    const opponentTrack = board.trackTiles.find(
      t => t.owner !== playerId && t.owner !== null && t.secondaryOwner !== playerId && hexCoordsEqual(t.coord, coord)
    );
    if (opponentTrack) {
      // 단순 트랙이면 복합 트랙으로 지나갈 수 있음 (추가 비용)
      // 복합 트랙이면 지나갈 수 없음
      if (opponentTrack.trackType === 'simple') {
        baseCost += 5; // 복합 트랙 비용 추가
      } else {
        return Infinity; // 이미 복합 트랙이면 못 지나감
      }
    }

    return baseCost;
  };

  // 시작 노드
  const startNode: Node = {
    coord: from,
    g: 0,
    h: hexDistance(from, to),
    f: hexDistance(from, to),
    parent: null,
  };
  openSet.push(startNode);

  while (openSet.length > 0) {
    // f 값이 가장 낮은 노드 선택
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    // 목적지 도달
    if (hexCoordsEqual(current.coord, to)) {
      // 경로 재구성
      const path: HexCoord[] = [];
      let node: Node | null = current;
      while (node) {
        path.unshift(node.coord);
        node = node.parent;
      }
      return path;
    }

    closedSet.add(coordKey(current.coord));

    // 6방향 이웃 탐색
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighborHex(current.coord, edge);
      const neighborKey = coordKey(neighbor);

      // 이미 방문한 노드 스킵
      if (closedSet.has(neighborKey)) continue;

      // 지형 비용 계산
      let terrainCost = getTerrainCost(neighbor);
      if (terrainCost === Infinity) continue; // 건설 불가 지형

      // 상대 트랙 엣지 호환성 체크:
      // 교차 트랙을 건설하려면 진입/퇴출 엣지가 기존 트랙 엣지와 겹치면 안 됨
      const currentIsCity = board.cities.some(c => hexCoordsEqual(c.coord, current.coord));
      if (!currentIsCity) {
        // 현재 헥스에 상대 트랙 → 퇴출 엣지 호환성 체크 (내가 co-own한 타일은 상대로 보지 않음)
        const currentOpponentTrack = board.trackTiles.find(
          t => t.owner !== playerId && t.owner !== null && t.secondaryOwner !== playerId &&
            hexCoordsEqual(t.coord, current.coord) && t.trackType === 'simple'
        );
        if (currentOpponentTrack && currentOpponentTrack.edges.includes(edge)) {
          continue; // 이 방향으로 퇴출 불가 (기존 트랙 엣지와 겹침)
        }

        const currentOwnTile = board.trackTiles.find(t => hexCoordsEqual(t.coord, current.coord));
        const currentOwnEdges = currentOwnTile ? playerEdgesAtTrack(currentOwnTile, playerId) : null;
        if (currentOwnTile && currentOwnEdges && !currentOwnEdges.includes(edge)) {
          // 내 복합 트랙(crossing/coexist)은 정해진 두 경로로만 다닐 수 있다 — 레일 없는 방향으론
          // 통과 불가(=막힘). 안 막으면 A*가 내 코엑시스를 도시 쪽으로 직진해 "완성"으로 오판한다.
          if (currentOwnTile.trackType !== 'simple') continue;
          terrainCost += 3; // 내 단순 트랙: 비호환 방향은 비용↑ (복합 추가 여지)
        }
      }
      const neighborIsCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
      if (!neighborIsCity) {
        // 이웃 헥스에 상대 트랙 → 진입 엣지 호환성 체크 (내가 co-own한 타일은 상대로 보지 않음)
        const neighborOpponentTrack = board.trackTiles.find(
          t => t.owner !== playerId && t.owner !== null && t.secondaryOwner !== playerId &&
            hexCoordsEqual(t.coord, neighbor) && t.trackType === 'simple'
        );
        if (neighborOpponentTrack) {
          const entryEdge = (edge + 3) % 6;
          if (neighborOpponentTrack.edges.includes(entryEdge)) {
            continue; // 이 방향에서 진입 불가 (기존 트랙 엣지와 겹침)
          }
        }

        const neighborOwnTile = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor));
        const neighborOwnEdges = neighborOwnTile ? playerEdgesAtTrack(neighborOwnTile, playerId) : null;
        if (neighborOwnTile && neighborOwnEdges) {
          const oppositeEdge = (edge + 3) % 6;
          if (!neighborOwnEdges.includes(oppositeEdge)) {
            // 내 복합 트랙은 레일 있는 변으로만 진입 가능 (위 퇴출 규칙과 대칭)
            if (neighborOwnTile.trackType !== 'simple') continue;
            terrainCost += 3; // 내 단순 트랙: 비호환 방향은 비용↑
          }
        }
      }

      const moveCost = terrainCost;
      const newG = current.g + moveCost;

      // 기존 노드 찾기
      const existingIndex = openSet.findIndex(n => hexCoordsEqual(n.coord, neighbor));
      if (existingIndex >= 0) {
        // 더 좋은 경로면 업데이트
        if (newG < openSet[existingIndex].g) {
          openSet[existingIndex].g = newG;
          openSet[existingIndex].f = newG + openSet[existingIndex].h;
          openSet[existingIndex].parent = current;
        }
      } else {
        // 새 노드 추가
        const h = hexDistance(neighbor, to);
        openSet.push({
          coord: neighbor,
          g: newG,
          h,
          f: newG + h,
          parent: current,
        });
      }
    }
  }

  // 경로 없음
  return [];
}

/**
 * 두 인접 헥스 사이의 연결 엣지 찾기
 *
 * A 헥스에서 B 헥스로 가는 엣지 번호 반환 (-1: 인접하지 않음)
 */
export function getEdgeBetweenHexes(from: HexCoord, to: HexCoord): number {
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(from, edge);
    if (hexCoordsEqual(neighbor, to)) {
      return edge;
    }
  }
  return -1; // 인접하지 않음
}

/**
 * 출발지에서 목적지 방향으로 트랙을 건설하면 유리한지 평가
 *
 * @param trackCoord 트랙 위치
 * @param edges 트랙의 연결 엣지 [entry, exit] (옵션)
 * @param playerId 플레이어 ID (옵션)
 * @param lastBuiltCoord 이번 턴에 마지막으로 건설된 트랙의 좌표 (연속성 평가용)
 */
export function evaluateTrackForRoute(
  route: DeliveryRoute,
  board: BoardState,
  trackCoord: HexCoord,
  edges?: [number, number],
  playerId?: PlayerId,
  lastBuiltCoord?: HexCoord
): { score: number; intention: string } {
  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return { score: 0, intention: '도시 정보 없음' };

  // 최적 경로 찾기 (상대 트랙 회피 고려)
  const optimalPath = playerId
    ? findOptimalPathAvoidingOpponent(sourceCity.coord, targetCity.coord, board, playerId)
    : findOptimalPath(sourceCity.coord, targetCity.coord, board);

  if (optimalPath.length === 0) {
    return { score: 0, intention: '연결 가능한 경로 없음' };
  }

  let score = 0;
  let intention = '';
  const playerTracks = playerId ? board.trackTiles.filter(t => t.owner === playerId) : [];

  // 도시 인접성 미리 계산
  const distToSource = hexDistance(trackCoord, sourceCity.coord);
  const distToTarget = hexDistance(trackCoord, targetCity.coord);
  const isAdjacentToSource = distToSource === 1;
  const isAdjacentToTarget = distToTarget === 1;
  const isSourceConnected = playerTracks.some(t => hexDistance(t.coord, sourceCity.coord) === 1);
  const isTargetConnected = playerTracks.some(t => hexDistance(t.coord, targetCity.coord) === 1);

  // 1. 최적 경로상에 정확히 있으면 최고 점수
  const positionOnPath = optimalPath.findIndex(p => hexCoordsEqual(p, trackCoord));
  const isOnPath = positionOnPath >= 0;

  // 근접 경로 판정: A* 경로에서 1칸 이내면 "대체 경로"로 인정
  let nearestPathIndex = -1;
  let minDistToOptimalPath = Infinity;
  if (!isOnPath) {
    for (let i = 0; i < optimalPath.length; i++) {
      const dist = hexDistance(trackCoord, optimalPath[i]);
      if (dist < minDistToOptimalPath) {
        minDistToOptimalPath = dist;
        nearestPathIndex = i;
      }
    }
  }
  const isNearPath = !isOnPath && minDistToOptimalPath === 1;
  const isOnOrNearPath = isOnPath || isNearPath;

  // 순차 확장 등에 사용할 유효 경로 위치
  const effectivePosition = isOnPath ? positionOnPath : nearestPathIndex;

  debugLog.aiEvaluation(`(${trackCoord.col},${trackCoord.row}) 경로: ${route.from}→${route.to}, 최적경로길이=${optimalPath.length}, 경로상위치=${positionOnPath}, isOnPath=${isOnPath}, isNearPath=${isNearPath}`);

  // 플레이어 트랙과 연결된 경로 위치들 찾기
  const connectedPositions = new Set<number>();
  for (let i = 0; i < optimalPath.length; i++) {
    const pathCoord = optimalPath[i];
    const isPlayerTrack = playerTracks.some(t => hexCoordsEqual(t.coord, pathCoord));
    const isSourceCity = hexCoordsEqual(pathCoord, sourceCity.coord);

    if (isPlayerTrack || isSourceCity) {
      connectedPositions.add(i);
    }
  }

  if (isOnOrNearPath) {
    // 정확히 경로상이면 +150, 1칸 근접이면 +80
    const pathBonus = isOnPath ? 150 : 80;
    score += pathBonus;
    debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): ${isOnPath ? '최적 경로상' : '근접 경로(1칸)'} +${pathBonus} → 누적 ${score}`);

    if (playerId) {
      let maxConnectedIdx = -1;

      connectedPositions.forEach(idx => {
        if (idx > maxConnectedIdx) maxConnectedIdx = idx;
      });

      // 1. 순방향 확장 (출발지 망 -> 목적지 방향) 오직 순차 건설만 허용
      // 근접 경로도 순차 확장으로 인정 (effectivePosition 사용)
      if (maxConnectedIdx !== -1 && effectivePosition === maxConnectedIdx + 1) {
        score += 500; // 순차 확장은 최우선
        intention = '출발지로부터 순차적 확장';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 순차 확장 보너스 +500 → 누적 ${score}`);
      }

      // [Isolation Check] 현재 건설하려는 트랙이 내 네트워크와 떨어져 있는지 확인
      if (maxConnectedIdx !== -1 && effectivePosition > maxConnectedIdx + 1) {
        score -= 500; // 파편화 방지
        intention = '네트워크 고립 건설 경고';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 네트워크 고립 페널티 -500 → 누적 ${score}`);
      }

      // 2. 미래 경로 상에 미리 건설하는 경우 (순차 건설 유도를 위해 점수 낮춤)
      if (maxConnectedIdx !== -1 && effectivePosition > maxConnectedIdx + 1) {
        const distToFrontier = effectivePosition - maxConnectedIdx;
        score += Math.max(0, 5 - distToFrontier * 2);
        if (!intention) intention = '미래 경로 예비 확보';
      }

      // 3. 연속성 보너스 (이번 턴에 방금 지은 트랙 바로 옆에 짓는 경우)
      if (lastBuiltCoord && hexDistance(trackCoord, lastBuiltCoord) === 1) {
        let continuityBonus: number;
        if (isOnOrNearPath) {
          // [Fix B] 방향 확인: edges가 경로 진행 방향을 가리키는지 체크
          // 방향 불일치 연속 건설은 보너스를 대폭 축소
          let directionMatch = true; // edges 없으면 기본 true
          if (edges) {
            const dirRef = isNearPath
              ? optimalPath[nearestPathIndex]
              : (effectivePosition < optimalPath.length - 1 ? optimalPath[effectivePosition + 1] : null);
            if (dirRef) {
              const edgeToDir = getEdgeBetweenHexes(trackCoord, dirRef);
              directionMatch = edgeToDir >= 0 && (edges[0] === edgeToDir || edges[1] === edgeToDir);
            }
          }
          continuityBonus = directionMatch ? 700 : 200;
        } else {
          continuityBonus = 50;  // 경로 이탈 연속 건설: 미미한 보너스
        }
        score += continuityBonus;
        intention = isOnOrNearPath ? '경로상 연속 건설' : '경로 이탈 연속 건설(미미)';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 연속 건설 보너스 +${continuityBonus} (${isOnOrNearPath ? '경로상' : '경로이탈'}) → 누적 ${score}`);
      }

      // 4. 상대방 견제 보너스 (상대방의 예상 경로 상에 있는 경우)
      if (playerId) {
        const opponentAnalysis = analyzeOpponentTracks({ board } as GameState, playerId);

        for (const oppTargetCityId of opponentAnalysis.targetCities) {
          const oppTargetCity = board.cities.find(c => c.id === oppTargetCityId);
          const oppSourceCities = opponentAnalysis.connectedCities.length > 0
            ? opponentAnalysis.connectedCities
            : board.cities.filter(c => c.id !== oppTargetCityId).map(c => c.id);

          for (const oppSourceId of oppSourceCities) {
            const oppSourceCity = board.cities.find(c => c.id === oppSourceId);
            if (oppSourceCity && oppTargetCity) {
              // 상대방의 최적 경로 확인
              if (isOnOptimalPath(trackCoord, oppSourceCity.coord, oppTargetCity.coord, board)) {
                const blockBonus = 100; // 상대방 경로 차단 보너스
                score += blockBonus;
                if (!intention) intention = `상대방(${oppTargetCityId}) 경로 견제`;
                debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 상대 견제 보너스 +100 → 누적 ${score}`);
                break;
              }
            }
          }
        }
      }
    }

    // 2. 엣지 방향 평가 (edges가 제공된 경우)
    if (edges) {
      // 이전/다음 경로 위치 확인 (근접 경로는 effectivePosition 기준)
      const prevPathCoord = effectivePosition > 0 ? optimalPath[effectivePosition - 1] : null;
      const nextPathCoord = effectivePosition < optimalPath.length - 1 ? optimalPath[effectivePosition + 1] : null;

      // 엣지가 이전/다음 경로를 향하는지 확인
      let edgeTowardsPrev = -1;
      let edgeTowardsNext = -1;

      if (prevPathCoord) {
        edgeTowardsPrev = getEdgeBetweenHexes(trackCoord, prevPathCoord);
      }
      if (nextPathCoord) {
        edgeTowardsNext = getEdgeBetweenHexes(trackCoord, nextPathCoord);
      }

      // [Fix A] Near-path 후보는 경로 좌표가 인접하지 않아 edgeTowards가 항상 -1
      // → 방향 페널티가 절대 적용 안 됨. 가장 가까운 경로 좌표를 방향 참조점으로 사용
      if (isNearPath && edgeTowardsNext === -1) {
        const nearestPathCoord = optimalPath[nearestPathIndex];
        edgeTowardsNext = getEdgeBetweenHexes(trackCoord, nearestPathCoord);
      }

      const [edge0, edge1] = edges;

      // 출구 엣지가 다음 경로 위치를 향하면 강력한 보너스 (Frontier Matching 강화)
      if (edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext)) {
        score += 120;  // 다음 경로 방향으로 연결됨!
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 다음 방향 연결 +120 → 누적 ${score}`);
      }

      // 입구 엣지가 이전 경로 위치에서 오면 보너스
      if (edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev)) {
        score += 60;  // 이전 경로에서 연결됨
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 이전 방향 연결 +60 → 누적 ${score}`);
      }

      // [CRITICAL FIX] 두 엣지가 모두 활용되지 않는 경우 페널티 강화
      // 특히 목적지로 가는 방향(edgeTowardsNext)이 전혀 고려되지 않은 트랙은 강력하게 배제
      const edgeMatchesPrev = edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev);
      const edgeMatchesNext = edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext);

      if (edgeTowardsNext >= 0 && !edgeMatchesNext) {
        // 다음 칸으로 가야 할 놈이 엉뚱한 데를 보고 있으면 페널티 (강화)
        score -= 350;
        intention = '목적지 방향 불일치 페널티';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 목적지 방향 불일치 -350 → 누적 ${score}`);
      } else if (!edgeMatchesPrev && !edgeMatchesNext) {
        score -= 100;  // 경로와 무관한 방향
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 경로 무관 방향 -100 → 누적 ${score}`);
      }

      // 이미 연결된 도시에 인접한 경우, 해당 방향으로 더 짓지 않도록 감점
      if (edgeMatchesPrev && effectivePosition === 1 && connectedPositions.has(0)) {
        score -= 100;
      }
      if (edgeMatchesNext && effectivePosition === optimalPath.length - 2 && connectedPositions.has(optimalPath.length - 1)) {
        score -= 100;
      }
    }
  } else {
    // 2. 최적 경로에서 2칸 이상 벗어나면 페널티 (minDistToPath === 1은 isNearPath로 위에서 처리됨)
    const distToTargetFromTrack = hexDistance(trackCoord, targetCity.coord);
    const sourceToTargetDist2 = hexDistance(sourceCity.coord, targetCity.coord);

    if (distToTargetFromTrack > sourceToTargetDist2) {
      score -= 1000; // 역행 페널티
      intention = '역행 건설 금지 (목적지 반대 방향)';
      debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 역행 건설 페널티 -1000 → 누적 ${score}`);
    } else if (minDistToOptimalPath >= 2) {
      score -= 500; // 경로 이탈 페널티
      intention = '심각한 최적 경로 이탈';
      debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 경로 이탈 페널티 -500 → 누적 ${score}`);
    } else {
      score -= 200;
    }
  }

  // 목적지 접근성 확인 (단순 보너스 형태로 전환)
  const currentDistToTarget = hexDistance(trackCoord, targetCity.coord);
  const sourceToTargetDist = hexDistance(sourceCity.coord, targetCity.coord);

  if (currentDistToTarget < sourceToTargetDist) {
    score += 30; // 목적지에 가까워지면 보너스
  }

  // 3. 변수 선정 및 도시 인접성 확인

  if (edges) {
    const [e0, e1] = edges;

    // 출발 도시 인접 시 로직
    if (isAdjacentToSource) {
      const edgeToSource = getEdgeBetweenHexes(trackCoord, sourceCity.coord);
      const connectsToSource = (e0 === edgeToSource || e1 === edgeToSource);

      if (!connectsToSource) {
        // [수정] 도시 비껴가기는 절대 금지 (규칙상 오류로 비춰짐)
        score -= 2000;
        intention = '도시 비껴가기 금지';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 출발 도시 비껴가기 -2000 → 누적 ${score}`);
      } else {
        score += 300; // 보너스 상향
        intention = '출발 도시 연결';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 출발 도시 연결 +300 → 누적 ${score}`);
      }
    }

    // 도착 도시 인접 시 로직
    if (isAdjacentToTarget) {
      const edgeToTarget = getEdgeBetweenHexes(trackCoord, targetCity.coord);
      const connectsToTarget = (e0 === edgeToTarget || e1 === edgeToTarget);

      if (!connectsToTarget) {
        // [Critical] 목적지 비껴가기 차단
        score -= 2000;
        intention = '목적지 비껴가기 금지';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 목적지 비껴가기 -2000 → 누적 ${score}`);
      } else {
        // [핵심 수정] 목적지 연결 완성 보너스는 출발지에서 연결되어 있을 때만
        // 즉, 최적 경로 상에서 이 위치 바로 앞까지 내 트랙이 있어야 함
        let maxConnectedIdx = -1;
        connectedPositions.forEach(idx => {
          if (idx > maxConnectedIdx) maxConnectedIdx = idx;
        });

        // 이 트랙이 경로의 마지막 위치이고, 바로 앞까지 연결되어 있는 경우에만 보너스
        const isLastOnPath = effectivePosition === optimalPath.length - 1;
        const isConnectedToSource = maxConnectedIdx >= effectivePosition - 1;

        if (isOnOrNearPath && isLastOnPath && isConnectedToSource) {
          score += 500;
          intention = '목적 도시 연결 완성';
        } else if (isOnOrNearPath && isLastOnPath) {
          score += 100;
          intention = '목적 도시 인접 (미연결)';
        } else {
          score += 200;
          intention = '목적 도시 인접';
        }
      }
    }

    // 5. 곡률 페널티 (지그재그 방지 - 약화됨: 비용 효율성이 더 중요)
    // 엣지 간의 거리가 1(인접)이 아니면 (즉, 0(유턴)이거나 2이상(급회전)) 감점
    const edgeDiff = Math.abs(e0 - e1);
    const normalizedDiff = edgeDiff > 3 ? 6 - edgeDiff : edgeDiff;

    if (normalizedDiff === 1) {
      score -= 20; // 급격한 회전 페널티 (50 -> 20 약화)
      debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 급회전 페널티 -20 → 누적 ${score}`);
    } else if (normalizedDiff === 0) {
      score -= 500; // U턴 절대 금지 (유지)
      debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): U턴 페널티 -500 → 누적 ${score}`);
    } else if (normalizedDiff === 3) {
      score += 10; // 직선 구간 보너스 (30 -> 10 약화: 최단 경로가 더 중요)
      debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 직선 보너스 +10 → 누적 ${score}`);
    }
  } else {
    // edges가 없는 경우의 기본 근접성 점수 (보수적으로 유지)
    if (isAdjacentToSource && !isSourceConnected) score = Math.max(score, 40);
    if (isAdjacentToTarget && !isTargetConnected) score = Math.max(score, 40);
  }

  // 6. 전체 경로가 이미 완성되었는지 확인 (중복 건설 방지)
  if (board && playerId) {
    const hasAnyOwnTrack = board.trackTiles.some(t => t.owner === playerId);
    const isAlreadyLinked = isRouteCompleteForBoard(board, route);

    if (isAlreadyLinked) {
      if (!hasAnyOwnTrack) {
        // 첫 건설 차례: 타인/본인 완성 루트에도 페널티 (다른 경로 찾도록 유도)
        score -= 2000;
        intention = '이미 연결된 경로 (첫 건설 - 다른 경로 필요)';
        debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 이미 연결된 경로(첫 건설) -2000 → 누적 ${score}`);
      } else {
        // 이미 트랙이 있는 경우: 본인이 완성했는지만 확인
        const isCompletedByMe = isRouteCompleteForBoard(board, route, playerId);
        if (isCompletedByMe) {
          score -= 2000;
          intention = '이미 연결된 경로 (중복 건설 방지)';
          debugLog.aiEvaluation(`  [평가] (${trackCoord.col},${trackCoord.row}): 본인 완성 경로 -2000 → 누적 ${score}`);
        }
        // 타인 완성 루트는 페널티 없음 (확장 허용)
      }
    }
  }

  if (!intention) {
    if (isOnOrNearPath) intention = '최적 경로상 타일 배치';
    else intention = '경로 인접 타일 배치(우회/보조)';
  }

  // 최종 점수 로그
  debugLog.aiEvaluation(`[최종] (${trackCoord.col},${trackCoord.row}): 점수=${score}, 의도="${intention}"`);

  return { score, intention };
}

/**
 * 인접한 상대 트랙 수 계산
 */
export function countNearbyOpponentTracks(
  state: GameState,
  coord: HexCoord,
  playerId: PlayerId,
  radius: number = 2
): number {
  const opponentTracks = state.board.trackTiles.filter(
    t => t.owner !== playerId && t.owner !== null
  );

  return opponentTracks.filter(
    t => hexDistance(t.coord, coord) <= radius
  ).length;
}

/**
 * 상대 트랙 분석 결과
 */
export interface OpponentAnalysis {
  /** 상대가 연결하려는 것으로 추정되는 도시들 */
  targetCities: string[];
  /** 상대 트랙과 각 도시까지의 거리 */
  cityDistances: Map<string, number>;
  /** 상대가 이미 도시에 연결했는지 */
  connectedCities: string[];
  /** 상대 트랙 총 개수 */
  trackCount: number;
}

/**
 * 상대 트랙 분석
 *
 * 상대방의 트랙 위치를 분석하여 어느 도시를 향해 건설 중인지 추론
 */
export function analyzeOpponentTracks(
  state: GameState,
  playerId: PlayerId
): OpponentAnalysis {
  const { board } = state;
  const opponentId = playerId === 'player1' ? 'player2' : 'player1';

  const opponentTracks = board.trackTiles.filter(t => t.owner === opponentId);
  const cityDistances = new Map<string, number>();
  const connectedCities: string[] = [];

  // 각 도시까지 상대 트랙의 최소 거리 계산
  for (const city of board.cities) {
    let minDistance = Infinity;
    let isConnected = false;

    for (const track of opponentTracks) {
      const distance = hexDistance(track.coord, city.coord);
      minDistance = Math.min(minDistance, distance);

      // 거리가 1이면 도시에 인접 (연결됨)
      if (distance === 1) {
        // 트랙의 엣지가 도시를 향하는지 확인
        const edgeToCity = getEdgeBetweenHexes(track.coord, city.coord);
        if (edgeToCity >= 0 && track.edges.includes(edgeToCity)) {
          isConnected = true;
        }
      }
    }

    if (opponentTracks.length > 0) {
      cityDistances.set(city.id, minDistance);
    }

    if (isConnected) {
      connectedCities.push(city.id);
    }
  }

  // 상대가 향하는 목표 도시 추론 (거리 2 이하, 아직 연결 안 된 도시)
  const targetCities: string[] = [];
  cityDistances.forEach((distance, cityId) => {
    if (distance <= 2 && !connectedCities.includes(cityId)) {
      targetCities.push(cityId);
    }
  });

  // 로그 출력 (verbose 모드에서만)
  // if (opponentTracks.length > 0) {
  //   const oppName = state.players[opponentId]?.name || '상대';
  //   debugLog.verbose(`[상대 분석] ${oppName}: `);
  //   debugLog.verbose(`  - 트랙 수: ${opponentTracks.length}`);
  //   debugLog.verbose(`  - 연결된 도시: ${connectedCities.join(', ') || '없음'}`);
  //   debugLog.verbose(`  - 목표 추정 도시: ${targetCities.join(', ') || '없음'}`);
  // }

  return {
    targetCities,
    cityDistances,
    connectedCities,
    trackCount: opponentTracks.length,
  };
}

/**
 * 상대 분석 결과를 바탕으로 전략 점수 조정
 *
 * @returns 각 시나리오별 점수 조정값 (양수: 유리, 음수: 불리)
 */
/**
 * 경로의 중간 도시 목록 반환 (A* 최적 경로 기반)
 * 예: C→I 경로가 C→O→I로 지나가면 ['O'] 반환
 */
export function getIntermediateCities(
  route: DeliveryRoute,
  board: BoardState
): string[] {
  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return [];

  const path = findOptimalPath(sourceCity.coord, targetCity.coord, board);
  const intermediateCities: string[] = [];

  for (const coord of path) {
    const city = board.cities.find(c => hexCoordsEqual(c.coord, coord));
    if (city && city.id !== route.from && city.id !== route.to) {
      intermediateCities.push(city.id);
    }
  }

  return intermediateCities;
}

/**
 * AI의 트랙 네트워크에 연결된 도시 목록 반환
 */
export function getConnectedCities(
  state: GameState,
  playerId: PlayerId
): string[] {
  const { board } = state;
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);

  const connectedCities: string[] = [];

  // Germany 도시 직결 링크(내가 건설한 것)로 이어진 두 도시도 내 네트워크에 속한다
  for (const dl of board.directLinks ?? []) {
    if (dl.owner === playerId) {
      connectedCities.push(dl.cityA, dl.cityB);
    }
  }

  if (playerTracks.length === 0 && connectedCities.length === 0) {
    return []; // 트랙/직결 없으면 연결된 도시 없음 (모든 도시 반환하면 연결성 보너스가 무의미)
  }

  for (const city of board.cities) {
    for (const track of playerTracks) {
      const distance = hexDistance(track.coord, city.coord);
      if (distance === 1) {
        const edgeToCity = getEdgeBetweenHexes(track.coord, city.coord);
        if (edgeToCity >= 0 && track.edges.includes(edgeToCity)) {
          connectedCities.push(city.id);
          break;
        }
      }
    }
  }

  return Array.from(new Set(connectedCities));
}

/**
 * 다중 링크 경로를 단일 링크 세그먼트로 분해
 * 예: C→I (via O) → [C→O, O→I]
 */
export function breakRouteIntoSegments(
  route: DeliveryRoute,
  board: BoardState
): DeliveryRoute[] {
  const intermediateCities = getIntermediateCities(route, board);

  if (intermediateCities.length === 0) {
    return [route];  // 직접 연결, 1링크 경로
  }

  const segments: DeliveryRoute[] = [];
  const cities = [route.from, ...intermediateCities, route.to];

  for (let i = 0; i < cities.length - 1; i++) {
    segments.push({
      from: cities[i],
      to: cities[i + 1],
      priority: route.priority,
    });
  }

  return segments;
}

export function getStrategyAdjustments(
  state: GameState,
  playerId: PlayerId,
  opponentAnalysis: OpponentAnalysis
): Map<string, number> {
  const adjustments = new Map<string, number>();

  // 상대 트랙이 없으면 조정 없음
  if (opponentAnalysis.trackCount === 0) {
    return adjustments;
  }

  // 각 시나리오의 목표 경로와 상대 목표 도시 비교
  // W(Wheeling)는 마을로 변경되어 도시 목록에서 제외됨
  const ALL_SCENARIOS = [
    { name: 'northern_express', routes: ['P', 'C'] },
    { name: 'columbus_hub', routes: ['P', 'C', 'I', 'O'] },
    { name: 'eastern_dominance', routes: ['P', 'O'] },
    { name: 'western_corridor', routes: ['I', 'O', 'P'] },
  ];

  for (const scenario of ALL_SCENARIOS) {
    let adjustment = 0;

    // 상대가 이미 연결한 도시와 시나리오 경로가 겹치면 감점 (완화됨)
    // 복합 트랙으로 상대 경로를 교차/공존할 수 있으므로 감점 축소
    for (const cityId of opponentAnalysis.connectedCities) {
      if (scenario.routes.includes(cityId)) {
        adjustment -= 10;  // 상대가 이미 점령한 도시 (기존 -25 → -10)
        debugLog.verbose(`[전략 조정] ${scenario.name}: ${cityId} 상대 점령 - 10점`);
      }
    }

    // 상대가 향하는 도시와 시나리오 경로가 겹치면 감점 (완화됨)
    for (const cityId of opponentAnalysis.targetCities) {
      if (scenario.routes.includes(cityId)) {
        adjustment -= 5;  // 상대가 향하는 도시 (기존 -15 → -5)
        debugLog.verbose(`[전략 조정] ${scenario.name}: ${cityId} 상대 목표 - 5점`);
      }
    }

    // 상대가 아직 관심 없는 도시에 시나리오가 집중하면 가점
    for (const cityId of scenario.routes) {
      const distance = opponentAnalysis.cityDistances.get(cityId);
      if (distance && distance >= 4) {
        adjustment += 10;  // 상대에게서 먼 도시
      }
    }

    adjustments.set(scenario.name, adjustment);
  }

  return adjustments;
}

/**
 * 해당 경로가 (어떤 플레이어에 의해서든) 이미 연결되어 있는지 확인
 */
/**
 * 보드 상태를 기준으로 경로 완성 여부 확인
 * @param playerId 지정 시 해당 플레이어 트랙으로만 완성 여부 확인, 미지정 시 모든 플레이어 트랙 고려
 */

/**
 * 플레이어의 "가장 큰 하나의 연결 철도(메인 라인)"가 닿는 stop(도시/마을) id 집합.
 * 도시가 여러 개면 도시마다 별도 토막이 생기는데, 여기서만 확장하면 그 토막들 대신
 * 하나의 메인 라인을 이어 키운다(사용자 지침: 토막 금지, 계속 이어서). 트랙 없으면 null.
 */
export function getMainNetworkStopIds(board: BoardState, playerId: PlayerId): Set<string> | null {
  const mine = board.trackTiles.filter(t => t.owner === playerId || t.secondaryOwner === playerId);
  if (mine.length === 0) return null;
  const key = (c: HexCoord) => `${c.col},${c.row}`;
  const byKey = new Map(mine.map(t => [key(t.coord), t]));
  const isStopHex = (c: HexCoord) =>
    board.cities.some(ct => hexCoordsEqual(ct.coord, c)) ||
    board.towns.some(tw => hexCoordsEqual(tw.coord, c) && tw.newCityColor === null);
  const stopMembers = new Map<string, typeof mine>();
  const neighborsOf = (t: typeof mine[0]): typeof mine => {
    const out: typeof mine = [];
    for (const e of [...t.edges, ...(t.secondaryEdges ?? [])]) {
      const nb = getNeighborHex(t.coord, e);
      const nbT = byKey.get(key(nb));
      if (nbT) {
        const back = getConnectingEdge(nb, t.coord);
        const nbEdges = [...nbT.edges, ...(nbT.secondaryEdges ?? [])];
        if (back !== null && back >= 0 && nbEdges.includes(back)) out.push(nbT);
      } else if (isStopHex(nb)) {
        const sk = key(nb);
        const arr = stopMembers.get(sk) ?? [];
        for (const other of arr) if (other !== t) out.push(other);
        if (!arr.includes(t)) { arr.push(t); stopMembers.set(sk, arr); }
      }
    }
    return out;
  };
  const seen = new Set<string>();
  let bestComp: typeof mine = [];
  for (const start of mine) {
    if (seen.has(key(start.coord))) continue;
    const comp: typeof mine = [];
    const stack = [start];
    seen.add(key(start.coord));
    while (stack.length) {
      const t = stack.pop()!;
      comp.push(t);
      for (const nbT of neighborsOf(t)) if (!seen.has(key(nbT.coord))) { seen.add(key(nbT.coord)); stack.push(nbT); }
    }
    if (comp.length > bestComp.length) bestComp = comp;
  }
  const result = new Set<string>();
  const allStops = [
    ...board.cities.map(c => ({ id: c.id, coord: c.coord })),
    ...board.towns.filter(t => t.newCityColor === null).map(t => ({ id: t.id, coord: t.coord })),
  ];
  for (const t of bestComp) {
    for (const e of [...t.edges, ...(t.secondaryEdges ?? [])]) {
      const nb = getNeighborHex(t.coord, e);
      const s = allStops.find(st => hexCoordsEqual(st.coord, nb));
      if (s) result.add(s.id);
    }
  }
  return result;
}

/**
 * 경로 끝점(stop) 좌표 해석: 도시 우선, 없으면 마을
 * (St. Lucia처럼 마을이 경로 끝점이 되는 맵 지원)
 */
export function findStopById(
  board: BoardState,
  id: string,
): { id: string; coord: HexCoord } | null {
  const city = board.cities.find(c => c.id === id);
  if (city) return { id: city.id, coord: city.coord };
  const town = board.towns.find(t => t.id === id);
  if (town) return { id: town.id, coord: town.coord };
  return null;
}

export function isRouteCompleteForBoard(board: BoardState, route: DeliveryRoute, playerId?: PlayerId): boolean {
  const sourceCity = findStopById(board, route.from);
  const targetCity = findStopById(board, route.to);
  if (!sourceCity || !targetCity) return false;

  // BFS로 실제 연결 여부 확인
  const visited = new Set<string>();
  const queue: HexCoord[] = [sourceCity.coord];
  visited.add(`${sourceCity.coord.col},${sourceCity.coord.row}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (hexCoordsEqual(current, targetCity.coord)) return true;

    // playerId가 undefined면 모든 플레이어 트랙 고려, 있으면 해당 플레이어만
    const neighbors = getConnectedNeighbors(current, board, playerId, visited);
    for (const neighbor of neighbors) {
      const key = `${neighbor.col},${neighbor.row}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * 보드 상태를 기준으로 특정 플레이어의 경로 완성 여부 확인
 */
export function isRouteComplete(state: GameState, route: DeliveryRoute, playerId?: PlayerId): boolean {
  const { board } = state;
  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return false;

  // BFS로 실제 연결 여부 확인
  // [수정] 각 노드에 진입 엣지 정보를 추적하여 복합 트랙의 독립 경로 처리
  interface BFSNode {
    coord: HexCoord;
    entryEdge?: number;  // 이 노드에 들어온 엣지 (도시에서 출발하면 undefined)
  }

  const visited = new Set<string>();
  const queue: BFSNode[] = [{ coord: sourceCity.coord, entryEdge: undefined }];
  visited.add(`${sourceCity.coord.col},${sourceCity.coord.row}`);

  while (queue.length > 0) {
    const { coord: current, entryEdge } = queue.shift()!;

    if (hexCoordsEqual(current, targetCity.coord)) {
      debugLog.verbose(`[isRouteComplete 디버그] ${route.from}→${route.to} 연결 찾음!`);
      return true;
    }

    // 만약 playerId가 없으면 '모든 누군가에 의해 완성된 링크'를 찾아야 함
    const targetPlayerId = playerId === undefined ? undefined : (playerId || null);
    const neighbors = getConnectedNeighbors(current, board, targetPlayerId, visited, entryEdge);

    debugLog.verbose(`[isRouteComplete 디버그] ${current.col},${current.row} 이웃: ${neighbors.length} 개`);

    for (const neighbor of neighbors) {
      const key = `${neighbor.col},${neighbor.row}`;
      if (!visited.has(key)) {
        visited.add(key);
        // 다음 노드의 entryEdge: current에서 neighbor로 이동할 때 neighbor가 받는 진입 엣지
        // current에서 neighbor 방향의 엣지를 찾고, 그 반대편이 neighbor의 진입 엣지
        const edgeFromCurrent = getConnectingEdge(current, neighbor);
        const neighborEntryEdge = edgeFromCurrent !== null ? getOppositeEdge(edgeFromCurrent) : undefined;
        queue.push({ coord: neighbor, entryEdge: neighborEntryEdge });
      }
    }
  }

  debugLog.verbose(`[isRouteComplete 디버그] ${route.from}→${route.to} 연결 실패`);
  return false;
}
