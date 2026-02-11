// 헥스 그리드 유틸리티 함수
import { debugLog } from '@/utils/debugConfig';
// GameBoardPreview.tsx에서 추출

import { HexCoord, BoardState, PlayerId, CityColor, City } from '@/types/game';

// === 헥스 그리드 상수 ===
export const HEX_SIZE = 55;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// 헥스 중심에서 좌우/상하 끝까지 거리
export const HEX_HORIZONTAL_RADIUS = Math.cos(Math.PI / 6) * HEX_SIZE;
export const HEX_VERTICAL_RADIUS = HEX_SIZE;

// 기본 보드 설정
export const DEFAULT_BOARD_COLS = 7;
export const DEFAULT_BOARD_ROWS = 5;
export const DEFAULT_START_COL = 1;
export const DEFAULT_MARGIN = 50;
export const DEFAULT_PADDING_X = DEFAULT_MARGIN + HEX_HORIZONTAL_RADIUS;
export const DEFAULT_PADDING_Y = DEFAULT_MARGIN + HEX_VERTICAL_RADIUS;

// === 좌표 계산 함수 ===

/**
 * 헥스 그리드 좌표를 픽셀 좌표로 변환 (pointy-top, odd-r offset)
 */
export function hexToPixel(
  col: number,
  row: number,
  startCol: number = DEFAULT_START_COL,
  paddingX: number = DEFAULT_PADDING_X,
  paddingY: number = DEFAULT_PADDING_Y
): { x: number; y: number } {
  const offset = row % 2 === 1 ? HEX_WIDTH / 2 : 0;
  const x = (col - startCol) * HEX_WIDTH + offset + paddingX;
  const y = row * HEX_HEIGHT * 0.75 + paddingY;
  return { x, y };
}

/**
 * 픽셀 좌표를 헥스 그리드 좌표로 변환 (역변환)
 */
export function pixelToHex(
  px: number,
  py: number,
  startCol: number = DEFAULT_START_COL,
  paddingX: number = DEFAULT_PADDING_X,
  paddingY: number = DEFAULT_PADDING_Y
): HexCoord | null {
  // 대략적인 행 계산
  const approxRow = (py - paddingY) / (HEX_HEIGHT * 0.75);
  const row = Math.round(approxRow);

  // 행에 따른 오프셋
  const offset = row % 2 === 1 ? HEX_WIDTH / 2 : 0;

  // 대략적인 열 계산
  const approxCol = (px - paddingX - offset) / HEX_WIDTH + startCol;
  const col = Math.round(approxCol);

  // 해당 헥스 중심과의 거리 확인
  const center = hexToPixel(col, row, startCol, paddingX, paddingY);
  const distance = Math.sqrt((px - center.x) ** 2 + (py - center.y) ** 2);

  // 헥스 반지름 내에 있으면 유효
  if (distance <= HEX_SIZE) {
    return { col, row };
  }

  // 인접 헥스들 확인
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex({ col, row }, edge);
    const neighborCenter = hexToPixel(neighbor.col, neighbor.row, startCol, paddingX, paddingY);
    const neighborDistance = Math.sqrt((px - neighborCenter.x) ** 2 + (py - neighborCenter.y) ** 2);
    if (neighborDistance <= HEX_SIZE) {
      return neighbor;
    }
  }

  return null;
}

/**
 * pointy-top 헥스 꼭지점 계산
 */
export function getHexPoints(cx: number, cy: number, size: number): string {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(' ');
}

/**
 * 헥스 엣지의 중점 좌표 계산
 *
 * Pointy-top 헥스 엣지 번호:
 *         Edge 5    Edge 4
 *     (UPPER-RIGHT) (UPPER-LEFT)
 *            \      /
 *             \    /
 *     Edge 0 ──────── Edge 3
 *     (RIGHT)         (LEFT)
 *             /    \
 *            /      \
 *         Edge 1    Edge 2
 *     (LOWER-RIGHT) (LOWER-LEFT)
 */
export function getEdgeMidpoint(
  cx: number,
  cy: number,
  edge: number,
  size: number
): { x: number; y: number } {
  const angle1 = (Math.PI / 3) * edge - Math.PI / 6;
  const angle2 = (Math.PI / 3) * ((edge + 1) % 6) - Math.PI / 6;
  return {
    x: cx + size * (Math.cos(angle1) + Math.cos(angle2)) / 2,
    y: cy + size * (Math.sin(angle1) + Math.sin(angle2)) / 2,
  };
}

/**
 * 두 엣지를 연결하는 트랙 경로 생성 (SVG path)
 */
export function getTrackPath(
  cx: number,
  cy: number,
  edge1: number,
  edge2: number,
  size: number
): string {
  const p1 = getEdgeMidpoint(cx, cy, edge1, size);
  const p2 = getEdgeMidpoint(cx, cy, edge2, size);

  // 엣지 간 거리 계산 (0-3)
  const diff = Math.abs(edge1 - edge2);
  const edgeDist = Math.min(diff, 6 - diff);

  if (edgeDist === 3) {
    // 직선 트랙 (반대편 엣지)
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  } else {
    // 커브 트랙 - 중앙을 통과하는 베지어 곡선
    return `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`;
  }
}

/**
 * 침목(Railroad ties) 생성 - 트랙을 따라 수직으로 배치
 */
export function getRailroadTies(
  cx: number,
  cy: number,
  edge1: number,
  edge2: number,
  size: number,
  numTies: number = 6
): { x: number; y: number; angle: number }[] {
  const p1 = getEdgeMidpoint(cx, cy, edge1, size);
  const p2 = getEdgeMidpoint(cx, cy, edge2, size);
  const ties: { x: number; y: number; angle: number }[] = [];

  const diff = Math.abs(edge1 - edge2);
  const edgeDist = Math.min(diff, 6 - diff);

  for (let i = 0; i <= numTies; i++) {
    const t = i / numTies;
    let x: number, y: number, angle: number;

    if (edgeDist === 3) {
      // 직선 트랙
      x = p1.x + (p2.x - p1.x) * t;
      y = p1.y + (p2.y - p1.y) * t;
      angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
    } else {
      // 베지어 곡선 트랙
      const oneMinusT = 1 - t;
      x = oneMinusT * oneMinusT * p1.x + 2 * oneMinusT * t * cx + t * t * p2.x;
      y = oneMinusT * oneMinusT * p1.y + 2 * oneMinusT * t * cy + t * t * p2.y;
      // 접선 방향 계산
      const dx = 2 * (1 - t) * (cx - p1.x) + 2 * t * (p2.x - cx);
      const dy = 2 * (1 - t) * (cy - p1.y) + 2 * t * (p2.y - cy);
      angle = Math.atan2(dy, dx) * 180 / Math.PI;
    }

    ties.push({ x, y, angle });
  }

  return ties;
}

/**
 * 이웃 헥스 좌표 계산 (Odd-r offset)
 *
 * Even row (row % 2 == 0):
 *   Edge 0 (E/RIGHT):       (col+1, row)
 *   Edge 1 (SE/LOWER-RIGHT): (col,   row+1)
 *   Edge 2 (SW/LOWER-LEFT):  (col-1, row+1)
 *   Edge 3 (W/LEFT):        (col-1, row)
 *   Edge 4 (NW/UPPER-LEFT):  (col-1, row-1)
 *   Edge 5 (NE/UPPER-RIGHT): (col,   row-1)
 *
 * Odd row (row % 2 == 1):
 *   Edge 0 (E/RIGHT):       (col+1, row)
 *   Edge 1 (SE/LOWER-RIGHT): (col+1, row+1)
 *   Edge 2 (SW/LOWER-LEFT):  (col,   row+1)
 *   Edge 3 (W/LEFT):        (col-1, row)
 *   Edge 4 (NW/UPPER-LEFT):  (col,   row-1)
 *   Edge 5 (NE/UPPER-RIGHT): (col+1, row-1)
 */
export function getNeighborHex(coord: HexCoord, edge: number): HexCoord {
  const { col, row } = coord;
  const isOddRow = row % 2 === 1;

  // Odd-r offset 이웃 오프셋
  const evenRowOffsets: [number, number][] = [
    [1, 0],   // Edge 0: E
    [0, 1],   // Edge 1: SE
    [-1, 1],  // Edge 2: SW
    [-1, 0],  // Edge 3: W
    [-1, -1], // Edge 4: NW
    [0, -1],  // Edge 5: NE
  ];

  const oddRowOffsets: [number, number][] = [
    [1, 0],   // Edge 0: E
    [1, 1],   // Edge 1: SE
    [0, 1],   // Edge 2: SW
    [-1, 0],  // Edge 3: W
    [0, -1],  // Edge 4: NW
    [1, -1],  // Edge 5: NE
  ];

  const offsets = isOddRow ? oddRowOffsets : evenRowOffsets;
  const [dc, dr] = offsets[edge];

  return { col: col + dc, row: row + dr };
}

/**
 * 두 헥스가 인접한지 확인
 */
export function areHexesAdjacent(a: HexCoord, b: HexCoord): boolean {
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(a, edge);
    if (neighbor.col === b.col && neighbor.row === b.row) {
      return true;
    }
  }
  return false;
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
 * 두 헥스 사이의 연결 엣지 찾기
 * A 헥스에서 B 헥스로 연결되는 엣지 번호 반환
 */
export function getConnectingEdge(a: HexCoord, b: HexCoord): number | null {
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(a, edge);
    if (neighbor.col === b.col && neighbor.row === b.row) {
      return edge;
    }
  }
  return null;
}

/**
 * 반대편 엣지 번호 계산
 */
export function getOppositeEdge(edge: number): number {
  return (edge + 3) % 6;
}

/**
 * 헥스 좌표가 동일한지 확인
 */
export function hexCoordsEqual(a: HexCoord, b: HexCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * 헥스 좌표를 문자열 키로 변환
 */
export function hexToKey(coord: HexCoord): string {
  return `${coord.col},${coord.row}`;
}

/**
 * 문자열 키를 헥스 좌표로 변환
 */
export function keyToHex(key: string): HexCoord {
  const [col, row] = key.split(',').map(Number);
  return { col, row };
}

/**
 * 보드 크기 계산
 */
export function calculateBoardDimensions(
  cols: number = DEFAULT_BOARD_COLS,
  rows: number = DEFAULT_BOARD_ROWS,
  startCol: number = DEFAULT_START_COL,
  margin: number = DEFAULT_MARGIN
): { width: number; height: number } {
  const actualCols = cols - startCol + 0.5; // odd row offset
  const width = actualCols * HEX_WIDTH + margin * 2 + HEX_HORIZONTAL_RADIUS * 2;
  const height = (rows - 1) * HEX_HEIGHT * 0.75 + margin * 2 + HEX_VERTICAL_RADIUS * 2;
  return { width, height };
}

// === 트랙 건설 관련 함수 ===

/**
 * 헥스가 건설 대상으로 유효한지 확인 (호수/도시/맵 밖 제외)
 */
export function isValidBuildTarget(coord: HexCoord, board: BoardState): boolean {
  // 맵 경계 내에 있는지 확인
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));

  // 맵 경계 밖인 경우 (hexTile도 없고 도시도 아님)
  if (!hexTile && !isCity) return false;

  // 도시인 경우 건설 불가
  if (isCity) return false;

  // 호수인 경우 건설 불가
  if (hexTile && hexTile.terrain === 'lake') return false;

  // 이미 트랙이 있는 경우 건설 불가 (교체 허용 시 제외)
  const hasTrack = board.trackTiles.some(t => hexCoordsEqual(t.coord, coord));
  if (hasTrack) return false;

  return true;
}

/**
 * 헥스가 건설 대상으로 유효한지 확인 (교체 가능성 포함)
 */
export function isValidBuildTargetWithReplace(
  coord: HexCoord,
  board: BoardState,
  playerId: PlayerId
): boolean {
  // 맵 경계 내에 있는지 확인
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));

  if (!hexTile && !isCity) {
    return false;
  }
  if (isCity) {
    return false;
  }
  if (hexTile && hexTile.terrain === 'lake') {
    return false;
  }

  const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
  if (existingTrack) {
    // 내 'simple' 트랙만 교체(방향 전환) 가능
    if (existingTrack.owner !== playerId || existingTrack.trackType !== 'simple') return false;

    // 완성된 링크의 일부라면 교체 불가
    if (isTrackPartOfCompletedLink(coord, board)) return false;

    return true;
  }

  return true;
}

/**
 * 두 헥스 사이의 트랙 엣지 쌍 계산
 * sourceCoord에서 targetCoord로 연결하는 트랙의 엣지 번호 반환
 * 반환값: [sourceEdge (targetCoord 방향), oppositeEdge (sourceCoord 방향)]
 */
export function calculateTrackEdges(
  sourceCoord: HexCoord,
  targetCoord: HexCoord
): [number, number] | null {
  // sourceCoord에서 targetCoord로 가는 엣지 찾기
  const sourceEdge = getConnectingEdge(sourceCoord, targetCoord);
  if (sourceEdge === null) return null;

  // 반대편 엣지 계산 (targetCoord에서 sourceCoord 방향)
  const oppositeEdge = getOppositeEdge(sourceEdge);

  return [sourceEdge, oppositeEdge];
}

/**
 * 연결점에서 건설 가능한 이웃 헥스 목록 반환
 * sourceCoord: 도시 또는 플레이어의 기존 트랙이 있는 헥스
 * 반환값: { coord: 건설 대상 헥스, sourceEdge: sourceCoord에서 나가는 엣지, targetEdge: 대상 헥스로 들어가는 엣지 }
 */
export function getBuildableNeighbors(
  sourceCoord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId,
  allowReplace: boolean = false
): { coord: HexCoord; sourceEdge: number; targetEdge: number }[] {
  const buildableNeighbors: { coord: HexCoord; sourceEdge: number; targetEdge: number }[] = [];

  // sourceCoord가 도시인지 확인
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, sourceCoord));

  // sourceCoord에 트랙이 있는지 확인 (소유권 필터 없이)
  const trackAtSource = board.trackTiles.find(t => hexCoordsEqual(t.coord, sourceCoord));

  // 플레이어 소유 여부 확인 (기본 경로 또는 보조 경로)
  const isPlayerOwned = trackAtSource && (
    trackAtSource.owner === currentPlayer ||
    trackAtSource.secondaryOwner === currentPlayer
  );

  // 연결 가능한 엣지 목록 결정
  let availableEdges: number[];

  if (isCity) {
    // 도시: 모든 6개 엣지에서 연결 가능
    availableEdges = [0, 1, 2, 3, 4, 5];
  } else if (isPlayerOwned && trackAtSource) {
    // 플레이어 트랙: 플레이어 소유 경로의 엣지에서만 연결 가능 (복합 트랙 지원)
    availableEdges = [];

    // 기본 경로가 내 소유이면 해당 엣지 추가
    if (trackAtSource.owner === currentPlayer) {
      availableEdges.push(...trackAtSource.edges);
    }

    // 보조 경로가 내 소유이면 해당 엣지 추가
    if (trackAtSource.secondaryOwner === currentPlayer && trackAtSource.secondaryEdges) {
      availableEdges.push(...trackAtSource.secondaryEdges);
    }
  } else {
    // 유효하지 않은 연결점
    return [];
  }

  // 각 가능한 엣지에서 이웃 헥스 확인
  for (const sourceEdge of availableEdges) {
    const neighbor = getNeighborHex(sourceCoord, sourceEdge);

    // 건설 가능한 대상인지 확인
    const isValid = allowReplace
      ? isValidBuildTargetWithReplace(neighbor, board, currentPlayer)
      : isValidBuildTarget(neighbor, board);

    if (isValid) {
      const targetEdge = getOppositeEdge(sourceEdge);
      buildableNeighbors.push({
        coord: neighbor,
        sourceEdge,
        targetEdge,
      });
    }
  }

  return buildableNeighbors;
}

/**
 * 헥스가 맵 경계 내에 있는지 확인
 */
export function isWithinBounds(
  coord: HexCoord,
  cols: number = DEFAULT_BOARD_COLS,
  rows: number = DEFAULT_BOARD_ROWS,
  startCol: number = DEFAULT_START_COL
): boolean {
  return (
    coord.col >= startCol &&
    coord.col < startCol + cols &&
    coord.row >= 0 &&
    coord.row < rows
  );
}

/**
 * 대상 헥스에서 나갈 수 있는 방향들 계산
 * entryEdge: 들어오는 엣지 (이 엣지는 제외)
 * 호수, 도시, 기존 트랙이 있는 방향은 제외
 */
export function getExitDirections(
  targetCoord: HexCoord,
  entryEdge: number,
  board: BoardState
): { exitEdge: number; neighborCoord: HexCoord }[] {
  const exitDirections: { exitEdge: number; neighborCoord: HexCoord }[] = [];

  // 6개 엣지 중 entryEdge를 제외한 나머지 확인
  for (let edge = 0; edge < 6; edge++) {
    if (edge === entryEdge) continue; // 들어온 방향은 제외

    const neighbor = getNeighborHex(targetCoord, edge);

    // 호수인지 확인
    const isLake = board.hexTiles.some(
      h => hexCoordsEqual(h.coord, neighbor) && h.terrain === 'lake'
    );
    if (isLake) continue;

    // 나가는 방향이 유효하면 추가
    exitDirections.push({
      exitEdge: edge,
      neighborCoord: neighbor,
    });
  }

  return exitDirections;
}

// === 물품 이동 경로 찾기 ===

/**
 * 트랙을 통해 연결된 이웃 헥스/도시 찾기
 * 현재 헥스(도시 또는 트랙)에서 트랙을 통해 이동 가능한 다음 위치들 반환
 *
 * 주의: 물품 이동 시 모든 플레이어의 완성된 철도 링크를 사용할 수 있음
 * (해당 링크 소유자가 수입을 받음)
 */
/**
 * 특정 지점에서 연결된 인접 헥스들 찾기
 * 
 * @param entryEdge 현재 헥스에 들어온 엣지 (복합 트랙에서 같은 경로만 따라가기 위해 필요)
 */
export function getConnectedNeighbors(
  currentCoord: HexCoord,
  board: BoardState,
  playerId?: PlayerId | null,
  visitedKey: Set<string> = new Set(),
  entryEdge?: number  // 어느 방향에서 들어왔는지 (복합 트랙 처리용)
): HexCoord[] {
  const neighbors: HexCoord[] = [];

  // 현재 위치가 도시인지 확인
  const isCurrentCity = board.cities.some(c => hexCoordsEqual(c.coord, currentCoord));

  // 현재 위치가 트랙인지 확인 (소유자 무관)
  const currentTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, currentCoord));


  if (isCurrentCity) {
    // 도시에서: 6방향 모두에서 완성된 트랙이 연결되어 있는지 확인
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighborHex(currentCoord, edge);
      const neighborKey = hexToKey(neighbor);
      if (visitedKey.has(neighborKey)) {
        continue;
      }

      // 이웃에 트랙이 있고, 해당 트랙이 현재 도시 방향으로 연결되어 있는지 확인
      let neighborTracks = board.trackTiles.filter(t => hexCoordsEqual(t.coord, neighbor));
      if (playerId !== undefined && playerId !== null) {
        neighborTracks = neighborTracks.filter(t => t.owner === playerId || t.secondaryOwner === playerId);
      }

      for (const t of neighborTracks) {
        const neighborEntryEdge = getOppositeEdge(edge);

        // 1. 기본 경로 확인
        if (t.edges.includes(neighborEntryEdge)) {
          neighbors.push(neighbor);
          break; // 한 쪽이라도 연결되면 이웃으로 인정
        }

        // 2. 복합 트랙의 보조 경로 확인
        if (t.secondaryEdges && t.secondaryEdges.includes(neighborEntryEdge)) {
          neighbors.push(neighbor);
          break;
        }
      }
    }
  } else if (currentTrack) {
    // 트랙에서: 트랙의 경로를 따라 이동
    // [핵심 수정] 복합 트랙에서는 같은 경로(edges 또는 secondaryEdges) 내에서만 이동 가능

    let currentCoordTracks = board.trackTiles.filter(t => hexCoordsEqual(t.coord, currentCoord));
    if (playerId) {
      currentCoordTracks = currentCoordTracks.filter(t => t.owner === playerId || t.secondaryOwner === playerId);
    }

    // 사용 가능한 출구 엣지와 해당 소유자 수집
    // [핵심] entryEdge가 주어지면, 해당 엣지가 속한 경로의 다른 엣지만 출구로 사용
    const outgoingEdgesAndOwners = new Map<number, Set<PlayerId>>();

    currentCoordTracks.forEach(t => {
      // 기본 경로 (edges) 처리
      if (t.owner) {
        const isEntryInPrimary = entryEdge !== undefined && t.edges.includes(entryEdge);
        const isEntryInSecondary = entryEdge !== undefined && t.secondaryEdges?.includes(entryEdge);

        // entryEdge가 없거나, entryEdge가 primary 경로에 있으면 primary 출구 사용 가능
        if (entryEdge === undefined || isEntryInPrimary) {
          // primary 경로가 playerId와 일치하는지 확인
          if (!playerId || t.owner === playerId) {
            t.edges.forEach(e => {
              // entryEdge와 다른 엣지만 출구로 사용 (들어온 방향으로 되돌아가지 않음)
              if (e !== entryEdge) {
                if (!outgoingEdgesAndOwners.has(e)) outgoingEdgesAndOwners.set(e, new Set());
                outgoingEdgesAndOwners.get(e)!.add(t.owner!);
              }
            });
          }
        }

        // entryEdge가 없거나, entryEdge가 secondary 경로에 있으면 secondary 출구 사용 가능
        if (t.secondaryEdges && t.secondaryOwner) {
          if (entryEdge === undefined || isEntryInSecondary) {
            // secondary 경로가 playerId와 일치하는지 확인
            if (!playerId || t.secondaryOwner === playerId) {
              t.secondaryEdges.forEach(e => {
                if (e !== entryEdge) {
                  if (!outgoingEdgesAndOwners.has(e)) outgoingEdgesAndOwners.set(e, new Set());
                  outgoingEdgesAndOwners.get(e)!.add(t.secondaryOwner!);
                }
              });
            }
          }
        }
      }
    });

    const outgoingEdges = Array.from(outgoingEdgesAndOwners.keys());

    for (const edge of outgoingEdges) {
      const neighbor = getNeighborHex(currentCoord, edge);
      const neighborKey = hexToKey(neighbor);
      if (visitedKey.has(neighborKey)) {
        continue;
      }

      // 이웃이 도시인지 확인
      const isNeighborCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
      if (isNeighborCity) {
        neighbors.push(neighbor);
        continue;
      }

      // 이웃에 트랙이 있고, 연결되어 있는지 확인
      const neighborTracks = board.trackTiles.filter(t => hexCoordsEqual(t.coord, neighbor));

      // [중요: 링크 규칙] 트랙 간의 연결은 소유자가 같아야 함
      const currentEdgeOwners = outgoingEdgesAndOwners.get(edge) || new Set<PlayerId>();

      for (const t of neighborTracks) {
        const neighborEntryEdge = getOppositeEdge(edge);

        // 1. 소유권 확인: 현재 헥스의 해당 엣지를 나가는 소유자 중 하나가 이웃 트랙의 해당 엣지 소유자와 같아야 함
        // [핵심] 이웃 트랙에서도 entryEdge가 속한 경로의 소유자와 일치해야 함
        const isBasicMatch = t.edges.includes(neighborEntryEdge) && t.owner && currentEdgeOwners.has(t.owner);
        const isSecondaryMatch = t.secondaryEdges && t.secondaryEdges.includes(neighborEntryEdge) && t.secondaryOwner && currentEdgeOwners.has(t.secondaryOwner);

        // 2. 만약 특정 플레이어의 망을 탐색 중이라면(playerId 존재), 해당 플레이어 소유여야 함
        const matchesRequest = !playerId || t.owner === playerId || t.secondaryOwner === playerId;

        if ((isBasicMatch || isSecondaryMatch) && matchesRequest) {
          debugLog.verbose(`  edge ${edge}: 이웃 (${neighbor.col}, ${neighbor.row}) 트랙 확인, 소유자 매칭 성공! 필요한 entryEdge: ${neighborEntryEdge}`);
          neighbors.push(neighbor);
          break;
        }
      }
    }
  } else {
    debugLog.verbose(`[탐색 불가] 도시도 아니고 완성된 트랙도 아님`);
  }

  debugLog.verbose(`[getConnectedNeighbors] 결과: ${neighbors.length}개 이웃 발견`);
  return neighbors;
}

/**
 * 특정 지점에서 시작하여 연결된 모든 헥스(도시/트랙) 찾기 (BFS)
 */
export function findAllConnectedHexes(
  start: HexCoord,
  board: BoardState,
  playerId: PlayerId
): Set<HexCoord> {
  const visited = new Set<string>();
  const connected = new Set<HexCoord>();
  const queue: HexCoord[] = [start];

  const startKey = hexToKey(start);
  visited.add(startKey);

  while (queue.length > 0) {
    const current = queue.shift()!;
    connected.add(current);

    //getConnectedNeighbors를 사용하여 현재 플레이어 망으로 연결된 이웃 탐색
    const neighbors = getConnectedNeighbors(current, board, playerId, visited);
    for (const neighbor of neighbors) {
      const key = hexToKey(neighbor);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  return connected;
}

/**
 * 출발 도시에서 목적지 도시까지의 모든 경로 찾기 (DFS)
 * 반환: 모든 유효한 경로 배열 (각 경로는 HexCoord 배열)
 */
function findAllPaths(
  start: HexCoord,
  end: HexCoord,
  board: BoardState,
  playerId: PlayerId,
  maxLength: number
): HexCoord[][] {
  const allPaths: HexCoord[][] = [];

  function dfs(
    current: HexCoord,
    path: HexCoord[],
    visited: Set<string>,
    linkCount: number,
    entryEdge?: number  // 현재 노드에 진입한 엣지 (복합 트랙 경로 분리용)
  ) {
    // 목적지 도착
    if (hexCoordsEqual(current, end) && linkCount > 0) {
      allPaths.push([...path]);
      return;
    }

    // entryEdge를 전달하여 복합 트랙에서 올바른 경로만 사용
    const neighbors = getConnectedNeighbors(current, board, playerId, visited, entryEdge);

    for (const neighbor of neighbors) {
      // 링크 카운트: "완성된 철도 링크" = 도시/마을 사이의 연결 (중간 트랙 수 무관)
      // 도시/마을에 도착할 때만 링크 카운트 증가
      const isNeighborCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
      const isNeighborTown = board.towns.some(t => hexCoordsEqual(t.coord, neighbor));
      const newLinkCount = (isNeighborCity || isNeighborTown) ? linkCount + 1 : linkCount;

      // 최대 링크 수 초과 시 건너뛰기
      if (newLinkCount > maxLength) {
        continue;
      }

      // 다음 노드의 entryEdge 계산
      const edgeFromCurrent = getConnectingEdge(current, neighbor);
      const neighborEntryEdge = edgeFromCurrent !== null ? getOppositeEdge(edgeFromCurrent) : undefined;

      const neighborKey = hexToKey(neighbor);
      visited.add(neighborKey);
      path.push(neighbor);

      // entryEdge를 전달하여 복합 트랙 경로 유지
      dfs(neighbor, path, visited, newLinkCount, neighborEntryEdge);

      path.pop();
      visited.delete(neighborKey);
    }
  }

  const startKey = hexToKey(start);
  const visited = new Set<string>([startKey]);
  dfs(start, [start], visited, 0, undefined);  // 도시에서 시작이므로 entryEdge = undefined

  return allPaths;
}

/**
 * 경로의 링크 수 계산 (도시/마을 사이의 완성된 연결 수)
 */
function countPathLinks(path: HexCoord[], board: BoardState): number {
  let linkCount = 0;
  for (const coord of path) {
    // 도시/마을을 지날 때마다 링크 카운트 (시작점 제외)
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, coord));
    if (isCity || isTown) {
      linkCount++;
    }
  }
  // 시작점은 링크에 포함되지 않으므로 -1
  return Math.max(0, linkCount - 1);
}

/**
 * 출발 도시에서 목적지 도시까지 가장 긴 경로 찾기
 * cubeColor: 이동할 물품의 색상 (목적지 도시 색상과 일치해야 함)
 * engineLevel: 플레이어의 엔진 레벨 (최대 이동 링크 수)
 * 반환: 가장 긴 유효한 경로 또는 null
 */
export function findLongestPath(
  startCityCoord: HexCoord,
  targetCityCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId,
  engineLevel: number,
  cubeColor: CityColor
): HexCoord[] | null {
  // 목적지 도시 확인
  const targetCity = board.cities.find(c => hexCoordsEqual(c.coord, targetCityCoord));
  if (!targetCity) return null;

  // 물품 색상과 도시 색상 일치 확인
  if (targetCity.color !== cubeColor) return null;

  // 출발지와 목적지가 같으면 안됨
  if (hexCoordsEqual(startCityCoord, targetCityCoord)) return null;

  // 모든 경로 찾기
  const allPaths = findAllPaths(
    startCityCoord,
    targetCityCoord,
    board,
    playerId,
    engineLevel
  );

  if (allPaths.length === 0) return null;

  // 가장 긴 경로 선택 (링크 수 기준)
  let longestPath = allPaths[0];
  let maxLinks = countPathLinks(longestPath, board);

  for (const path of allPaths) {
    const links = countPathLinks(path, board);
    if (links > maxLinks) {
      maxLinks = links;
      longestPath = path;
    }
  }

  return longestPath;
}

/**
 * 물품이 이동 가능한 모든 목적지 도시 찾기
 */
export function findReachableDestinations(
  startCityCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId,
  engineLevel: number,
  cubeColor: CityColor
): City[] {
  const reachable: City[] = [];

  // 같은 색상의 도시들 찾기
  const sameColorCities = board.cities.filter(
    c => c.color === cubeColor && !hexCoordsEqual(c.coord, startCityCoord)
  );

  for (const city of sameColorCities) {
    const path = findLongestPath(
      startCityCoord,
      city.coord,
      board,
      playerId,
      engineLevel,
      cubeColor
    );
    if (path) {
      reachable.push(city);
    }
  }

  return reachable;
}

/**
 * 완성된 철도 링크 정보
 */
export interface CompletedLink {
  id: string;
  owner: PlayerId;
  trackTiles: HexCoord[];  // 링크에 포함된 트랙 타일들
  startCity: HexCoord;     // 시작 도시/마을
  endCity: HexCoord;       // 끝 도시/마을
  centerPosition: { x: number; y: number };  // 마커 표시 위치
}

/**
 * 모든 완성된 철도 링크 찾기
 * 완성된 링크 = 도시/마을에서 다른 도시/마을까지 연결된 트랙 그룹
 */
export function findCompletedLinks(board: BoardState): CompletedLink[] {
  const completedLinks: CompletedLink[] = [];
  const processedTrackIds = new Set<string>();

  // 모든 도시와 마을에서 시작
  const startPoints = [
    ...board.cities.map(c => c.coord),
    ...board.towns.map(t => t.coord),
  ];

  for (const startPoint of startPoints) {
    // 이 도시/마을에 연결된 트랙 찾기
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighborHex(startPoint, edge);
      const track = board.trackTiles.find(
        t => hexCoordsEqual(t.coord, neighbor) && t.owner !== null
      );

      if (!track) continue;

      // owner가 null이 아닌 트랙만 찾았으므로 안전하게 추출
      const trackOwner = track.owner;
      if (!trackOwner) continue;

      // 트랙이 이 도시 방향으로 연결되어 있는지 확인
      const entryEdge = getOppositeEdge(edge);
      if (!track.edges.includes(entryEdge)) continue;

      // 이미 처리된 트랙이면 건너뛰기
      const trackKey = hexToKey(track.coord);
      if (processedTrackIds.has(trackKey)) continue;

      // 이 트랙에서 시작해서 다른 도시/마을까지 경로 추적
      const linkResult = traceLinkFromTrack(
        track.coord,
        entryEdge,
        board,
        trackOwner,
        processedTrackIds
      );

      if (linkResult) {
        // 양방향 중복 방지를 위해 좌표를 정렬하여 고유 ID 생성
        const [minCoord, maxCoord] = [startPoint, linkResult.endCity].sort((a, b) =>
          a.col !== b.col ? a.col - b.col : a.row - b.row
        );
        const linkId = `link-${trackOwner}-${minCoord.col}-${minCoord.row}-${maxCoord.col}-${maxCoord.row}`;

        // 이미 추가된 링크인지 확인
        if (completedLinks.some(l => l.id === linkId)) continue;

        completedLinks.push({
          id: linkId,
          owner: trackOwner,
          trackTiles: linkResult.trackTiles,
          startCity: startPoint,
          endCity: linkResult.endCity,
          centerPosition: calculateLinkCenter(linkResult.trackTiles),
        });
      }
    }
  }

  return completedLinks;
}

/**
 * 트랙에서 시작해서 다른 도시/마을까지 추적
 */
function traceLinkFromTrack(
  startTrackCoord: HexCoord,
  entryEdge: number,
  board: BoardState,
  owner: PlayerId,
  processedTrackIds: Set<string>
): { trackTiles: HexCoord[]; endCity: HexCoord } | null {
  const trackTiles: HexCoord[] = [];
  let currentCoord = startTrackCoord;
  let currentEntryEdge = entryEdge;

  while (true) {
    const track = board.trackTiles.find(
      t => hexCoordsEqual(t.coord, currentCoord) && t.owner === owner
    );

    if (!track) return null;

    // 이 트랙 추가
    trackTiles.push(currentCoord);
    processedTrackIds.add(hexToKey(currentCoord));

    // 나가는 방향 찾기 (들어온 방향의 반대쪽)
    const exitEdge = track.edges.find(e => e !== currentEntryEdge);
    if (exitEdge === undefined) return null;

    // 다음 이웃 확인
    const nextNeighbor = getNeighborHex(currentCoord, exitEdge);

    // 다음이 도시/마을인지 확인
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, nextNeighbor));
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, nextNeighbor));

    if (isCity || isTown) {
      // 완성된 링크!
      return { trackTiles, endCity: nextNeighbor };
    }

    // 다음 트랙으로 이동
    const nextTrack = board.trackTiles.find(
      t => hexCoordsEqual(t.coord, nextNeighbor) && t.owner === owner
    );

    if (!nextTrack) return null;

    // 다음 트랙이 연결되어 있는지 확인
    const nextEntryEdge = getOppositeEdge(exitEdge);
    if (!nextTrack.edges.includes(nextEntryEdge)) return null;

    currentCoord = nextNeighbor;
    currentEntryEdge = nextEntryEdge;
  }
}

/**
 * 링크의 중앙 위치 계산
 */
function calculateLinkCenter(trackTiles: HexCoord[]): { x: number; y: number } {
  if (trackTiles.length === 0) {
    return { x: 0, y: 0 };
  }

  // 중간 트랙 선택
  const middleIndex = Math.floor(trackTiles.length / 2);
  const middleTrack = trackTiles[middleIndex];

  return hexToPixel(middleTrack.col, middleTrack.row);
}

/**
 * 헥스가 도시 또는 마을인지 확인
 */
export function isCityOrTown(coord: HexCoord, board: BoardState): boolean {
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
  const isTown = board.towns.some(t => hexCoordsEqual(t.coord, coord));
  return isCity || isTown;
}

/**
 * 특정 헥스에서 시작하여 해당 엣지 방향으로 따라갔을 때 도시/마을에 도달하는지 확인
 */
function checkConnectionToCity(
  startHex: HexCoord,
  startEdge: number,
  board: BoardState
): boolean {
  let currentHex = startHex;
  let currentEdge = startEdge;
  const visited = new Set<string>();
  visited.add(`${startHex.col},${startHex.row}`);

  while (true) {
    // 1. 다음 헥스로 이동
    const nextHex = getNeighborHex(currentHex, currentEdge);
    const coordKey = `${nextHex.col},${nextHex.row}`;

    // 2. 도시/마을인지 확인
    if (isCityOrTown(nextHex, board)) {
      return true;
    }

    // 3. 순환 감지 (이미 방문한 곳이면 실패)
    if (visited.has(coordKey)) {
      return false;
    }
    visited.add(coordKey);

    // 4. 다음 헥스에 연결된 트랙이 있는지 확인
    const nextTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, nextHex));
    if (!nextTrack) {
      return false; // 끊긴 길
    }

    // 5. 트랙 연결성 확인
    const entryEdge = getOppositeEdge(currentEdge);
    if (!nextTrack.edges.includes(entryEdge)) {
      return false; // 연결되지 않은 트랙
    }

    // 6. 다음 나가는 엣지 찾기
    // 단순 트랙(edges 2개)만 가정.
    const exitEdge = nextTrack.edges.find(e => e !== entryEdge);
    if (exitEdge === undefined) {
      return false; // 막다른 길
    }

    // 확인 계속
    currentHex = nextHex;
    currentEdge = exitEdge;
  }
}

/**
 * 특정 트랙 타일이 완성된 링크의 일부인지 확인
 */
export function isTrackPartOfCompletedLink(
  trackCoord: HexCoord,
  board: BoardState
): boolean {
  const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, trackCoord));
  if (!track || track.edges.length !== 2) return false;

  // 트랙의 양쪽 엣지 방향으로 각각 탐색하여 도시/마을에 도달하는지 확인
  const connectsDir1 = checkConnectionToCity(trackCoord, track.edges[0], board);
  const connectsDir2 = checkConnectionToCity(trackCoord, track.edges[1], board);

  // 양쪽 모두 도시/마을과 연결되어 있다면 완성된 링크의 일부임
  return connectsDir1 && connectsDir2;
}


/**
 * 물품 이동 전체 경로의 SVG path 생성
 * 트랙을 따라 곡선으로 그림
 */
export function getMovementPathSVG(
  path: HexCoord[],
  board: BoardState,
  hexSize: number
): string {
  if (path.length < 2) return '';

  const pathParts: string[] = [];

  for (let i = 0; i < path.length; i++) {
    const coord = path[i];
    const pixel = hexToPixel(coord.col, coord.row);

    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, coord));

    if (i === 0) {
      // 시작점 (도시)
      if (isCity || isTown) {
        pathParts.push(`M ${pixel.x} ${pixel.y}`);

        // 다음 헥스로 나가는 엣지
        if (i + 1 < path.length) {
          const nextEdge = getConnectingEdge(coord, path[i + 1]);
          if (nextEdge !== null) {
            const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize);
            pathParts.push(`L ${exitPoint.x} ${exitPoint.y}`);
          }
        }
      }
    } else if (i === path.length - 1) {
      // 끝점 (도시)
      if (isCity || isTown) {
        const prevEdge = getConnectingEdge(coord, path[i - 1]);
        if (prevEdge !== null) {
          const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize);
          pathParts.push(`L ${entryPoint.x} ${entryPoint.y}`);
        }
        pathParts.push(`L ${pixel.x} ${pixel.y}`);
      }
    } else {
      // 중간 트랙
      if (track) {
        const prevEdge = getConnectingEdge(coord, path[i - 1]);
        const nextEdge = getConnectingEdge(coord, path[i + 1]);

        if (prevEdge !== null && nextEdge !== null) {
          const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize);
          const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize);

          // 엣지 간 거리로 직선/곡선 결정
          const edgeDiff = Math.abs(prevEdge - nextEdge);
          const edgeDist = Math.min(edgeDiff, 6 - edgeDiff);

          pathParts.push(`L ${entryPoint.x} ${entryPoint.y}`);

          if (edgeDist === 3) {
            // 직선 트랙
            pathParts.push(`L ${exitPoint.x} ${exitPoint.y}`);
          } else {
            // 곡선 트랙 - 베지어 곡선
            pathParts.push(`Q ${pixel.x} ${pixel.y} ${exitPoint.x} ${exitPoint.y}`);
          }
        }
      } else if (isTown) {
        // 마을 통과
        const prevEdge = getConnectingEdge(coord, path[i - 1]);
        const nextEdge = getConnectingEdge(coord, path[i + 1]);

        if (prevEdge !== null && nextEdge !== null) {
          const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize);
          const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize);

          pathParts.push(`L ${entryPoint.x} ${entryPoint.y}`);
          pathParts.push(`L ${pixel.x} ${pixel.y}`);
          pathParts.push(`L ${exitPoint.x} ${exitPoint.y}`);
        }
      }
    }
  }

  return pathParts.join(' ');
}

/**
 * 물품 이동 애니메이션을 위한 경로 포인트들 생성
 * 트랙을 따라 이동하는 포인트 배열 반환
 */
export function getAnimationPoints(
  path: HexCoord[],
  board: BoardState,
  hexSize: number,
  pointsPerSegment: number = 10
): { x: number; y: number }[] {
  if (path.length < 2) return [];

  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < path.length; i++) {
    const coord = path[i];
    const pixel = hexToPixel(coord.col, coord.row);

    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, coord));

    if (i === 0) {
      // 시작 도시 중심
      points.push(pixel);

      // 나가는 엣지까지
      if (i + 1 < path.length) {
        const nextEdge = getConnectingEdge(coord, path[i + 1]);
        if (nextEdge !== null) {
          const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize);
          // 중간 포인트 추가
          for (let j = 1; j <= pointsPerSegment; j++) {
            const t = j / pointsPerSegment;
            points.push({
              x: pixel.x + (exitPoint.x - pixel.x) * t,
              y: pixel.y + (exitPoint.y - pixel.y) * t,
            });
          }
        }
      }
    } else if (i === path.length - 1) {
      // 끝 도시
      const prevEdge = getConnectingEdge(coord, path[i - 1]);
      if (prevEdge !== null) {
        const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize);
        // 이전 헥스 경계에서 진입점으로
        for (let j = 1; j <= pointsPerSegment; j++) {
          const t = j / pointsPerSegment;
          points.push({
            x: entryPoint.x + (pixel.x - entryPoint.x) * t,
            y: entryPoint.y + (pixel.y - entryPoint.y) * t,
          });
        }
      }
    } else {
      // 중간 헥스 (트랙 또는 마을)
      const prevEdge = getConnectingEdge(coord, path[i - 1]);
      const nextEdge = getConnectingEdge(coord, path[i + 1]);

      if (prevEdge !== null && nextEdge !== null) {
        const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize);
        const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize);

        // 진입점 추가
        points.push(entryPoint);

        if (track) {
          // 트랙: 직선 또는 곡선
          const edgeDiff = Math.abs(prevEdge - nextEdge);
          const edgeDist = Math.min(edgeDiff, 6 - edgeDiff);

          if (edgeDist === 3) {
            // 직선
            for (let j = 1; j <= pointsPerSegment; j++) {
              const t = j / pointsPerSegment;
              points.push({
                x: entryPoint.x + (exitPoint.x - entryPoint.x) * t,
                y: entryPoint.y + (exitPoint.y - entryPoint.y) * t,
              });
            }
          } else {
            // 베지어 곡선
            for (let j = 1; j <= pointsPerSegment; j++) {
              const t = j / pointsPerSegment;
              const oneMinusT = 1 - t;
              points.push({
                x: oneMinusT * oneMinusT * entryPoint.x + 2 * oneMinusT * t * pixel.x + t * t * exitPoint.x,
                y: oneMinusT * oneMinusT * entryPoint.y + 2 * oneMinusT * t * pixel.y + t * t * exitPoint.y,
              });
            }
          }
        } else if (isTown) {
          // 마을: 중심 경유
          for (let j = 1; j <= pointsPerSegment / 2; j++) {
            const t = j / (pointsPerSegment / 2);
            points.push({
              x: entryPoint.x + (pixel.x - entryPoint.x) * t,
              y: entryPoint.y + (pixel.y - entryPoint.y) * t,
            });
          }
          for (let j = 1; j <= pointsPerSegment / 2; j++) {
            const t = j / (pointsPerSegment / 2);
            points.push({
              x: pixel.x + (exitPoint.x - pixel.x) * t,
              y: pixel.y + (exitPoint.y - pixel.y) * t,
            });
          }
        }
      }
    }
  }

  return points;
}
