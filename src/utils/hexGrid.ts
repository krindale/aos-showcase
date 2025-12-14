// 헥스 그리드 유틸리티 함수
// GameBoardPreview.tsx에서 추출

import { HexCoord, BoardState, PlayerId } from '@/types/game';

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
 * 헥스가 건설 대상으로 유효한지 확인 (호수/도시 제외)
 */
export function isValidBuildTarget(coord: HexCoord, board: BoardState): boolean {
  // 도시인 경우 건설 불가
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
  if (isCity) return false;

  // 호수인 경우 건설 불가
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (hexTile && hexTile.terrain === 'lake') return false;

  // 이미 트랙이 있는 경우 건설 불가 (복합 트랙은 추후 지원)
  const hasTrack = board.trackTiles.some(t => hexCoordsEqual(t.coord, coord));
  if (hasTrack) return false;

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
  currentPlayer: PlayerId
): { coord: HexCoord; sourceEdge: number; targetEdge: number }[] {
  const buildableNeighbors: { coord: HexCoord; sourceEdge: number; targetEdge: number }[] = [];

  // sourceCoord가 도시인지 확인
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, sourceCoord));

  // sourceCoord에 플레이어 트랙이 있는지 확인
  const playerTrack = board.trackTiles.find(
    t => hexCoordsEqual(t.coord, sourceCoord) && t.owner === currentPlayer
  );

  // 연결 가능한 엣지 목록 결정
  let availableEdges: number[];

  if (isCity) {
    // 도시: 모든 6개 엣지에서 연결 가능
    availableEdges = [0, 1, 2, 3, 4, 5];
  } else if (playerTrack) {
    // 플레이어 트랙: 트랙의 양 끝 엣지에서만 연결 가능
    availableEdges = [...playerTrack.edges];
  } else {
    // 유효하지 않은 연결점
    return [];
  }

  // 각 가능한 엣지에서 이웃 헥스 확인
  for (const sourceEdge of availableEdges) {
    const neighbor = getNeighborHex(sourceCoord, sourceEdge);

    // 건설 가능한 대상인지 확인
    if (isValidBuildTarget(neighbor, board)) {
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
