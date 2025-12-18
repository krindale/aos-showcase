/**
 * AI 보드 분석 함수
 *
 * 물품 배달 기회 분석, 거리 계산, 최적 경로 탐색 등
 */

import { GameState, PlayerId, HexCoord, CubeColor, BoardState, GAME_CONSTANTS } from '@/types/game';
import { DeliveryOpportunity, DeliveryRoute, AIStrategy } from './types';
import { getNeighborHex, hexCoordsEqual } from '@/utils/hexGrid';

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
  }

  return score;
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
