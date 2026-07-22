// 헥스 그리드 유틸리티 함수
import { debugLog } from '@/utils/debugConfig';
// GameBoardPreview.tsx에서 추출

import { HexCoord, BoardState, PlayerId, CubeColor, City, TrackTile } from '@/types/game';
import { getMoonSide } from '@/utils/moonMap';

/**
 * 달(Moon): 이 도시가 현재 밤쪽에 있는가 (board.nightSide 설정 맵만).
 * 밤쪽 도시는 고유색을 잃고 검은 도시 취급 — 검은 큐브만 배달, 타색 큐브는 통과도 불가.
 */
export function isNightCity(city: City, board: BoardState): boolean {
  return !!board.nightSide && getMoonSide(city.coord) === board.nightSide;
}

/**
 * 도시가 특정 색 큐브를 "수용"하는가 (= 배달 목적지이자 통과 불가 지점).
 * - 표준 맵: 도시는 고정색 → city.color === cubeColor.
 * - 한국(board.dynamicCityColors): 도시 수요색 = 현재 놓인 큐브색 → city.cubes 에 cubeColor 포함.
 *   빈 도시는 cubes=[] 이라 어떤 색도 수용 안 함(= 수요 없음, 통과 가능).
 * - 남부 미국(board.cottonPorts): 면화(흰 큐브)는 4대 항구에서만 배달 종료 — 그 외 도시는 통과.
 *   비-남부 맵은 cottonPorts 미설정 + 흰 큐브 자체가 없어 기존 동작 그대로.
 * - 달(Moon): Moon Base(noDemand)는 어떤 큐브도 수용 안 함(출발/통과 전용).
 *   밤쪽 도시(board.nightSide)는 검은 도시 취급 — 검은 큐브만 수용.
 * 한국엔 터미널이 없고 표준 맵은 city.color 경로를 그대로 타므로, Germany 터미널(color=수용색)
 * 배달 판정도 기존과 동일하게 유지된다. 터미널의 "통과 불가"는 cityBlocksTransit이 별도 처리.
 */
export function cityAcceptsCube(city: City, cubeColor: CubeColor, board: BoardState): boolean {
  if (city.noDemand) return false; // Moon Base — 수요 없음
  if (isNightCity(city, board)) return cubeColor === 'black'; // 밤쪽 = 검은 도시
  if (cubeColor === 'white') return !!board.cottonPorts?.includes(city.id);
  if (board.dynamicCityColors) return city.cubes.includes(cubeColor);
  // 겸용 도시(Montréal Atwater 등)는 보조 수요색(extraColor)도 받는다
  return city.color === cubeColor || city.extraColor === cubeColor;
}

/**
 * AI "계획"용 수요 판정 — 밤낮 교대(달)를 넘어 이 도시가 **언젠가** 이 큐브를 수용하는가.
 * 달은 매 턴 밤낮이 교대되므로: 원래 색 큐브는 그 도시가 낮이 되는 턴에, 검은 큐브는 어느
 * 도시든 밤이 되는 턴에 배달 가능하다. 현재 상태만 보는 cityAcceptsCube로 계획을 세우면
 * "지금 밤인 도시"로의 경로를 영구 불가로 오판한다 (건설은 몇 턴 뒤 배달을 위한 것).
 * ⚠️ 이동 "실행"·목적지 표시는 반드시 cityAcceptsCube(현재 상태)를 쓸 것 — 이건 계획 전용.
 * 비-달 맵은 cityAcceptsCube와 완전 동일.
 */
export function cityEverAcceptsCube(city: City, cubeColor: CubeColor, board: BoardState): boolean {
  if (!board.nightSide) return cityAcceptsCube(city, cubeColor, board);
  if (city.noDemand) return false;
  if (cubeColor === 'black') return true;              // 어느 도시든 밤이 되는 턴에 수용
  if (cubeColor === 'white') return !!board.cottonPorts?.includes(city.id);
  return city.color === cubeColor || city.extraColor === cubeColor; // 낮이 되는 턴 기준 원래 색
}

/**
 * 이 도시가 특정 색 큐브의 "통과"를 막는가 (배달 목적지 여부와 별개의 경로 차단).
 * - Germany 외국 터미널: 모든 큐브 통과 불가.
 * - 달(Moon) 밤쪽 도시: 검은색이 아닌 큐브는 통과조차 불가 (검은 큐브는 cityAcceptsCube로 멈춤).
 * 경로 탐색(findAllPaths/findReachableDestinations/findTrackCubeDeliveries)이 공용으로 쓴다.
 */
export function cityBlocksTransit(city: City, cubeColor: CubeColor, board: BoardState): boolean {
  if (city.isTerminal) return true;
  if (cubeColor !== 'black' && isNightCity(city, board)) return true;
  return false;
}

/**
 * 한 트랙 타일에서 특정 플레이어가 통과 가능한(소유한) 엣지 목록.
 * 복합 트랙(crossing/coexist)에서 `secondaryOwner`로 가진 가닥도 "내 트랙"으로 인정한다.
 * (예: 상대 단순 트랙 위에 내가 크로싱을 깔면 그 타일의 owner는 상대지만 secondaryEdges는 내 것)
 * 소유분이 전혀 없으면 null.
 */
export function playerEdgesAtTrack(tile: TrackTile, playerId: PlayerId): number[] | null {
  const owns = tile.owner === playerId;
  const ownsSecondary = tile.secondaryOwner === playerId && !!tile.secondaryEdges;
  if (owns && ownsSecondary) return [...tile.edges, ...tile.secondaryEdges!];
  if (owns) return [...tile.edges];
  if (ownsSecondary) return [...tile.secondaryEdges!];
  return null;
}

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
export const DEFAULT_START_COL = 0;
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
  paddingY: number = DEFAULT_PADDING_Y,
  flat: boolean = false
): { x: number; y: number } {
  const offset = row % 2 === 1 ? HEX_WIDTH / 2 : 0;
  const x = (col - startCol) * HEX_WIDTH + offset + paddingX;
  const y = row * HEX_HEIGHT * 0.75 + paddingY;
  // flat-top 맵(St. Lucia): 화면 전치 — 데이터의 col이 화면 세로, row가 화면 가로
  // (전치는 인접 관계를 보존하므로 게임 로직은 그대로, 렌더만 원본 보드 배치가 됨)
  return flat ? { x: y, y: x } : { x, y };
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
export function getHexPoints(cx: number, cy: number, size: number, flat: boolean = false): string {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const dx = size * Math.cos(angle);
    const dy = size * Math.sin(angle);
    // flat-top: 오프셋 전치 (dx↔dy) → 평평한 윗변 헥스
    points.push(flat ? `${cx + dy},${cy + dx}` : `${cx + dx},${cy + dy}`);
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
  size: number,
  flat: boolean = false
): { x: number; y: number } {
  const angle1 = (Math.PI / 3) * edge - Math.PI / 6;
  const angle2 = (Math.PI / 3) * ((edge + 1) % 6) - Math.PI / 6;
  const dx = size * (Math.cos(angle1) + Math.cos(angle2)) / 2;
  const dy = size * (Math.sin(angle1) + Math.sin(angle2)) / 2;
  return flat ? { x: cx + dy, y: cy + dx } : { x: cx + dx, y: cy + dy };
}

/**
 * 두 엣지를 연결하는 트랙 경로 생성 (SVG path)
 */
export function getTrackPath(
  cx: number,
  cy: number,
  edge1: number,
  edge2: number,
  size: number,
  flat: boolean = false
): string {
  const p1 = getEdgeMidpoint(cx, cy, edge1, size, flat);
  const p2 = getEdgeMidpoint(cx, cy, edge2, size, flat);

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
  numTies: number = 6,
  flat: boolean = false
): { x: number; y: number; angle: number }[] {
  const p1 = getEdgeMidpoint(cx, cy, edge1, size, flat);
  const p2 = getEdgeMidpoint(cx, cy, edge2, size, flat);
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
// 달(Moon) 랩 어라운드: wrapEdges 배열 → "col,row:edge" 룩업 맵 (배열 인스턴스별 캐시)
const wrapLookupCache = new WeakMap<object, Map<string, HexCoord>>();

function getWrapLookup(wrapEdges: NonNullable<BoardState['wrapEdges']>): Map<string, HexCoord> {
  let lookup = wrapLookupCache.get(wrapEdges);
  if (!lookup) {
    lookup = new Map();
    for (const w of wrapEdges) {
      lookup.set(`${w.a.coord.col},${w.a.coord.row}:${w.a.edge}`, w.b.coord);
      lookup.set(`${w.b.coord.col},${w.b.coord.row}:${w.b.edge}`, w.a.coord);
    }
    wrapLookupCache.set(wrapEdges, lookup);
  }
  return lookup;
}

export function getNeighborHex(coord: HexCoord, edge: number, board?: Pick<BoardState, 'wrapEdges'>): HexCoord {
  // 달(Moon): 외곽 랩 변이면 반대편 헥스가 이웃이다.
  // 랩 쌍은 보드 점대칭이라 "상대 변 = (edge+3)%6" 불변식이 유지된다 (moonMap.test 검증)
  // — getOppositeEdge/getConnectingEdge 관행이 랩 너머에서도 그대로 성립.
  if (board?.wrapEdges?.length) {
    const wrapped = getWrapLookup(board.wrapEdges).get(`${coord.col},${coord.row}:${edge}`);
    if (wrapped) return wrapped;
  }

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
 * 두 인접 헥스 사이가 "철도 건설 불가 경계 변"인지 (한국 산맥 등 board.blockedEdges, a/b 순서 무관).
 * 게임 엔진의 건설 가드와 동일 판정 — AI 경로탐색/건설이 이 변을 넘지 않게 하는 데 쓴다.
 */
export function isBlockedEdge(board: BoardState, a: HexCoord, b: HexCoord): boolean {
  const be = board.blockedEdges;
  if (!be || be.length === 0) return false;
  return be.some(e =>
    (hexCoordsEqual(e.a, a) && hexCoordsEqual(e.b, b)) ||
    (hexCoordsEqual(e.a, b) && hexCoordsEqual(e.b, a))
  );
}

/**
 * 두 헥스가 인접한지 확인
 */
export function areHexesAdjacent(a: HexCoord, b: HexCoord, board?: Pick<BoardState, 'wrapEdges'>): boolean {
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(a, edge, board);
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
export function getConnectingEdge(a: HexCoord, b: HexCoord, board?: Pick<BoardState, 'wrapEdges'>): number | null {
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(a, edge, board);
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
  margin: number = DEFAULT_MARGIN,
  flat: boolean = false
): { width: number; height: number } {
  const actualCols = cols - startCol + 0.5; // odd row offset
  const width = actualCols * HEX_WIDTH + margin * 2 + HEX_HORIZONTAL_RADIUS * 2;
  const height = (rows - 1) * HEX_HEIGHT * 0.75 + margin * 2 + HEX_VERTICAL_RADIUS * 2;
  // flat-top 전치 렌더: 가로/세로 교환
  return flat ? { width: height, height: width } : { width, height };
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

  // 마을인 경우 건설 불가 (마을은 도시처럼 타일 없는 연결점 — 인접 트랙이 변에 닿으면 연결)
  if (board.towns.some(t => hexCoordsEqual(t.coord, coord) && t.newCityColor === null)) return false;

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
  // 마을인 경우 건설 불가 (마을은 타일 없는 연결점)
  if (board.towns.some(t => hexCoordsEqual(t.coord, coord) && t.newCityColor === null)) {
    return false;
  }
  if (hexTile && hexTile.terrain === 'lake') {
    return false;
  }

  const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
  if (existingTrack) {
    // 내 트랙 또는 미소유 트랙의 'simple' 타일만 교체(방향 전환) 가능 — 미소유는 룰 IV
    // "소유권이 있거나 미소유 상태여야 함"에 따라 방향 전환 대상(정부 트랙 제외, 소유권은 안 넘어감)
    if (existingTrack.trackType !== 'simple') return false;
    if (existingTrack.isGovernment) return false;
    if (existingTrack.owner !== playerId && existingTrack.owner !== null) return false;

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
  targetCoord: HexCoord,
  board?: Pick<BoardState, 'wrapEdges'>
): [number, number] | null {
  // sourceCoord에서 targetCoord로 가는 엣지 찾기 (달: 랩 변 포함 — 점대칭이라 반대변 불변식 유지)
  const sourceEdge = getConnectingEdge(sourceCoord, targetCoord, board);
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
  allowReplace: boolean = false,
  /** Montréal 정부 링크 건설 모드 — 정부 트랙/가닥(owner null·isGovernment)을 "내 것"으로 취급 */
  governmentMode: boolean = false
): { coord: HexCoord; sourceEdge: number; targetEdge: number }[] {
  const buildableNeighbors: { coord: HexCoord; sourceEdge: number; targetEdge: number }[] = [];

  // sourceCoord가 도시인지 확인
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, sourceCoord));

  const isTownHere = !isCity &&
    board.towns.some(t => hexCoordsEqual(t.coord, sourceCoord) && t.newCityColor === null);

  // sourceCoord가 내 가닥(스퍼)이 있는 마을인지 확인 — 마을 원이 모든 가닥을 연결하는 허브
  const isConnectedTown = isTownHere &&
    (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, sourceCoord) &&
      (governmentMode ? sp.owner === null : sp.owner === currentPlayer));

  // sourceCoord에 트랙이 있는지 확인 (소유권 필터 없이)
  const trackAtSource = board.trackTiles.find(t => hexCoordsEqual(t.coord, sourceCoord));

  // 플레이어 소유 여부 확인 (기본 경로 또는 보조 경로 / 정부 모드: 정부 트랙)
  const isPlayerOwned = trackAtSource && (governmentMode
    ? trackAtSource.isGovernment
    : (trackAtSource.owner === currentPlayer || trackAtSource.secondaryOwner === currentPlayer));

  // 미소유 미완성 트랙 (룰 IV: 새 타일로 연장하면 그 구간 소유권 주장) — 여기서도 연장 시작 가능.
  // 정부 트랙(중립)·완성 링크 소속은 제외 (trackValidation의 연결점 인정 조건과 동일하게 유지)
  const isClaimableUnowned = !governmentMode && !!trackAtSource &&
    trackAtSource.owner === null && !trackAtSource.isGovernment &&
    !isTrackPartOfCompletedLink(sourceCoord, board);

  // 연결 가능한 엣지 목록 결정
  let availableEdges: number[];

  if (isCity || isConnectedTown) {
    // 도시/진입한 마을: 모든 6개 엣지에서 연결 가능
    availableEdges = [0, 1, 2, 3, 4, 5];
  } else if ((isPlayerOwned || isClaimableUnowned) && trackAtSource) {
    // 플레이어 트랙: 플레이어 소유 경로의 엣지에서만 연결 가능 (복합 트랙 지원)
    availableEdges = [];

    if (governmentMode) {
      availableEdges.push(...trackAtSource.edges);
    } else {
      // 기본 경로가 내 소유(또는 인수 가능한 미소유)이면 해당 엣지 추가
      if (trackAtSource.owner === currentPlayer || isClaimableUnowned) {
        availableEdges.push(...trackAtSource.edges);
      }

      // 보조 경로가 내 소유이면 해당 엣지 추가
      if (trackAtSource.secondaryOwner === currentPlayer && trackAtSource.secondaryEdges) {
        availableEdges.push(...trackAtSource.secondaryEdges);
      }
    }
  } else {
    // 유효하지 않은 연결점
    return [];
  }

  // 각 가능한 엣지에서 이웃 헥스 확인
  for (const sourceEdge of availableEdges) {
    const neighbor = getNeighborHex(sourceCoord, sourceEdge, board);

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
    } else {
      // 기존 단순 트랙이 있는 헥스 → 복합 트랙(교차/공존) 건설 가능 대상
      // 자기 트랙(완성된 링크)이든 상대 트랙이든 교차/공존 가능 (마을 헥스 제외)
      const isNeighborTownHex = board.towns.some(t => hexCoordsEqual(t.coord, neighbor) && t.newCityColor === null);
      const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor));
      if (!isNeighborTownHex && existingTrack && existingTrack.trackType === 'simple') {
        const targetEdge = getOppositeEdge(sourceEdge);
        buildableNeighbors.push({
          coord: neighbor,
          sourceEdge,
          targetEdge,
        });
      }
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

    const neighbor = getNeighborHex(targetCoord, edge, board);

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
  entryEdge?: number,  // 어느 방향에서 들어왔는지 (복합 트랙 처리용)
  /** 달(Moon) 저중력: true면 살아있는 타인 트랙도 이웃으로 인정 (경유 링크 수 제한은 호출부 DFS가 관리) */
  includeOpponents: boolean = false
): HexCoord[] {
  const neighbors: HexCoord[] = [];

  // 현재 위치가 도시/마을인지 확인 (마을도 도시처럼 모든 진입 트랙을 연결하는 허브)
  const isCurrentCity = board.cities.some(c => hexCoordsEqual(c.coord, currentCoord));
  const isCurrentTown = !isCurrentCity && board.towns.some(t => hexCoordsEqual(t.coord, currentCoord) && t.newCityColor === null);

  // 현재 위치가 트랙인지 확인 (소유자 무관)
  const currentTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, currentCoord));


  if (isCurrentCity || isCurrentTown) {
    // 도시: 6방향 모두 / 마을: 가닥(스퍼)이 있는 변으로만 연결
    const townSpurEdges = isCurrentTown
      ? new Set((board.townSpurs ?? []).filter(sp => hexCoordsEqual(sp.townCoord, currentCoord)).map(sp => sp.edge))
      : null;
    for (let edge = 0; edge < 6; edge++) {
      if (townSpurEdges && !townSpurEdges.has(edge)) continue;
      const neighbor = getNeighborHex(currentCoord, edge, board);
      const neighborKey = hexToKey(neighbor);
      if (visitedKey.has(neighborKey)) {
        continue;
      }

      // 이웃에 트랙이 있고, 해당 트랙이 현재 도시 방향으로 연결되어 있는지 확인
      let neighborTracks = board.trackTiles.filter(t => hexCoordsEqual(t.coord, neighbor));
      if (playerId !== undefined && playerId !== null && !includeOpponents) {
        // 자기 트랙 + 공용(파산, owner null) 트랙만 (살아있는 타인 제외)
        neighborTracks = neighborTracks.filter(t => t.owner === playerId || t.secondaryOwner === playerId || t.owner === null || t.secondaryOwner === null);
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
    // Germany 직결 링크: 현재 도시와 directLink(건설된 것)로 이어진 상대 도시를 이웃으로 인정
    if (isCurrentCity) {
      const cityHere = board.cities.find(c => hexCoordsEqual(c.coord, currentCoord));
      for (const dl of board.directLinks ?? []) {
        if (dl.owner === null) continue;
        if (playerId !== undefined && playerId !== null && dl.owner !== playerId) continue;
        const otherId = cityHere?.id === dl.cityA ? dl.cityB : cityHere?.id === dl.cityB ? dl.cityA : null;
        if (!otherId) continue;
        const other = board.cities.find(c => c.id === otherId);
        if (other && !visitedKey.has(hexToKey(other.coord))) neighbors.push(other.coord);
      }
    }
  } else if (currentTrack) {
    // 트랙에서: 트랙의 경로를 따라 이동
    // [핵심 수정] 복합 트랙에서는 같은 경로(edges 또는 secondaryEdges) 내에서만 이동 가능

    let currentCoordTracks = board.trackTiles.filter(t => hexCoordsEqual(t.coord, currentCoord));
    if (playerId && !includeOpponents) {
      // 자기 트랙 + 공용(파산, owner null) 트랙만 (살아있는 타인 제외)
      currentCoordTracks = currentCoordTracks.filter(t => t.owner === playerId || t.secondaryOwner === playerId || t.owner === null || t.secondaryOwner === null);
    }

    // 사용 가능한 출구 엣지와 해당 소유자 수집
    // [핵심] entryEdge가 주어지면, 해당 엣지가 속한 경로의 다른 엣지만 출구로 사용
    // 공용(파산) 트랙은 owner가 null이므로 null도 키로 담는다 (이동 시 사용 허용).
    const outgoingEdgesAndOwners = new Map<number, Set<PlayerId | null>>();

    currentCoordTracks.forEach(t => {
      // 기본 경로 (edges) 처리
      // 공용(파산, owner=null) 트랙도 이동 가능해야 하므로 owner truthy 가드를 두지 않는다.
      // (기존 `if (t.owner)`는 공용 트랙의 출구 계산을 통째로 막아, 진입은 되는데 통과가 안 되는 버그)
      {
        const isEntryInPrimary = entryEdge !== undefined && t.edges.includes(entryEdge);
        const isEntryInSecondary = entryEdge !== undefined && t.secondaryEdges?.includes(entryEdge);

        // entryEdge가 없거나, entryEdge가 primary 경로에 있으면 primary 출구 사용 가능
        if (entryEdge === undefined || isEntryInPrimary) {
          // primary 경로가 자기 소유이거나 공용(파산, owner null)이면 사용 가능 (살아있는 타인 제외)
          if (!playerId || includeOpponents || t.owner === playerId || t.owner === null) {
            t.edges.forEach(e => {
              // entryEdge와 다른 엣지만 출구로 사용 (들어온 방향으로 되돌아가지 않음)
              if (e !== entryEdge) {
                if (!outgoingEdgesAndOwners.has(e)) outgoingEdgesAndOwners.set(e, new Set());
                outgoingEdgesAndOwners.get(e)!.add(t.owner);
              }
            });
          }
        }

        // entryEdge가 없거나, entryEdge가 secondary 경로에 있으면 secondary 출구 사용 가능
        // (secondaryOwner=null인 공용 교차도 통과 가능 — 아래 소유권 체크에서 null 인정)
        if (t.secondaryEdges) {
          if (entryEdge === undefined || isEntryInSecondary) {
            // secondary 경로가 자기 소유이거나 공용(파산)이면 사용 가능
            if (!playerId || includeOpponents || t.secondaryOwner === playerId || t.secondaryOwner === null) {
              t.secondaryEdges.forEach(e => {
                if (e !== entryEdge) {
                  if (!outgoingEdgesAndOwners.has(e)) outgoingEdgesAndOwners.set(e, new Set());
                  outgoingEdgesAndOwners.get(e)!.add(t.secondaryOwner ?? null);
                }
              });
            }
          }
        }
      }
    });

    const outgoingEdges = Array.from(outgoingEdgesAndOwners.keys());

    for (const edge of outgoingEdges) {
      const neighbor = getNeighborHex(currentCoord, edge, board);
      const neighborKey = hexToKey(neighbor);
      if (visitedKey.has(neighborKey)) {
        continue;
      }

      // 이웃이 도시면 연결, 마을이면 그 변에 가닥(스퍼)이 있어야 연결
      const isNeighborCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
      if (isNeighborCity) {
        neighbors.push(neighbor);
        continue;
      }
      const isNeighborTown = board.towns.some(t => hexCoordsEqual(t.coord, neighbor) && t.newCityColor === null);
      if (isNeighborTown) {
        const spurEdge = getOppositeEdge(edge);
        if ((board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, neighbor) && sp.edge === spurEdge)) {
          neighbors.push(neighbor);
        }
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
        // 공용(파산, owner null) 트랙도 연결 인정 — currentEdgeOwners에 null이 담겨 있으면 매칭
        // 현재 헥스 출구가 공용(파산, null)이면 어떤 소유자 이웃과도 연결 가능, 이웃이 공용이어도 마찬가지.
        // (기존엔 양쪽 소유자가 정확히 같아야 해서, 공용화된 내 트랙↔내 교차 secondary 연결이 끊겼다)
        const curHasPublic = currentEdgeOwners.has(null);
        const isBasicMatch = t.edges.includes(neighborEntryEdge)
          && (t.owner == null || curHasPublic || currentEdgeOwners.has(t.owner));
        const isSecondaryMatch = !!t.secondaryEdges && t.secondaryEdges.includes(neighborEntryEdge)
          && (t.secondaryOwner == null || curHasPublic || currentEdgeOwners.has(t.secondaryOwner));

        // 2. 자기 망 또는 공용(파산) 트랙이면 사용 가능 (살아있는 타인 제외)
        const matchesRequest = !playerId || includeOpponents || t.owner === playerId || t.secondaryOwner === playerId || t.owner === null || t.secondaryOwner === null;

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
  maxLength: number,
  cubeColor: CubeColor,
  /** Montréal DGEL: 정부 링크 전용 추가 이동 수 — 총 링크 ≤ maxLength+govExtra, 비정부 링크 ≤ maxLength */
  govExtra: number = 0,
  /** 달(Moon) 저중력: 살아있는 타인 소유 링크를 최대 N개 경유 가능 (수입 이전은 completeCubeMove가 처리) */
  opponentExtra: number = 0
): HexCoord[][] {
  const allPaths: HexCoord[][] = [];

  function dfs(
    current: HexCoord,
    path: HexCoord[],
    visited: Set<string>,
    linkCount: number,
    entryEdge?: number,  // 현재 노드에 진입한 엣지 (복합 트랙 경로 분리용)
    govLinks: number = 0,        // 지금까지 지나온 정부 링크 수 (Montréal DGEL)
    linkIsGov?: boolean,         // 현재 진행 중인 링크가 정부 트랙 구간인지 (첫 타일에서 판정)
    oppLinks: number = 0,        // 지금까지 지나온 타인 소유 링크 수 (달 저중력)
    linkIsOpp?: boolean          // 현재 진행 중인 링크가 타인 소유 구간인지
  ) {
    // 목적지 도착
    if (hexCoordsEqual(current, end) && linkCount > 0) {
      allPaths.push([...path]);
      return;
    }

    // 이동은 자기 철도 + 파산 공용(owner null) 철도 (저중력이면 타인 철도도 opponentExtra 링크까지)
    const neighbors = getConnectedNeighbors(current, board, playerId, visited, entryEdge, opponentExtra > 0);

    for (const neighbor of neighbors) {
      // 링크 카운트: "완성된 철도 링크" = 도시/마을 사이의 연결 (중간 트랙 수 무관)
      // 도시/마을에 도착할 때만 링크 카운트 증가
      const neighborCity = board.cities.find(c => hexCoordsEqual(c.coord, neighbor));
      const isNeighborTown = board.towns.some(t => hexCoordsEqual(t.coord, neighbor));
      const isStop = !!neighborCity || isNeighborTown;
      const newLinkCount = isStop ? linkCount + 1 : linkCount;

      // 링크의 정부/타인 소유 여부: 링크의 첫 트랙 타일에서 판정 (한 링크의 타일은 전부 같은 소유)
      let nextLinkIsGov = linkIsGov;
      let nextLinkIsOpp = linkIsOpp;
      if (!isStop && (nextLinkIsGov === undefined || nextLinkIsOpp === undefined)) {
        const tileHere = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor));
        if (nextLinkIsGov === undefined) nextLinkIsGov = tileHere?.isGovernment === true;
        if (nextLinkIsOpp === undefined) {
          nextLinkIsOpp = !!tileHere && !tileHere.isGovernment
            && tileHere.owner !== null && tileHere.owner !== playerId && tileHere.secondaryOwner !== playerId;
        }
      }
      const newGovLinks = isStop ? govLinks + (nextLinkIsGov === true ? 1 : 0) : govLinks;
      const newOppLinks = isStop ? oppLinks + (nextLinkIsOpp === true ? 1 : 0) : oppLinks;

      // 최대 링크 수 초과 시 건너뛰기 — 총 링크는 엔진+DGEL까지, 비정부 링크는 엔진까지
      if (newLinkCount > maxLength + govExtra) {
        continue;
      }
      if (isStop && newLinkCount - newGovLinks > maxLength) {
        continue;
      }
      // 달 저중력: 타인 소유 링크는 opponentExtra개까지만 경유 가능
      if (isStop && newOppLinks > opponentExtra) {
        continue;
      }

      // 같은 색 도시는 물품이 거기서 멈추므로 통과할 수 없다.
      // 목적지(end)가 아닌데 cubeColor와 같은 색 도시를 만나면 그 경로는 차단한다
      // (가까운 같은 색 도시를 지나 더 먼 같은 색 도시로 가는 잘못된 가이드 방지).
      if (neighborCity && cityAcceptsCube(neighborCity, cubeColor, board) && !hexCoordsEqual(neighbor, end)) {
        continue;
      }
      // 통과 차단 도시(Germany 터미널 / 달 밤 도시×타색 큐브) — 목적지(end)가 아니면 그 경로 차단
      if (neighborCity && cityBlocksTransit(neighborCity, cubeColor, board) && !hexCoordsEqual(neighbor, end)) {
        continue;
      }

      // 다음 노드의 entryEdge 계산
      const edgeFromCurrent = getConnectingEdge(current, neighbor, board);
      const neighborEntryEdge = edgeFromCurrent !== null ? getOppositeEdge(edgeFromCurrent) : undefined;

      const neighborKey = hexToKey(neighbor);
      visited.add(neighborKey);
      path.push(neighbor);

      // entryEdge를 전달하여 복합 트랙 경로 유지 — 정거장 도착 시 링크 소유 판정 리셋
      dfs(neighbor, path, visited, newLinkCount, neighborEntryEdge, newGovLinks, isStop ? undefined : nextLinkIsGov,
        newOppLinks, isStop ? undefined : nextLinkIsOpp);

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
export function countPathLinks(path: HexCoord[], board: BoardState): number {
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
  cubeColor: CubeColor,
  /** Montréal DGEL: 정부 링크 전용 추가 이동 수 */
  govExtra: number = 0,
  /** 달(Moon) 저중력: 타인 링크 최대 N개 경유 */
  opponentExtra: number = 0
): HexCoord[] | null {
  // 목적지 도시 확인
  const targetCity = board.cities.find(c => hexCoordsEqual(c.coord, targetCityCoord));
  if (!targetCity) return null;

  // 물품 색상과 도시 수요색 일치 확인 (한국: city.cubes 기반 동적 색상)
  if (!cityAcceptsCube(targetCity, cubeColor, board)) return null;

  // 출발지와 목적지가 같으면 안됨
  if (hexCoordsEqual(startCityCoord, targetCityCoord)) return null;

  // 모든 경로 찾기
  const allPaths = findAllPaths(
    startCityCoord,
    targetCityCoord,
    board,
    playerId,
    engineLevel,
    cubeColor,
    govExtra,
    opponentExtra
  );

  if (allPaths.length === 0) return null;

  // 경로 선택: ① 내 소유 링크 수(=내 수입) 최대 → ② 총 링크 수 최대.
  // 총 링크만 보면 수입 없는 링크(정부 링크·파산 공용 트랙)를 거치는 긴 우회를
  // 골라 수입이 줄어든다 (Montréal에서 두드러짐 — 정부 링크는 수입 0).
  // 이동은 원래 자기+공용 트랙만 쓰므로 다른 맵에선 대부분 내 링크 = 총 링크 (동작 보존).
  let bestPath = allPaths[0];
  let bestOwn = countOwnPathLinks(bestPath, board, playerId);
  let bestTotal = countPathLinks(bestPath, board);

  for (const path of allPaths) {
    const own = countOwnPathLinks(path, board, playerId);
    const total = countPathLinks(path, board);
    if (own > bestOwn || (own === bestOwn && total > bestTotal)) {
      bestOwn = own;
      bestTotal = total;
      bestPath = path;
    }
  }

  return bestPath;
}

/** 경로에서 "내 소유" 링크 수 — 링크(정거장 사이 구간)의 첫 트랙 타일 소유자로 판정 */
export function countOwnPathLinks(path: HexCoord[], board: BoardState, playerId: PlayerId): number {
  let own = 0;
  let linkHasOwnTrack = false;
  let inLink = false;
  for (let i = 1; i < path.length; i++) {
    const coord = path[i];
    const isStop = board.cities.some(c => hexCoordsEqual(c.coord, coord)) ||
      board.towns.some(t => hexCoordsEqual(t.coord, coord));
    if (isStop) {
      if (inLink && linkHasOwnTrack) own++;
      inLink = false;
      linkHasOwnTrack = false;
      continue;
    }
    inLink = true;
    if (!linkHasOwnTrack) {
      const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
      if (tile && (tile.owner === playerId || tile.secondaryOwner === playerId)) linkHasOwnTrack = true;
    }
  }
  return own;
}

/**
 * 물품이 이동 가능한 모든 목적지 도시 찾기
 */
export function findReachableDestinations(
  startCityCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId,
  engineLevel: number,
  cubeColor: CubeColor,
  /** Montréal DGEL: 정부 링크 전용 추가 이동 수 — 총 링크 ≤ 엔진+DGEL, 비정부 링크 ≤ 엔진 */
  govExtra: number = 0,
  /** 달(Moon) 저중력: 타인 링크 최대 N개 경유 */
  opponentExtra: number = 0
): City[] {
  // 룰: 물품은 "같은 색 첫 도시"에 도착하면 멈춘다. 신규 도시도 board.cities에 있으므로 동등하게 적용.
  // DFS로 트랙을 따라가며 같은 색 도시를 처음 만나면 그 도시를 목적지로 추가하고 거기서 멈춘다
  // (그 도시를 지나 더 먼 같은 색 도시로 가는 경로는 차단 — 과거엔 신규 도시를 통과하던 버그).
  const reachable: City[] = [];
  const foundKeys = new Set<string>();

  function dfs(current: HexCoord, visited: Set<string>, linkCount: number, entryEdge?: number, govLinks = 0, linkIsGov?: boolean, oppLinks = 0, linkIsOpp?: boolean) {
    // 이동은 자기 철도 + 파산 공용(owner null) 철도 (저중력이면 타인 철도도 opponentExtra 링크까지)
    const neighbors = getConnectedNeighbors(current, board, playerId, visited, entryEdge, opponentExtra > 0);
    for (const neighbor of neighbors) {
      const nbKey = hexToKey(neighbor);
      if (visited.has(nbKey)) continue;

      const cityAt = board.cities.find(c => hexCoordsEqual(c.coord, neighbor));
      const isTown = board.towns.some(t => hexCoordsEqual(t.coord, neighbor) && t.newCityColor === null);
      const isStop = !!cityAt || isTown;
      const newLinkCount = isStop ? linkCount + 1 : linkCount;

      // 링크의 정부/타인 소유 여부는 링크 첫 트랙 타일에서 판정 (링크 단위로 소유가 분리됨)
      let nextLinkIsGov = linkIsGov;
      let nextLinkIsOpp = linkIsOpp;
      if (!isStop && (nextLinkIsGov === undefined || nextLinkIsOpp === undefined)) {
        const tileHere = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor));
        if (nextLinkIsGov === undefined) nextLinkIsGov = tileHere?.isGovernment === true;
        if (nextLinkIsOpp === undefined) {
          nextLinkIsOpp = !!tileHere && !tileHere.isGovernment
            && tileHere.owner !== null && tileHere.owner !== playerId && tileHere.secondaryOwner !== playerId;
        }
      }
      const newGovLinks = isStop ? govLinks + (nextLinkIsGov === true ? 1 : 0) : govLinks;
      const newOppLinks = isStop ? oppLinks + (nextLinkIsOpp === true ? 1 : 0) : oppLinks;

      if (newLinkCount > engineLevel + govExtra) continue;
      if (isStop && newLinkCount - newGovLinks > engineLevel) continue;
      // 달 저중력: 타인 소유 링크는 opponentExtra개까지만 경유 가능
      if (isStop && newOppLinks > opponentExtra) continue;

      if (cityAt) {
        if (cityAcceptsCube(cityAt, cubeColor, board)) {
          // 같은 색 도시 도착 → 배달 목적지. 여기서 멈춘다(더 진행하지 않음 = 첫 도시 규칙).
          // (Germany 외국 터미널도 수용색이 같으면 여기서 배달 완료)
          if (!foundKeys.has(nbKey)) { foundKeys.add(nbKey); reachable.push(cityAt); }
          continue;
        }
        // 통과 차단 도시(Germany 터미널 / 달 밤 도시×타색 큐브) — 수용색이 아니면 막다른 길
        if (cityBlocksTransit(cityAt, cubeColor, board)) continue;
        // 다른 색 도시는 통과(멈추지 않음) — 아래에서 계속 탐색
      }

      const edgeFromCurrent = getConnectingEdge(current, neighbor, board);
      const neighborEntryEdge = edgeFromCurrent !== null ? getOppositeEdge(edgeFromCurrent) : undefined;
      visited.add(nbKey);
      dfs(neighbor, visited, newLinkCount, neighborEntryEdge, newGovLinks, isStop ? undefined : nextLinkIsGov,
        newOppLinks, isStop ? undefined : nextLinkIsOpp);
      visited.delete(nbKey);
    }
  }

  dfs(startCityCoord, new Set<string>([hexToKey(startCityCoord)]), 0, undefined);
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
    // 마을이면 가닥(스퍼)이 있는 변으로만 링크 시작 (도시/도시화된 마을은 모든 변)
    const isStartTown = !board.cities.some(c => hexCoordsEqual(c.coord, startPoint))
      && board.towns.some(t => hexCoordsEqual(t.coord, startPoint) && t.newCityColor === null);

    // 이 도시/마을에 연결된 트랙 찾기
    for (let edge = 0; edge < 6; edge++) {
      if (isStartTown && !(board.townSpurs ?? []).some(
        sp => hexCoordsEqual(sp.townCoord, startPoint) && sp.edge === edge
      )) continue;
      const neighbor = getNeighborHex(startPoint, edge, board);
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
 * 달(Moon): 시드 도시(Moon Base)와 완성 링크 체인으로 이어진 도시 id 집합.
 * "선로로 연결된 도시만 성장" 판정용 — 링크 양끝(도시/마을)을 노드로 BFS (마을 경유 포함, 소유 무관).
 */
export function citiesConnectedToSeed(board: BoardState, seedCityId: string): globalThis.Set<string> {
  const seed = board.cities.find((c) => c.id === seedCityId);
  if (!seed) return new Set();
  const key = (c: HexCoord) => `${c.col},${c.row}`;
  const adj = new Map<string, string[]>();
  for (const link of findCompletedLinks(board)) {
    const a = key(link.startCity);
    const b = key(link.endCity);
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  const visited = new Set<string>([key(seed.coord)]);
  const queue = [key(seed.coord)];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  return new Set(board.cities.filter((c) => visited.has(key(c.coord))).map((c) => c.id));
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
    const nextNeighbor = getNeighborHex(currentCoord, exitEdge, board);

    // 다음이 도시/마을인지 확인
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, nextNeighbor));
    const isTown = !isCity && board.towns.some(t => hexCoordsEqual(t.coord, nextNeighbor) && t.newCityColor === null);

    if (isCity) {
      // 완성된 링크!
      return { trackTiles, endCity: nextNeighbor };
    }
    if (isTown) {
      // 마을: 진입 변에 가닥(스퍼)이 있어야 링크 완성
      const spurEdge = getOppositeEdge(exitEdge);
      if ((board.townSpurs ?? []).some(
        sp => hexCoordsEqual(sp.townCoord, nextNeighbor) && sp.edge === spurEdge
      )) {
        return { trackTiles, endCity: nextNeighbor };
      }
      return null; // 가닥 없으면 미완성 구간
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
    const nextHex = getNeighborHex(currentHex, currentEdge, board);
    const coordKey = `${nextHex.col},${nextHex.row}`;

    // 2. 도시/마을인지 확인.
    //    도시(도시화된 마을 포함=board.cities)는 모든 변이 연결된 것으로 간주.
    //    미도시화 마을은 '진입 변에 가닥(townSpur)이 있을 때만' 연결로 인정한다
    //    (가닥 없이 닿기만 한 트랙은 미완성 — 이 체크가 없으면 완성 링크로 오판됨).
    {
      const cityHere = board.cities.some(c => hexCoordsEqual(c.coord, nextHex));
      if (cityHere) return true;
      const townHere = board.towns.some(t => hexCoordsEqual(t.coord, nextHex) && t.newCityColor === null);
      if (townHere) {
        const entryEdge = getOppositeEdge(currentEdge);
        return (board.townSpurs ?? []).some(
          sp => hexCoordsEqual(sp.townCoord, nextHex) && sp.edge === entryEdge
        );
      }
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

    // 5. 트랙 연결성 확인 — 복합 트랙(교차/공존)은 진입 엣지가 속한 경로(primary edges 또는
    // secondaryEdges)로만 통과한다. (기존엔 edges만 봐서, 상대 트랙 위에 올린 내 교차의
    // secondaryEdges로 이어진 완성 링크를 '미완성'으로 오판 → 소유권 부당 제거 + 배달 불가 버그)
    const entryEdge = getOppositeEdge(currentEdge);
    let pathEdges: number[] | null = null;
    if (nextTrack.edges.includes(entryEdge)) pathEdges = nextTrack.edges;
    else if (nextTrack.secondaryEdges?.includes(entryEdge)) pathEdges = nextTrack.secondaryEdges;
    if (!pathEdges) {
      return false; // 어느 경로에도 연결되지 않은 트랙
    }

    // 6. 같은 경로 안에서 나가는 엣지 찾기
    const exitEdge = pathEdges.find(e => e !== entryEdge);
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
  hexSize: number,
  flat: boolean = false
): string {
  if (path.length < 2) return '';

  const pathParts: string[] = [];

  for (let i = 0; i < path.length; i++) {
    const coord = path[i];
    const pixel = hexToPixel(coord.col, coord.row, undefined, undefined, undefined, flat);

    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, coord));

    if (i === 0) {
      // 시작점 — 도시/마을 또는 트랙(트랙 큐브 배달) 중심에서 시작
      pathParts.push(`M ${pixel.x} ${pixel.y}`);

      // 다음 헥스로 나가는 엣지
      if (i + 1 < path.length) {
        const nextEdge = getConnectingEdge(coord, path[i + 1]);
        if (nextEdge !== null) {
          const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize, flat);
          pathParts.push(`L ${exitPoint.x} ${exitPoint.y}`);
        }
      }
    } else if (i === path.length - 1) {
      // 끝점 (도시/마을 중심으로 진입)
      {
        const prevEdge = getConnectingEdge(coord, path[i - 1]);
        if (prevEdge !== null) {
          const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize, flat);
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
          const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize, flat);
          const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize, flat);

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
          const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize, flat);
          const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize, flat);

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
  pointsPerSegment: number = 10,
  flat: boolean = false
): { x: number; y: number }[] {
  if (path.length < 2) return [];

  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < path.length; i++) {
    const coord = path[i];
    const pixel = hexToPixel(coord.col, coord.row, undefined, undefined, undefined, flat);

    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, coord));

    if (i === 0) {
      // 시작 도시 중심
      points.push(pixel);

      // 나가는 엣지까지
      if (i + 1 < path.length) {
        const nextEdge = getConnectingEdge(coord, path[i + 1]);
        if (nextEdge !== null) {
          const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize, flat);
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
        const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize, flat);
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
        const entryPoint = getEdgeMidpoint(pixel.x, pixel.y, prevEdge, hexSize, flat);
        const exitPoint = getEdgeMidpoint(pixel.x, pixel.y, nextEdge, hexSize, flat);

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

// ============================================================
// St. Lucia: 트랙 위 큐브 배달 (미완성 링크 허용)
// ============================================================

/** 트랙 큐브 배달 후보 탐색 로그 — 같은 도시로 가는 여러 루트의 채택/탈락 기록 (디버그용) */
export interface TrackCubeRouteCandidate {
  cityId: string;
  linkCount: number;
  oppLinks: number;
  accepted: boolean;
  /** first=첫 발견 채택, replace=더 나아 교체, reject-oppLinks=상대철도 많아 탈락, reject-shorter=같은 oppLinks인데 짧아 탈락, engine-exceeded=링크 수가 엔진 초과(배달 불가, 가시화용) */
  reason: 'first' | 'replace' | 'reject-oppLinks' | 'reject-shorter' | 'engine-exceeded';
  /** engine-exceeded일 때, 이 경로로 배달하려면 필요한 최소 엔진 레벨(=linkCount) */
  requiredEngine?: number;
}

/** 트랙 큐브 배달 후보: 도달 도시와 경유 트랙 구간 소유자 */
export interface TrackCubeDelivery {
  /** 배달 목적지 도시 */
  city: City;
  /** 큐브 위치에서 도시까지 경유한 트랙 좌표 순서 */
  pathCoords: HexCoord[];
  /** 이 구간(체인)의 소유자 — 보너스 수입 1을 받음 (룰북: the player who owns the track section) */
  sectionOwner: PlayerId | null;
  /** 경로에서 상대(배달자 외) 소유 트랙을 경유한 수 — 적을수록 자기 철도 위주 경로 (경로 선택 우선용) */
  oppLinks: number;
  /** 이 경로의 링크 수(=수입). 같은 도시 여러 경로 중 자기 철도만으로 가장 긴(수입 큰) 루트를 고르는 데 사용 */
  linkCount: number;
}

/**
 * 트랙 위 큐브의 배달 가능 도시 탐색 (St. Lucia)
 *
 * 룰북: 트랙 건설 시 헥스 큐브가 트랙 위로 올라가며, 그 큐브는 트랙이
 * 미완성 링크여도 도시로 배달할 수 있다. 미완성 구간도 소유자에게 수입 1.
 *
 * 큐브가 놓인 트랙에서 엣지 연결을 따라 양방향으로 체인을 추적해,
 * 체인이 닿는 도시 중 큐브 색상과 일치하는 도시를 반환한다.
 */
export function findTrackCubeDeliveries(
  board: BoardState,
  trackId: string,
  engineLevel: number = Infinity, // 이동 가능 링크 수 상한 (미지정 시 무제한)
  playerId: PlayerId | null = null, // 배달자 — 지정 시 상대 철도 경유 적은 경로 우선 (미지정 시 우선 안 함)
  onCandidate?: (c: TrackCubeRouteCandidate) => void, // 같은 도시로 가는 후보 루트마다 호출 (디버그 로그용)
): TrackCubeDelivery[] {
  const startTrack = board.trackTiles.find(t => t.id === trackId);
  if (!startTrack || !startTrack.cube) return [];

  const cubeColor = startTrack.cube;
  const deliveries: TrackCubeDelivery[] = [];

  // 워크 스택: 트랙 체인을 따라가다 마을(허브)을 만나면 마을에 닿은 다른 타일들로 분기
  // sectionOwner = 큐브가 있는 구간(첫 마을/도시 도달 전까지)의 소유자 — 마을 경유 후엔 고정
  // ★ visited는 경로별(per-path) — 전역으로 두면 한 경로가 공유 허브를 먼저 지날 때 다른(내 트랙) 경로가
  //   막혀 못 찾는다. 각 분기는 자기 경로의 visited만 보유(복사)해 대안 경로를 모두 탐색한다.
  interface TrackWalkState {
    current: HexCoord;
    exitEdge: number;
    pathCoords: HexCoord[];
    sectionOwner: PlayerId | null;
    ownerLocked: boolean;
    linkCount: number; // 큐브 시작 구간부터 통과한 도시/마을(=링크) 수 — 엔진 레벨 제한용
    visited: Set<string>; // 이 경로가 지나온 헥스 (경로 내 사이클 방지 — 분기 시 복사)
  }
  // 큐브가 놓인 트랙이 복합 교차/공존이면 주(edges)·보조(secondaryEdges) 양쪽 트랙 모두 출발점이 된다.
  // (이전엔 edges만 보고 secondaryEdges를 누락 → 큐브가 교차 트랙의 보조 트랙으로 도시에 닿는 경로를 못 찾음)
  const stack: TrackWalkState[] = [];
  for (const startEdge of startTrack.edges) {
    stack.push({
      current: startTrack.coord, exitEdge: startEdge, pathCoords: [startTrack.coord],
      sectionOwner: startTrack.owner, ownerLocked: false, linkCount: 1,
      visited: new Set<string>([hexToKey(startTrack.coord)]),
    });
  }
  for (const startEdge of (startTrack.secondaryEdges ?? [])) {
    stack.push({
      current: startTrack.coord, exitEdge: startEdge, pathCoords: [startTrack.coord],
      sectionOwner: startTrack.secondaryOwner ?? startTrack.owner, ownerLocked: false, linkCount: 1,
      visited: new Set<string>([hexToKey(startTrack.coord)]),
    });
  }

  // 엔진을 초과하는 경로는 배달엔 못 쓰지만, "엔진 N이면 가능"을 로그로 노출하면 디버깅에 유용.
  // onCandidate(로그)가 있을 때만 엔진 + 여유분만큼 더 탐색한다 (AI 내부 평가엔 영향 없음).
  const ENGINE_REPORT_MARGIN = 2;
  const exploreLimit =
    onCandidate && engineLevel !== Infinity ? engineLevel + ENGINE_REPORT_MARGIN : engineLevel;

  let guard = 0;
  while (stack.length > 0 && guard++ < 256) {
    const st = stack.pop()!;
    let current = st.current;
    let exitEdge = st.exitEdge;
    let sectionOwner = st.sectionOwner;
    const ownerLocked = st.ownerLocked;
    const linkCount = st.linkCount;
    const pathCoords = [...st.pathCoords];
    const visited = st.visited; // 이 경로의 visited (분기 시 아래에서 복사해 push)

    for (let steps = 0; steps < 64; steps++) {
      const nextCoord = getNeighborHex(current, exitEdge, board);
      const key = hexToKey(nextCoord);

      // 도시 도달
      const city = board.cities.find(c => hexCoordsEqual(c.coord, nextCoord));
      if (city) {
        // 같은 색 도시 → 배달 후보 + 종료 (룰: 같은 색 도시 도착 시 이동 멈춤).
        // 단 링크 수가 엔진 레벨 이하여야 배달 가능 (엔진 = 이동 가능 링크 수)
        if (cityAcceptsCube(city, cubeColor, board)) {
          // 경로의 상대 철도 경유 수 — 적을수록 자기 철도 위주 (배달자 지정 시에만 의미)
          const oppLinks = playerId === null ? 0 : pathCoords.filter(pc => {
            const t = board.trackTiles.find(tt => hexCoordsEqual(tt.coord, pc));
            return t && t.owner !== null && t.owner !== playerId;
          }).length;
          if (linkCount <= engineLevel) {
            const existing = deliveries.find(d => d.city.id === city.id);
            if (!existing) {
              deliveries.push({ city, pathCoords: [...pathCoords], sectionOwner, oppLinks, linkCount });
              onCandidate?.({ cityId: city.id, linkCount, oppLinks, accepted: true, reason: 'first' });
            } else if (oppLinks < existing.oppLinks || (oppLinks === existing.oppLinks && linkCount > existing.linkCount)) {
              // 상대 철도 경유가 더 적거나(자기 철도 우선), 같으면 더 긴 루트(=통과 링크 많음=수입 큼) 선택
              existing.pathCoords = [...pathCoords];
              existing.sectionOwner = sectionOwner;
              existing.oppLinks = oppLinks;
              existing.linkCount = linkCount;
              onCandidate?.({ cityId: city.id, linkCount, oppLinks, accepted: true, reason: 'replace' });
            } else {
              onCandidate?.({
                cityId: city.id, linkCount, oppLinks, accepted: false,
                reason: oppLinks > existing.oppLinks ? 'reject-oppLinks' : 'reject-shorter',
              });
            }
          } else {
            // 엔진 초과 — 배달 불가지만 "엔진 N이면 가능"을 로그로 노출 (exploreLimit까지만 도달)
            onCandidate?.({
              cityId: city.id, linkCount, oppLinks, accepted: false,
              reason: 'engine-exceeded', requiredEngine: linkCount,
            });
          }
          break;
        }
        // 통과 차단 도시(Germany 터미널 / 달 밤 도시×타색 큐브) — 수용색이 아니면 막다른 길
        if (cityBlocksTransit(city, cubeColor, board)) break;
        // 다른 색 도시 → 통과 (도시는 모든 변이 연결됨, 한 번만 방문). 너머 같은 색 도시로 계속 탐색.
        // 탐색 상한을 이미 넘었으면 더 통과해봐야 의미 없음 → 중단 (로그 모드면 엔진+여유까지)
        if (linkCount >= exploreLimit) break;
        if (visited.has(key)) break;
        visited.add(key);
        const cityPath = [...pathCoords, nextCoord];
        for (let e = 0; e < 6; e++) {
          if (e === getOppositeEdge(exitEdge)) continue; // 들어온 변 제외
          const beyond = getNeighborHex(nextCoord, e, board);
          if (visited.has(hexToKey(beyond))) continue;
          const bTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, beyond));
          const opp = getOppositeEdge(e);
          if (bTrack?.edges.includes(opp) || bTrack?.secondaryEdges?.includes(opp)) {
            stack.push({ current: nextCoord, exitEdge: e, pathCoords: cityPath, sectionOwner, ownerLocked: true, linkCount: linkCount + 1, visited: new Set(visited) });
          }
        }
        break;
      }

      // 마을 도달 → 진입 변에 가닥(스퍼)이 있어야 통과 가능. 가닥 있는 다른 변들로 분기 계속
      const isTownHere = board.towns.some(t => hexCoordsEqual(t.coord, nextCoord) && t.newCityColor === null);
      if (isTownHere) {
        const entrySpurEdge = getOppositeEdge(exitEdge);
        const spurs = (board.townSpurs ?? []).filter(sp => hexCoordsEqual(sp.townCoord, nextCoord));
        if (!spurs.some(sp => sp.edge === entrySpurEdge)) break; // 진입 변에 가닥 없음 — 연결 안 됨
        if (linkCount >= exploreLimit) break; // 탐색 상한 초과 — 더 통과 불가 (로그 모드면 엔진+여유까지)
        if (visited.has(key)) break;
        visited.add(key);
        const townPath = [...pathCoords, nextCoord];
        for (const sp of spurs) {
          if (sp.edge === entrySpurEdge) continue;
          const beyond = getNeighborHex(nextCoord, sp.edge, board);
          if (visited.has(hexToKey(beyond))) continue;
          const bTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, beyond));
          const opp = getOppositeEdge(sp.edge);
          if (bTrack?.edges.includes(opp) || bTrack?.secondaryEdges?.includes(opp)) {
            stack.push({
              current: nextCoord,
              exitEdge: sp.edge,
              pathCoords: townPath,
              sectionOwner,
              ownerLocked: true,
              linkCount: linkCount + 1,
              visited: new Set(visited),
            });
          }
        }
        break;
      }

      // 다음 트랙으로 연결 확인 (마주보는 엣지 보유 필요)
      const nextTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, nextCoord));
      const entryEdge = getOppositeEdge(exitEdge);
      if (!nextTrack) break;

      // 어느 경로(주/보조)로 들어왔는지 판단해 반대쪽 출구 결정
      let edges: [number, number] | undefined;
      if (nextTrack.edges.includes(entryEdge)) {
        edges = nextTrack.edges;
        if (!ownerLocked) sectionOwner = nextTrack.owner ?? sectionOwner;
      } else if (nextTrack.secondaryEdges?.includes(entryEdge)) {
        edges = nextTrack.secondaryEdges;
        if (!ownerLocked) sectionOwner = nextTrack.secondaryOwner ?? sectionOwner;
      }
      if (!edges) break;

      if (visited.has(key)) break;
      visited.add(key);

      pathCoords.push(nextCoord);
      current = nextCoord;
      exitEdge = edges[0] === entryEdge ? edges[1] : edges[0];
    }
  }

  return deliveries;
}
