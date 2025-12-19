/**
 * AI 보드 분석 함수
 *
 * 물품 배달 기회 분석, 거리 계산, 최적 경로 탐색 등
 */

import { GameState, PlayerId, HexCoord, CubeColor, BoardState, GAME_CONSTANTS } from '@/types/game';
import { DeliveryOpportunity, DeliveryRoute, AIStrategy, DynamicDeliverableRoute } from './types';
import { getNeighborHex, hexCoordsEqual, getBuildableNeighbors } from '@/utils/hexGrid';

// 경로 캐시 (출발지-목적지 → 경로)
const pathCache: Map<string, HexCoord[]> = new Map();

/**
 * 캐시 키 생성
 */
function getCacheKey(from: HexCoord, to: HexCoord): string {
  return `${from.col},${from.row}-${to.col},${to.row}`;
}

/**
 * 두 헥스 간 거리 계산 (Axial 좌표 기반)
 *
 * Odd-r offset 좌표를 axial로 변환 후 거리 계산
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  // Odd-r offset → Axial 변환
  const ax = a.col - Math.floor(a.row / 2);
  const az = a.row;
  const ay = -ax - az;

  const bx = b.col - Math.floor(b.row / 2);
  const bz = b.row;
  const by = -bx - bz;

  // Axial 거리 = max(|dx|, |dy|, |dz|)
  return Math.max(
    Math.abs(ax - bx),
    Math.abs(ay - by),
    Math.abs(az - bz)
  );
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

        const distance = hexDistance(city.coord, dest.coord);

        opportunities.push({
          sourceCityId: city.id,
          sourceCoord: city.coord,
          cubeColor,
          cubeIndex,
          targetCityId: dest.cityId,
          targetCoord: dest.coord,
          distance,
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
    console.log(`[hasMatchingCubes] ${route.from}→${route.to}: 출발 도시 없음`);
    return false;
  }

  // 목적지 도시 색상 찾기
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!targetCity) {
    console.log(`[hasMatchingCubes] ${route.from}→${route.to}: 목적지 도시 없음`);
    return false;
  }

  // 출발 도시에 목적지 색상의 큐브가 있는지 확인
  const hasMatch = sourceCity.cubes.some(cube => cube === targetCity.color);
  console.log(`[hasMatchingCubes] ${route.from}→${route.to}: ${sourceCity.id}의 큐브=[${sourceCity.cubes.join(',')}], 목적지색상=${targetCity.color}, 매칭=${hasMatch}`);

  return hasMatch;
}

/**
 * 경로가 실제로 완성되었는지 확인 (BFS로 연결 여부 확인)
 *
 * 출발 도시에서 목적지 도시까지 플레이어 트랙을 통해 연결되어 있는지 확인
 */
export function isRouteComplete(
  board: BoardState,
  playerId: PlayerId,
  sourceCity: { coord: HexCoord },
  targetCity: { coord: HexCoord }
): boolean {
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
  if (playerTracks.length === 0) return false;

  // BFS로 연결 확인
  const visited = new Set<string>();
  const queue: HexCoord[] = [sourceCity.coord];
  const coordKey = (c: HexCoord) => `${c.col},${c.row}`;

  visited.add(coordKey(sourceCity.coord));

  while (queue.length > 0) {
    const current = queue.shift()!;

    // 목적지 도달
    if (hexCoordsEqual(current, targetCity.coord)) {
      return true;
    }

    // 현재 위치가 도시인지 확인
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, current));

    if (isCity) {
      // 도시는 모든 인접 헥스와 연결 가능
      for (let edge = 0; edge < 6; edge++) {
        const neighbor = getNeighborHex(current, edge);
        const neighborKey = coordKey(neighbor);

        if (visited.has(neighborKey)) continue;

        // 인접한 플레이어 트랙이 있고, 해당 트랙이 도시 방향 엣지를 가지고 있는지 확인
        const neighborTrack = playerTracks.find(t => hexCoordsEqual(t.coord, neighbor));
        if (neighborTrack) {
          // 트랙의 엣지가 현재 도시를 향하는지 확인
          const oppositeEdge = (edge + 3) % 6;
          if (neighborTrack.edges.includes(oppositeEdge)) {
            visited.add(neighborKey);
            queue.push(neighbor);
          }
        }

        // 인접한 도시도 확인 (직접 연결된 도시)
        const neighborCity = board.cities.find(c => hexCoordsEqual(c.coord, neighbor));
        if (neighborCity && !visited.has(neighborKey)) {
          visited.add(neighborKey);
          queue.push(neighbor);
        }
      }
    } else {
      // 현재 위치가 트랙인 경우
      const currentTrack = playerTracks.find(t => hexCoordsEqual(t.coord, current));
      if (currentTrack) {
        // 트랙의 각 엣지 방향으로 탐색
        for (const edge of currentTrack.edges) {
          const neighbor = getNeighborHex(current, edge);
          const neighborKey = coordKey(neighbor);

          if (visited.has(neighborKey)) continue;

          // 인접한 플레이어 트랙 확인
          const neighborTrack = playerTracks.find(t => hexCoordsEqual(t.coord, neighbor));
          if (neighborTrack) {
            // 연결 가능한지 확인 (상대 엣지가 있어야 함)
            const oppositeEdge = (edge + 3) % 6;
            if (neighborTrack.edges.includes(oppositeEdge)) {
              visited.add(neighborKey);
              queue.push(neighbor);
            }
          }

          // 인접한 도시 확인
          const neighborCity = board.cities.find(c => hexCoordsEqual(c.coord, neighbor));
          if (neighborCity) {
            visited.add(neighborKey);
            queue.push(neighbor);
          }
        }
      }
    }
  }

  return false;
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
  if (isRouteComplete(board, playerId, sourceCity, targetCity)) {
    console.log(`[AI 경로] ${route.from}→${route.to} 경로 완성됨!`);
    return 1.0;
  }

  // 플레이어 트랙 중 경로에 있는 것 찾기
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);

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

    // 상대 트랙이 경로 중간에 있고
    if (distToSource <= 2 && distToTarget <= 2) {
      // AI 트랙이 그 근처에 없으면 차단
      const aiNearby = playerTracks.some(
        pt => hexDistance(pt.coord, track.coord) <= 1
      );
      if (!aiNearby) return true;
    }
  }

  return false;
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
 * @param route 목표 배달 경로
 * @param board 보드 상태
 * @param playerId 플레이어 ID (옵션)
 */
export function evaluateTrackForRoute(
  trackCoord: HexCoord,
  route: DeliveryRoute,
  board: BoardState,
  playerId?: PlayerId,
  edges?: [number, number]
): number {
  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return 0;

  // 최적 경로 찾기
  const optimalPath = findOptimalPath(sourceCity.coord, targetCity.coord, board);
  if (optimalPath.length === 0) {
    return 0;
  }

  let score = 0;

  // 1. 최적 경로상에 정확히 있으면 최고 점수
  const positionOnPath = optimalPath.findIndex(p => hexCoordsEqual(p, trackCoord));
  const isOnPath = positionOnPath >= 0;

  if (isOnPath) {
    score += 100;  // 최적 경로상에 있음

    // 경로의 앞쪽일수록 더 높은 점수 (먼저 건설해야 함)
    // 플레이어 트랙이 연결된 위치에서 다음 헥스에 더 높은 점수
    if (playerId) {
      const playerTracks = board.trackTiles.filter(t => t.owner === playerId);

      // 플레이어 트랙과 연결된 경로 위치 찾기
      let lastConnectedPos = -1;
      for (let i = 0; i < optimalPath.length; i++) {
        const pathCoord = optimalPath[i];
        // 도시이거나 플레이어 트랙이 있으면 연결된 것
        const isConnected =
          board.cities.some(c => hexCoordsEqual(c.coord, pathCoord)) ||
          playerTracks.some(t => hexCoordsEqual(t.coord, pathCoord));
        if (isConnected) {
          lastConnectedPos = i;
        }
      }

      // 다음으로 건설해야 할 위치 (연결된 위치 바로 다음)
      const nextBuildPos = lastConnectedPos + 1;
      if (positionOnPath === nextBuildPos) {
        score += 50;  // 다음으로 건설해야 할 위치!
      } else if (positionOnPath === nextBuildPos + 1) {
        score += 30;  // 그 다음 위치
      } else if (positionOnPath === nextBuildPos + 2) {
        score += 10;  // 그 다다음 위치
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

      // 출구 엣지가 다음 경로 위치를 향하면 큰 보너스
      if (edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext)) {
        score += 80;  // 다음 경로 방향으로 연결됨!
      }
      // 입구 엣지가 이전 경로 위치에서 오면 보너스
      if (edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev)) {
        score += 40;  // 이전 경로에서 연결됨
      }

      // 둘 다 경로와 관련 없는 방향이면 큰 감점
      const edgeMatchesPrev = edgeTowardsPrev >= 0 && (edge0 === edgeTowardsPrev || edge1 === edgeTowardsPrev);
      const edgeMatchesNext = edgeTowardsNext >= 0 && (edge0 === edgeTowardsNext || edge1 === edgeTowardsNext);

      if (!edgeMatchesPrev && !edgeMatchesNext) {
        score -= 50;  // 경로와 무관한 방향
      }
    }
  } else {
    // 2. 최적 경로에 없지만 가까우면 중간 점수
    let minDistToPath = Infinity;
    for (const pathCoord of optimalPath) {
      const dist = hexDistance(trackCoord, pathCoord);
      minDistToPath = Math.min(minDistToPath, dist);
    }

    if (minDistToPath === 1) {
      score += 20;  // 경로에서 1칸 떨어짐
    } else if (minDistToPath === 2) {
      score += 5;   // 경로에서 2칸 떨어짐
    }

    // 3. 경로에 없어도 엣지 방향 평가 (목적지 방향으로 가는지)
    if (edges) {
      const [edge0, edge1] = edges;

      // 목적지 도시 방향 확인
      const edgeToTarget = getEdgeBetweenHexes(trackCoord, targetCity.coord);

      // 출발지 도시 방향 확인
      const edgeToSource = getEdgeBetweenHexes(trackCoord, sourceCity.coord);

      // 출구 엣지가 목적지 방향 또는 그와 가까운 방향을 향하면 보너스
      if (edgeToTarget >= 0) {
        // 정확히 목적지 방향
        if (edge0 === edgeToTarget || edge1 === edgeToTarget) {
          score += 40;  // 목적지 방향으로 연결됨
        }
        // 인접 방향 (±1)도 괜찮음
        else if (edge0 === (edgeToTarget + 1) % 6 || edge0 === (edgeToTarget + 5) % 6 ||
                 edge1 === (edgeToTarget + 1) % 6 || edge1 === (edgeToTarget + 5) % 6) {
          score += 20;  // 목적지 인근 방향
        }
      }

      // 입구 엣지가 출발지 방향에서 오면 보너스
      if (edgeToSource >= 0) {
        if (edge0 === edgeToSource || edge1 === edgeToSource) {
          score += 20;  // 출발지에서 연결됨
        }
      }

      // 두 엣지 모두 목적지와 반대 방향(±3)이면 큰 감점
      const oppositeToTarget = edgeToTarget >= 0 ? (edgeToTarget + 3) % 6 : -1;
      if (oppositeToTarget >= 0 &&
          (edge0 === oppositeToTarget || edge1 === oppositeToTarget)) {
        score -= 30;  // 목적지 반대 방향
      }
    }
  }

  return score;
}

/**
 * 트랙 위치를 현재 전략의 모든 미완성 경로에 대해 평가
 *
 * 여러 경로에 도움이 되는 위치(허브, 교차점)에 보너스 부여
 *
 * @param coord 트랙 좌표
 * @param strategy AI 전략
 * @param state 게임 상태
 * @param playerId 플레이어 ID
 * @param edges 트랙 엣지 (옵션)
 * @returns 다중 경로 종합 점수
 */
export function evaluateTrackForMultipleRoutes(
  coord: HexCoord,
  strategy: AIStrategy,
  state: GameState,
  playerId: PlayerId,
  edges?: [number, number]
): number {
  let totalScore = 0;
  let routeCount = 0;

  for (const route of strategy.targetRoutes) {
    // minTurn 조건 확인 (아직 추진할 턴이 아니면 가중치 낮춤)
    const minTurn = route.minTurn ?? 0;
    const isFutureTurn = state.currentTurn < minTurn;

    // 경로 진행도 확인
    const progress = getRouteProgress(state, playerId, route);
    if (progress >= 1.0) continue;  // 완성된 경로 제외

    const routeScore = evaluateTrackForRoute(coord, route, state.board, playerId, edges);
    if (routeScore > 0) {
      routeCount++;
      // 우선순위가 높은 경로에 가중치 (priority 1 = ×3, 2 = ×2, 3 = ×1)
      const priorityWeight = 4 - route.priority;
      // 미래 턴 경로는 가중치 낮춤 (0.5배)
      const turnWeight = isFutureTurn ? 0.5 : 1.0;
      totalScore += routeScore * priorityWeight * turnWeight;
    }
  }

  // 여러 경로에 도움이 되면 교차점/허브 보너스
  if (routeCount >= 2) {
    totalScore += 50 * (routeCount - 1);  // 2경로 +50, 3경로 +100
    console.log(`[AI 다중경로] (${coord.col},${coord.row}) ${routeCount}개 경로에 도움, 교차점 보너스 +${50 * (routeCount - 1)}`);
  }

  return totalScore;
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

  // 로그 출력
  if (opponentTracks.length > 0) {
    console.log(`[상대 분석] ${state.players[opponentId]?.name}:`);
    console.log(`  - 트랙 수: ${opponentTracks.length}`);
    console.log(`  - 연결된 도시: ${connectedCities.join(', ') || '없음'}`);
    console.log(`  - 목표 추정 도시: ${targetCities.join(', ') || '없음'}`);
  }

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
    return board.cities.map(c => c.id);  // 트랙 없으면 모든 도시
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

/**
 * 화물 위치 기반 다중 링크 배달 경로 탐색
 *
 * 현재 화물 위치와 목적지 도시를 분석하여
 * 엔진 레벨 내에서 실행 가능한 경로 목록 반환
 *
 * @param state 게임 상태
 * @param playerId 플레이어 ID
 * @param maxLinks 최대 링크 수 (엔진 레벨)
 * @returns 실행 가능한 배달 경로 목록
 */
export function findMultiLinkDeliveryRoutes(
  state: GameState,
  playerId: PlayerId,
  maxLinks: number
): DeliveryRoute[] {
  const opportunities = analyzeDeliveryOpportunities(state);
  const routes: DeliveryRoute[] = [];
  const seenRoutes = new Set<string>();

  for (const opp of opportunities) {
    const routeKey = `${opp.sourceCityId}-${opp.targetCityId}`;
    if (seenRoutes.has(routeKey)) continue;
    seenRoutes.add(routeKey);

    // 출발지에서 목적지까지 경로 분석
    const tempRoute: DeliveryRoute = {
      from: opp.sourceCityId,
      to: opp.targetCityId,
      priority: 1,
    };
    const segments = breakRouteIntoSegments(tempRoute, state.board);
    const linkCount = segments.length;

    // 엔진 레벨 내에서 실행 가능한 경로만
    if (linkCount <= maxLinks) {
      // 우선순위 계산: 링크 수가 적을수록 높은 우선순위
      const priority = linkCount <= 2 ? 1 : (linkCount <= 4 ? 2 : 3);

      routes.push({
        from: opp.sourceCityId,
        to: opp.targetCityId,
        priority,
        linkCount,
      });
    }
  }

  // 링크 수 오름차순으로 정렬 (짧은 경로 우선)
  routes.sort((a, b) => (a.linkCount ?? 1) - (b.linkCount ?? 1));

  return routes;
}

/**
 * 현재 게임 상태에서 최적의 다중 링크 전략 평가
 *
 * 화물 위치, 도시 색상, 기존 트랙 네트워크를 종합 분석하여
 * 가장 유리한 다중 링크 경로 추천
 */
export function evaluateBestMultiLinkStrategy(
  state: GameState,
  playerId: PlayerId
): { route: DeliveryRoute; score: number }[] {
  const player = state.players[playerId];
  if (!player) return [];

  const engineLevel = player.engineLevel;
  const connectedCities = getConnectedCities(state, playerId);
  const routes = findMultiLinkDeliveryRoutes(state, playerId, Math.max(engineLevel, 3));

  const scoredRoutes: { route: DeliveryRoute; score: number }[] = [];

  for (const route of routes) {
    let score = 0;
    const linkCount = route.linkCount ?? 1;

    // 1. 연결된 도시에서 시작하면 보너스
    if (connectedCities.includes(route.from)) {
      score += 30;
    }

    // 2. 엔진 레벨로 한 번에 배달 가능하면 보너스
    if (linkCount <= engineLevel) {
      score += 25;
    }

    // 3. 2-3링크 경로에 보너스 (가성비 최적)
    if (linkCount >= 2 && linkCount <= 3) {
      score += 20;
    }

    // 4. 경로 진행도 보너스
    const progress = getRouteProgress(state, playerId, route);
    if (progress > 0 && progress < 1.0) {
      score += progress * 40;  // 진행 중인 경로 우선
    }

    // 5. 링크당 수입 효율 (긴 경로일수록 수입 높음)
    score += linkCount * 5;

    scoredRoutes.push({ route, score });
  }

  // 점수 내림차순 정렬
  scoredRoutes.sort((a, b) => b.score - a.score);

  return scoredRoutes;
}

/**
 * 상대 트랙이 경로를 실질적으로 차단했는지 확인
 *
 * 차단 기준:
 * 1. 목적지 도시 주변 6방향 중 4개 이상이 상대 트랙으로 막힘
 * 2. 또는 AI 트랙에서 목적지까지 경로가 완전히 차단됨
 */
export function isRoutePracticallyBlocked(
  state: GameState,
  playerId: PlayerId,
  route: DeliveryRoute
): boolean {
  const { board } = state;

  const sourceCity = board.cities.find(c => c.id === route.from);
  const targetCity = board.cities.find(c => c.id === route.to);
  if (!sourceCity || !targetCity) return true;

  // 상대 트랙만 필터링 (null owner는 미소유 트랙)
  const opponentTracks = board.trackTiles.filter(
    t => t.owner !== playerId && t.owner !== null
  );

  // 상대 트랙이 없으면 차단되지 않음
  if (opponentTracks.length === 0) return false;

  // 1. AI가 이미 목적지에 연결되어 있는지 확인
  let aiConnectedDirections = 0;

  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(targetCity.coord, edge);

    // AI 트랙이 이 방향에 있는지 확인
    const aiTrack = board.trackTiles.find(
      t => t.owner === playerId && hexCoordsEqual(t.coord, neighbor)
    );
    if (aiTrack) {
      const oppositeEdge = (edge + 3) % 6;
      if (aiTrack.edges.includes(oppositeEdge)) {
        aiConnectedDirections++;
      }
    }
  }

  // AI가 이미 연결된 방향이 있으면 차단 아님
  if (aiConnectedDirections > 0) {
    return false;
  }

  // 2. 목적지 도시 주변에 실제로 건설 가능한 위치가 있는지 확인
  const targetBuildable = getBuildableNeighbors(targetCity.coord, board, playerId);
  if (targetBuildable.length === 0) {
    console.log(`[차단 감지] ${route.from}→${route.to}: 목적지 ${route.to} 주변에 건설 가능한 위치 없음`);
    return true;
  }

  // 3. 출발지 도시 주변에 실제로 건설 가능한 위치가 있는지 확인
  // (AI가 이미 출발지에 연결되어 있으면 이 체크는 필요 없음)
  let aiConnectedToSource = false;
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(sourceCity.coord, edge);
    const aiTrack = board.trackTiles.find(
      t => t.owner === playerId && hexCoordsEqual(t.coord, neighbor)
    );
    if (aiTrack) {
      aiConnectedToSource = true;
      break;
    }
  }

  if (!aiConnectedToSource) {
    const sourceBuildable = getBuildableNeighbors(sourceCity.coord, board, playerId);
    if (sourceBuildable.length === 0) {
      console.log(`[차단 감지] ${route.from}→${route.to}: 출발지 ${route.from} 주변에 건설 가능한 위치 없음`);
      return true;
    }
  }

  return false;
}

/**
 * 현재 화물 상황에서 실행 가능한 대안 경로 찾기
 *
 * 차단되지 않은 경로 중 AI가 연결된 도시에서 출발하는 경로 우선
 */
export function findAlternativeRoute(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const opportunities = analyzeDeliveryOpportunities(state);
  const connectedCities = getConnectedCities(state, playerId);

  console.log(`[대안 탐색] 연결된 도시: [${connectedCities.join(', ')}], 배달 기회: ${opportunities.length}개`);

  // 점수화하여 정렬
  interface ScoredAlternative {
    route: DeliveryRoute;
    score: number;
  }

  const alternatives: ScoredAlternative[] = [];

  // 중복 제거를 위한 Set
  const seenRoutes = new Set<string>();

  for (const opp of opportunities) {
    const routeKey = `${opp.sourceCityId}-${opp.targetCityId}`;
    if (seenRoutes.has(routeKey)) continue;
    seenRoutes.add(routeKey);

    const route: DeliveryRoute = {
      from: opp.sourceCityId,
      to: opp.targetCityId,
      priority: 1,
    };

    // 차단된 경로는 제외
    if (isRoutePracticallyBlocked(state, playerId, route)) {
      console.log(`[대안 탐색] ${route.from}→${route.to}: 차단됨 - 제외`);
      continue;
    }

    let score = 0;

    // 연결된 도시에서 출발하면 보너스
    if (connectedCities.includes(route.from)) {
      score += 50;
    }

    // 연결된 도시로 도착하면 보너스
    if (connectedCities.includes(route.to)) {
      score += 30;
    }

    // 거리가 짧을수록 보너스
    score += Math.max(0, 20 - opp.distance * 3);

    alternatives.push({ route, score });
  }

  // 점수순 정렬
  alternatives.sort((a, b) => b.score - a.score);

  if (alternatives.length > 0) {
    const best = alternatives[0];
    console.log(`[대안 탐색] 최적 대안: ${best.route.from}→${best.route.to} (점수: ${best.score})`);
    return best.route;
  }

  console.log(`[대안 탐색] 대안 경로 없음`);
  return null;
}

/**
 * 현재 전략의 모든 경로 중 차단된 경로 목록 반환
 */
export function analyzeBlockedRoutes(
  state: GameState,
  playerId: PlayerId,
  strategy: AIStrategy
): DeliveryRoute[] {
  const blockedRoutes: DeliveryRoute[] = [];

  for (const route of strategy.targetRoutes) {
    if (isRoutePracticallyBlocked(state, playerId, route)) {
      blockedRoutes.push(route);
    }
  }

  if (blockedRoutes.length > 0) {
    console.log(`[차단 분석] ${state.players[playerId]?.name}: ${blockedRoutes.length}개 경로 차단됨`);
    blockedRoutes.forEach(r => console.log(`  - ${r.from}→${r.to}`));
  }

  return blockedRoutes;
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

    // 상대가 이미 연결한 도시와 시나리오 경로가 겹치면 감점
    for (const cityId of opponentAnalysis.connectedCities) {
      if (scenario.routes.includes(cityId)) {
        adjustment -= 25;  // 상대가 이미 점령한 도시
        console.log(`[전략 조정] ${scenario.name}: ${cityId} 상대 점령 -25점`);
      }
    }

    // 상대가 향하는 도시와 시나리오 경로가 겹치면 감점
    for (const cityId of opponentAnalysis.targetCities) {
      if (scenario.routes.includes(cityId)) {
        adjustment -= 15;  // 상대가 향하는 도시
        console.log(`[전략 조정] ${scenario.name}: ${cityId} 상대 목표 -15점`);
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
 * 보드의 모든 배달 가능한 경로를 동적으로 생성
 *
 * 시나리오와 무관하게 현재 화물 색상 → 도시 색상 매칭으로 경로 생성
 * 각 경로에 대해 링크 수, 연결 상태, 진행도 계산
 */
export function findAllDeliverableRoutes(
  state: GameState,
  playerId: PlayerId
): DynamicDeliverableRoute[] {
  const { board } = state;
  const routes: DynamicDeliverableRoute[] = [];
  const connectedCities = getConnectedCities(state, playerId);
  const seenRoutes = new Set<string>();

  console.log(`[동적 경로] ${state.players[playerId]?.name} 연결된 도시: [${connectedCities.join(', ')}]`);

  for (const city of board.cities) {
    // 화물이 없으면 스킵
    if (city.cubes.length === 0) continue;

    // 각 화물 색상에 대해 목적지 찾기
    for (const cubeColor of city.cubes) {
      // 해당 색상의 목적지 도시들 찾기
      const targetCities = board.cities.filter(
        c => c.color === cubeColor && c.id !== city.id
      );

      for (const target of targetCities) {
        // 중복 경로 스킵 (같은 출발-도착)
        const routeKey = `${city.id}-${target.id}`;
        if (seenRoutes.has(routeKey)) continue;
        seenRoutes.add(routeKey);

        // A* 알고리즘으로 최단 경로 계산
        const path = findOptimalPath(city.coord, target.coord, board);
        // 링크 수 = 경로상 도시/마을 수 - 1 (대략적으로 헥스 거리 사용)
        const linkCount = path.length > 0
          ? Math.max(1, countLinksInPath(path, board))
          : hexDistance(city.coord, target.coord);

        // 경로 진행도 계산
        const tempRoute: DeliveryRoute = { from: city.id, to: target.id, priority: 1 };
        const progress = getRouteProgress(state, playerId, tempRoute);

        // 이미 완성된 경로는 스킵
        if (progress >= 1.0) continue;

        routes.push({
          from: city.id,
          to: target.id,
          cubeColor,
          linkCount,
          isSourceConnected: connectedCities.includes(city.id),
          isTargetConnected: connectedCities.includes(target.id),
          progress,
        });
      }
    }
  }

  // 점수 계산하여 정렬 (짧은 경로, 연결된 도시 우선)
  routes.sort((a, b) => {
    // 출발 도시 연결 우선
    if (a.isSourceConnected !== b.isSourceConnected) {
      return a.isSourceConnected ? -1 : 1;
    }
    // 진행도 높은 경로 우선
    if (a.progress !== b.progress) {
      return b.progress - a.progress;
    }
    // 짧은 경로 우선
    return a.linkCount - b.linkCount;
  });

  console.log(`[동적 경로] 총 ${routes.length}개 배달 가능 경로 발견`);
  routes.slice(0, 5).forEach(r => {
    console.log(`  - ${r.from}→${r.to} (${r.cubeColor}, ${r.linkCount}링크, 연결=${r.isSourceConnected}, 진행=${(r.progress * 100).toFixed(0)}%)`);
  });

  return routes;
}

/**
 * 경로에서 링크 수 계산 (도시/마을 간 연결 수)
 */
function countLinksInPath(path: HexCoord[], board: BoardState): number {
  if (path.length <= 1) return 0;

  let linkCount = 0;

  for (let i = 1; i < path.length; i++) {
    const coord = path[i];
    // 도시인지 확인
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    // 마을인지 확인
    const isTown = board.towns?.some(t => hexCoordsEqual(t.coord, coord));

    if (isCity || isTown) {
      linkCount++;
    }
  }

  // 마지막이 목적지 도시면 이미 카운트됨
  return Math.max(1, linkCount);
}
