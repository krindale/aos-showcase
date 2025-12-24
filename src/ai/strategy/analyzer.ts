import { GameState, PlayerId, HexCoord, CubeColor, BoardState, GAME_CONSTANTS } from '@/types/game';
import { debugLog } from '@/utils/debugConfig';
import { DeliveryOpportunity, DeliveryRoute, AIStrategy } from './types';
import { getNeighborHex, hexCoordsEqual, hexDistance, getConnectedNeighbors, hexToKey, getConnectingEdge, getOppositeEdge } from '@/utils/hexGrid';

// 경로 캐시 (출발지-목적지 → 경로)
const pathCache: Map<string, HexCoord[]> = new Map();

/**
 * 캐시 키 생성
 */
function getCacheKey(from: HexCoord, to: HexCoord): string {
  return `${from.col},${from.row}-${to.col},${to.row}`;
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
  const cacheKey = getCacheKey(from, to);
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
    if (hex.terrain === 'mountain') return GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
    if (hex.terrain === 'river') return GAME_CONSTANTS.RIVER_TRACK_COST;
    return GAME_CONSTANTS.PLAIN_TRACK_COST;
  };

  // 도시인지 확인
  const isCity = (coord: HexCoord): boolean => {
    return board.cities.some(c => hexCoordsEqual(c.coord, coord));
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

      // 도시는 통과 가능 (비용 0) - 먼저 체크!
      if (isCity(neighbor)) {
        const newG = current.g + 0;  // 도시 통과 비용 0

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

export function analyzeDeliveryOpportunities(
  state: GameState
): DeliveryOpportunity[] {
  const opportunities: DeliveryOpportunity[] = [];
  const { board } = state;

  for (const city of board.cities) {
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

  return opportunities;
}

/**
 * 특정 시나리오와 매칭되는 물품 기회 찾기
 */
export function findMatchingOpportunities(
  opportunities: DeliveryOpportunity[],
  strategy: AIStrategy
): DeliveryOpportunity[] {
  const matching: DeliveryOpportunity[] = [];

  for (const opportunity of opportunities) {
    for (const route of strategy.targetRoutes) {
      // 출발지 또는 목적지가 매칭되면 추가
      if (opportunity.sourceCityId === route.from ||
        opportunity.targetCityId === route.to) {
        matching.push(opportunity);
        break;  // 중복 추가 방지
      }
    }
  }

  return matching;
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
 * 도시의 사용 가능한 엣지(면) 찾기
 *
 * 각 도시 헥스는 6개의 엣지를 가지고 있으며,
 * 각 엣지에는 하나의 철도만 연결될 수 있음
 *
 * @param cityCoord 도시 좌표
 * @param board 보드 상태
 * @param playerId 플레이어 ID
 * @returns 사용 가능한 엣지 번호 배열 (상대 점유, 호수, 맵 밖 제외)
 */
export function findAvailableCityEdges(
  cityCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId
): number[] {
  const availableEdges: number[] = [];

  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(cityCoord, edge);
    const oppositeEdge = (edge + 3) % 6;

    // 1. 맵 밖이면 제외 (hexTiles에 없음)
    const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, neighbor));
    // 도시 헥스는 hexTiles에 없으므로 도시인지도 확인
    const isNeighborCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
    if (!hex && !isNeighborCity) continue;

    // 2. 호수이면 제외
    if (hex?.terrain === 'lake') continue;

    // 3. 상대 트랙이 이 엣지를 점유하면 제외
    // (상대 트랙이 neighbor 헥스에 있고, oppositeEdge가 도시를 향하면 점유)
    const opponentTrack = board.trackTiles.find(
      t => t.owner !== playerId &&
        t.owner !== null &&
        hexCoordsEqual(t.coord, neighbor) &&
        t.edges.includes(oppositeEdge)
    );
    if (opponentTrack) continue;

    availableEdges.push(edge);
  }

  return availableEdges;
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
  playerId: PlayerId
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
    // 도시는 통과 비용 0
    if (board.cities.some(c => hexCoordsEqual(c.coord, coord))) {
      return 0;
    }

    const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
    if (!hex) return Infinity; // 맵 밖
    if (hex.terrain === 'lake') return Infinity; // 호수는 건설 불가

    let baseCost = GAME_CONSTANTS.PLAIN_TRACK_COST;
    if (hex.terrain === 'mountain') baseCost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
    if (hex.terrain === 'river') baseCost = GAME_CONSTANTS.RIVER_TRACK_COST;

    // [Refinement] 내 트랙이 있으면 매우 낮은 비용 (기존 경로 유지 강력 유도)
    // AI가 한 번 길을 닦기 시작하면, 그 길을 최단 경로로 인식하게 함
    const ownTrack = board.trackTiles.find(
      t => t.owner === playerId && hexCoordsEqual(t.coord, coord)
    );
    if (ownTrack) {
      return 0.1;
    }

    // 상대 트랙이 있으면 높은 비용 (피하도록 유도)
    // 단, 복합 트랙으로 지나갈 수 있으므로 무한대는 아님
    const opponentTrack = board.trackTiles.find(
      t => t.owner !== playerId && t.owner !== null && hexCoordsEqual(t.coord, coord)
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
 * AI 현재 위치에서 목표 도시의 최적 엣지 선택
 *
 * 여러 사용 가능한 엣지 중에서 AI의 현재 위치에서 가장 가까운 엣지를 선택
 *
 * @param currentPos AI의 현재 위치 (마지막 트랙 끝 또는 도시)
 * @param targetCity 목표 도시 좌표
 * @param availableEdges 사용 가능한 엣지 목록
 * @param board 보드 상태
 * @param playerId 플레이어 ID
 * @param remainingTracks 이번 턴에 건설 가능한 트랙 수
 * @returns 최적 경로 및 엣지 또는 null
 */
export function findBestEdgeToCity(
  currentPos: HexCoord,
  targetCity: HexCoord,
  availableEdges: number[],
  board: BoardState,
  playerId: PlayerId,
  remainingTracks: number
): { path: HexCoord[]; edge: number; canComplete: boolean } | null {
  const candidates: { path: HexCoord[]; edge: number; distance: number }[] = [];

  for (const edge of availableEdges) {
    const path = findPathToEdge(currentPos, targetCity, edge, board, playerId);
    if (path.length === 0) continue;

    candidates.push({
      path,
      edge,
      distance: path.length,
    });
  }

  if (candidates.length === 0) return null;

  // 거리순 정렬 (가장 가까운 엣지 우선)
  candidates.sort((a, b) => a.distance - b.distance);

  const best = candidates[0];
  // 도시까지 연결하려면 path.length + 1 (마지막 헥스에서 도시로)
  // 단, path에 출발지가 포함되어 있으므로 실제 건설할 트랙 수는 path.length
  const canComplete = best.distance <= remainingTracks + 1;

  debugLog.verbose(`[AI 트랙] 최적 엣지 선택: edge ${best.edge}, 거리=${best.distance}, 완성가능=${canComplete}`);

  return {
    path: best.path,
    edge: best.edge,
    canComplete,
  };
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

  if (isOnPath) {
    score += 150;  // 최적 경로상에 있음

    if (playerId) {
      let maxConnectedIdx = -1;

      connectedPositions.forEach(idx => {
        if (idx > maxConnectedIdx) maxConnectedIdx = idx;
      });

      // 1. 순방향 확장 (출발지 망 -> 목적지 방향) 오직 순차 건설만 허용
      if (maxConnectedIdx !== -1 && positionOnPath === maxConnectedIdx + 1) {
        score += 400; // 보너스 강화 (250 -> 400)
        intention = '출발지로부터 순차적 확장';
      }

      // [Isolation Check] 현재 건설하려는 트랙이 내 네트워크와 떨어져 있는지 확인
      // 이제 도시에 붙어있더라도 출발지 망과 연결되지 않은 '섬' 건설은 페널티 부여
      if (maxConnectedIdx !== -1 && positionOnPath > maxConnectedIdx + 1) {
        score -= 500; // 페널티 강화 (200 -> 500) 파편화 방지
        intention = '네트워크 고립 건설 경고';
      }

      // 2. 미래 경로 상에 미리 건설하는 경우 (순차 건설 유도를 위해 점수 낮춤)
      if (maxConnectedIdx !== -1 && positionOnPath > maxConnectedIdx + 1) {
        const distToFrontier = positionOnPath - maxConnectedIdx;
        score += Math.max(0, 5 - distToFrontier * 2);
        if (!intention) intention = '미래 경로 예비 확보';
      }

      // 3. 연속성 보너스 (이번 턴에 방금 지은 트랙 바로 옆에 짓는 경우)
      if (lastBuiltCoord && hexDistance(trackCoord, lastBuiltCoord) === 1) {
        score += 1500; // 매우 강력한 보너스로 한 턴 내 파편화 방지
        intention = '번호 연속 건설(연속성 보장)';
      }

      // 4. 상대방 견제 보너스 (상대방의 예상 경로 상에 있는 경우)
      if (playerId) {
        const opponentAnalysis = analyzeOpponentTracks({ board } as GameState, playerId);
        const opponentId = playerId === 'player1' ? 'player2' : 'player1';

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
                break;
              }
            }
          }
        }
      }
    }

    // 2. 엣지 방향 평가 (edges가 제공된 경우)
    if (edges) {
      // 이전/다음 경로 위치 확인
      const prevPathCoord = positionOnPath > 0 ? optimalPath[positionOnPath - 1] : null;
      const nextPathCoord = positionOnPath < optimalPath.length - 1 ? optimalPath[positionOnPath + 1] : null;

      // 엣지가 이전/다음 경로를 향하는지 확인
      let edgeTowardsPrev = -1;
      let edgeTowardsNext = -1;

      if (prevPathCoord) {
        edgeTowardsPrev = getEdgeBetweenHexes(trackCoord, prevPathCoord);
      }
      if (nextPathCoord) {
        edgeTowardsNext = getEdgeBetweenHexes(trackCoord, nextPathCoord);
      }

      const [edge0, edge1] = edges;

      // 출구 엣지가 다음 경로 위치를 향하면 강력한 보너스 (Frontier Matching 강화)
      if (edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext)) {
        score += 120;  // 다음 경로 방향으로 연결됨!
      }

      // 입구 엣지가 이전 경로 위치에서 오면 보너스
      if (edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev)) {
        score += 60;  // 이전 경로에서 연결됨
      }

      // [CRITICAL FIX] 두 엣지가 모두 활용되지 않는 경우 페널티 강화
      // 특히 목적지로 가는 방향(edgeTowardsNext)이 전혀 고려되지 않은 트랙은 강력하게 배제
      const edgeMatchesPrev = edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev);
      const edgeMatchesNext = edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext);

      if (edgeTowardsNext >= 0 && !edgeMatchesNext) {
        // 다음 칸으로 가야 할 놈이 엉뚱한 데를 보고 있으면 페널티 (완화)
        score -= 200;
        intention = '목적지 방향 불일치 페널티';
      } else if (!edgeMatchesPrev && !edgeMatchesNext) {
        score -= 100;  // 경로와 무관한 방향
      }

      // 이미 연결된 도시에 인접한 경우, 해당 방향으로 더 짓지 않도록 감점
      if (edgeMatchesPrev && positionOnPath === 1 && connectedPositions.has(0)) {
        score -= 100; // 감점 강화 (80 -> 100)
      }
      if (edgeMatchesNext && positionOnPath === optimalPath.length - 2 && connectedPositions.has(optimalPath.length - 1)) {
        score -= 100; // 감점 강화 (80 -> 100)
      }
    }
  } else {
    // 2. 최적 경로에 없으면 페널티 (평행 건설 방지)
    let minDistToPath = Infinity;
    for (let i = 0; i < optimalPath.length; i++) {
      const dist = hexDistance(trackCoord, optimalPath[i]);
      if (dist < minDistToPath) {
        minDistToPath = dist;
      }
    }

    // [핵심 해결] 역행 건설 방지: 
    // 1. 최적 경로 상에 없으면서 
    // 2. 건설하려는 칸에서 목적지까지의 거리가 출발지에서 목적지까지의 거리보다 멀어지거나
    // 3. 최적 경로와 너무 동떨어진 경우 강력 페널티
    const distToTarget = hexDistance(trackCoord, targetCity.coord);
    const sourceToTargetDist = hexDistance(sourceCity.coord, targetCity.coord);

    if (distToTarget > sourceToTargetDist) {
      score -= 1000; // 역행 페널티 강화
      intention = '역행 건설 금지 (목적지 반대 방향)';
    } else if (minDistToPath >= 2) {
      score -= 500; // 경로 이탈 페널티 강화
      intention = '심각한 최적 경로 이탈';
    } else if (minDistToPath === 1) {
      // 도시 인접 지역이면 페널티 완화
      const proximityLeniency = (isAdjacentToSource || isAdjacentToTarget) ? 20 : 80;
      score -= proximityLeniency;
      intention = '최적 경로 이탈 (평행 건설 경고)';
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
      } else {
        score += 300; // 보너스 상향
        intention = '출발 도시 연결';
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
      } else {
        // [핵심 수정] 목적지 연결 완성 보너스는 출발지에서 연결되어 있을 때만
        // 즉, 최적 경로 상에서 이 위치 바로 앞까지 내 트랙이 있어야 함
        let maxConnectedIdx = -1;
        connectedPositions.forEach(idx => {
          if (idx > maxConnectedIdx) maxConnectedIdx = idx;
        });

        // 이 트랙이 경로의 마지막 위치이고, 바로 앞까지 연결되어 있는 경우에만 보너스
        const isLastOnPath = positionOnPath === optimalPath.length - 1;
        const isConnectedToSource = maxConnectedIdx >= positionOnPath - 1;

        if (isOnPath && isLastOnPath && isConnectedToSource) {
          score += 500;
          intention = '목적 도시 연결 완성';
        } else if (isOnPath && isLastOnPath) {
          // 경로 마지막이지만 연결 안 됨 - 높은 보너스 (테스트 호환성 및 건설 유도)
          score += 100;
          intention = '목적 도시 인접 (미연결)';
        } else {
          // 경로 상에 없거나 마지막이 아닌 경우라도 연결되면 보너스 (충격 상향: 최적 경로 150점보다 높게)
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
    } else if (normalizedDiff === 0) {
      score -= 500; // U턴 절대 금지 (유지)
    } else if (normalizedDiff === 3) {
      score += 10; // 직선 구간 보너스 (30 -> 10 약화: 최단 경로가 더 중요)
    }
  } else {
    // edges가 없는 경우의 기본 근접성 점수 (보수적으로 유지)
    if (isAdjacentToSource && !isSourceConnected) score = Math.max(score, 40);
    if (isAdjacentToTarget && !isTargetConnected) score = Math.max(score, 40);
  }

  // 6. 전체 경로가 이미 완성되었는지 확인 (중복 건설 방지)
  if (board) {
    // [핵심 요청] 중복 연결 페널티 신설 (이미 망이 연결된 경우)
    const isAlreadyLinked = isRouteCompleteForBoard(board, route);
    if (isAlreadyLinked) {
      score -= 2000;
      intention = '이미 연결된 경로 (중복 건설 방지)';
    }

    if (playerId) {
      const hasAnyOwnTrackOnPath = playerTracks.some(t =>
        optimalPath.some(pathCoord => hexCoordsEqual(t.coord, pathCoord))
      );

      if (!hasAnyOwnTrackOnPath && isAlreadyLinked) {
        // 타인 완공이라도 페널티를 대폭 낮추어 건설 시도를 막지 않음 (기존 로직 유지하되 점수 조정)
        score = Math.min(score, -100);
      }
    }
  }

  if (!intention) {
    if (isOnPath) intention = '최적 경로상 타일 배치';
    else intention = '경로 인접 타일 배치(우회/보조)';
  }

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

  if (playerTracks.length === 0) {
    return board.cities.map(c => c.id); // 트랙 없으면 모든 도시가 잠재적 시작점
  }

  const connectedCities: string[] = [];

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

  return connectedCities;
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
  const ALL_SCENARIOS = [
    { name: 'northern_express', routes: ['P', 'C'] },
    { name: 'columbus_hub', routes: ['P', 'C', 'W', 'I', 'O'] },
    { name: 'eastern_dominance', routes: ['P', 'W', 'O'] },
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
 * 보드 상태를 기준으로 경로 완성 여부 확인 (어떤 플레이어에 의해서든)
 */
export function isRouteCompleteForBoard(board: BoardState, route: DeliveryRoute): boolean {
  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return false;

  // BFS로 실제 연결 여부 확인 (모든 플레이어의 트랙 고려)
  const visited = new Set<string>();
  const queue: HexCoord[] = [sourceCity.coord];
  visited.add(`${sourceCity.coord.col},${sourceCity.coord.row}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (hexCoordsEqual(current, targetCity.coord)) return true;

    // getConnectedNeighbors를 사용할 때 playerId를 넘기지 않거나 undefined를 주면 모든 소유주 트랙을 고려한다고 가정
    // (hexGrid.ts의 getConnectedNeighbors가 그렇게 동작하도록 구현되어 있는지 확인 필요)
    const neighbors = getConnectedNeighbors(current, board, undefined, visited);
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
