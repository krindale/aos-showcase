// 달(The Moon) 맵 데이터
// Age of Steam Expansion — The Moon (Alban Viard / James Mathias 아트 2018). 3~4인(8턴).
//
// 공식 맵 시트(maps/moon-v2.pdf)를 고해상도 렌더 후 격자 피팅 + 색상 분류로 추출했다.
//   원본은 flat-top(평평한 윗변) 헥스 보드 — Montréal과 동일하게 게임 좌표는 전치(transpose)해
//   저장하고(인접 관계 동형이라 게임 로직 무변경), 렌더만 orientation:'flat'.
//
// ⚠️ 이 파일의 원본 기술은 **화면 좌표(screen c=가로 열, r=열 내 세로 위치)** 로 하고,
//   export 직전에 일괄 전치 변환한다 — 시트와 눈으로 대조·검증하기 위함.
//   변환식: 데이터 col = screenR - 1 (0~9) / 데이터 row = screenC + 2 (1~15).
//   화면 홀수 열이 반 칸 아래 = 데이터 홀수 row가 반 칸 아래 (홀짝 보존 — 인접 동형 검산 완료).
//
// 특수 개념 (전체 룰: rules/AosExpMoon.md):
//  - 지형 비용: 크레이터(평지) $3 / 산 $4 → fixedCost로 주입
//  - 랩 어라운드: 보드 외곽의 같은 번호(1~37) 두 변이 서로 이어진다 (wrapEdges)
//  - Moon Base: 중앙의 무색·무수요 도시 (출발/통과 전용, City.noDemand)
//  - 밤/낮: 매 턴 보드 절반이 밤 — 밤쪽 도시는 검은 도시 취급 (엔진: GameState.nightSide)
//  - 물품 성장: 디스플레이 미사용 — 주사위(인원×2)가 도시 인쇄 번호(1/2·3/4·5/6)와 일치하면
//    낮쪽 + Moon Base 연결 도시만 주머니에서 큐브 1개 (MOON_CITY_DICE)
//
// 도시 6 + Moon Base, 마을 10, 크레이터 62 + 산 28 (총 107헥스).

import {
  City,
  Town,
  HexCoord,
  HexTile,
  BoardState,
  GoodsColumnMapping,
  GoodsColumnId,
  WrapEdge,
} from '@/types/game';

// === 전치 변환 (화면 → 데이터) ===
function toData(screenC: number, screenR: number): HexCoord {
  return { col: screenR - 1, row: screenC + 2 };
}

/** 화면 flat-top 변(0=N,1=NE,2=SE,3=S,4=SW,5=NW) → 데이터 pointy-top 변(0=E,1=SE,2=SW,3=W,4=NW,5=NE) */
const SCREEN_TO_DATA_EDGE = [3, 2, 1, 0, 5, 4] as const;

// === 맵 메타 정보 (전치 저장: cols=화면세로, rows=화면가로) ===
export const MOON_MAP = {
  id: 'moon',
  name: 'The Moon',
  nameKo: '달',
  description:
    '달 표면에 선로를 놓는 3~4인 맵. 매 턴 보드 절반이 밤이 되어 그쪽 도시는 검은 도시로 변하고, 맵 가장자리로 나간 선로는 반대편 같은 번호 변으로 이어진다.',
  players: { min: 3, max: 4 },
  supportedPlayers: [4, 3], // 첫 값이 디폴트 인원 (supportedPlayers[0]) — 달은 4인 권장. 표시는 오름차순 정렬
  difficulty: 5,
  cols: 10, // 유효 col: 0 ~ 9 (전치 — 화면 세로)
  rows: 16, // 유효 row: 1 ~ 15 (전치 — 화면 가로. row 0은 보드 밖 패딩)
  startCol: 0,
  maxTurns: 8, // 4인 8턴 (Germany/Korea 4인과 동일)
};

// === 보드 헥스 (화면 r → 화면 c 목록) — 마름모꼴 107헥스 ===
const SCREEN_ROWS: Record<number, number[]> = {
  1: [5, 7],
  2: [3, 4, 5, 6, 7, 8, 9],
  3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  4: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  5: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  6: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  7: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  8: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  9: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  10: [4, 5, 6, 7, 8],
};

// === 산(mountain, $4) 헥스 (화면 좌표) — 진회색 28헥스 ===
const MOUNTAINS_SCREEN: [number, number][] = [
  [0, 6], [1, 4], [1, 5], [1, 6], [1, 7], [2, 5], [2, 7], [2, 8],
  [3, 4], [3, 5], [4, 5], [4, 8], [5, 3], [5, 4], [5, 8],
  [7, 3], [7, 8], [8, 4], [8, 6], [8, 8], [9, 6], [9, 7], [10, 7],
  [11, 4], [11, 5], [11, 6], [11, 7], [12, 6],
];

// === 도시 (화면 좌표 / 시트의 마젠타 = purple) ===
// Moon Base: 색·수요 없음(noDemand) — 출발/통과 전용. 시트 표기는 흰 헥스(렌더 특수 처리).
const CITIES_SCREEN: { id: string; name: string; c: number; r: number; color: City['color']; noDemand?: boolean }[] = [
  { id: 'moonBase',       name: 'Moon Base',            c: 6,  r: 6, color: 'black', noDemand: true },
  { id: 'imbrium',        name: 'Mare Imbrium',         c: 4,  r: 4, color: 'red' },
  { id: 'humorum',        name: 'Mare Humorum',         c: 3,  r: 7, color: 'yellow' },
  { id: 'nubium',         name: 'Mare Nubium',          c: 5,  r: 9, color: 'yellow' },
  { id: 'serenitatis',    name: 'Mare Serenitatis',     c: 8,  r: 3, color: 'purple' },
  { id: 'tranquillitatis', name: 'Mare Tranquillitatis', c: 9,  r: 4, color: 'purple' },
  { id: 'nectaris',       name: 'Mare Nectaris',        c: 8,  r: 9, color: 'blue' },
];

export const MOON_CITIES: City[] = CITIES_SCREEN.map((c) => ({
  id: c.id,
  name: c.name,
  coord: toData(c.c, c.r),
  color: c.color,
  cubes: [],
  ...(c.noDemand ? { noDemand: true } : {}),
}));

/** 물품 성장: 도시 인쇄 주사위 번호 (좌/우 반쪽에 1/2·3/4·5/6이 하나씩 — 낮쪽만 성장) */
export const MOON_CITY_DICE: Record<string, [number, number]> = {
  imbrium: [1, 2],
  humorum: [3, 4],
  nubium: [5, 6],
  nectaris: [1, 2],
  tranquillitatis: [3, 4],
  serenitatis: [5, 6],
};

// === 마을 10 (화면 좌표) ===
const TOWNS_SCREEN: { id: string; name: string; c: number; r: number }[] = [
  { id: 'FRI', name: 'Mare Frigoris',   c: 5,  r: 2 },
  { id: 'ERA', name: 'Eratos Thènes',   c: 2,  r: 4 },
  { id: 'COP', name: 'Copernicus',      c: 0,  r: 5 },
  { id: 'UND', name: 'Mare Undarum',    c: 12, r: 5 },
  { id: 'PTO', name: 'Ptolemaeus',      c: 2,  r: 6 },
  { id: 'PAL', name: 'Palms Somnii',    c: 10, r: 6 },
  { id: 'BUL', name: 'Bullialdus',      c: 0,  r: 7 },
  { id: 'THE', name: 'Theophilus',      c: 8,  r: 7 },
  { id: 'SPU', name: 'Mare Spumans',    c: 12, r: 7 },
  { id: 'FEC', name: 'Mare Fecundiatis', c: 10, r: 8 },
];

export const MOON_TOWNS: Town[] = TOWNS_SCREEN.map((t) => ({
  id: t.id,
  coord: toData(t.c, t.r),
  newCityColor: null,
  cubes: [],
}));

export const MOON_TOWN_NAMES: Record<string, string> = Object.fromEntries(
  TOWNS_SCREEN.map((t) => [t.id, t.name])
);

// === 밤/낮 반쪽 판정 ===
// 화면 좌우 절반 — 중앙 열(화면 c6 = 데이터 row 8, Moon Base 열)은 어느 쪽도 아니다.
// 도시·마을(→신규 도시)은 전부 중앙 열 밖에 있어 항상 한쪽에 속한다.
export const MOON_CENTER_DATA_ROW = 8;

/** 이 좌표가 속한 반쪽 — 'west'(화면 왼쪽) / 'east'(화면 오른쪽) / null(중앙 열) */
export function getMoonSide(coord: HexCoord): 'west' | 'east' | null {
  if (coord.row < MOON_CENTER_DATA_ROW) return 'west';
  if (coord.row > MOON_CENTER_DATA_ROW) return 'east';
  return null;
}

/** 밤/낮 위상 규칙의 단일 소스 — 밤쪽은 매 턴 정확히 한 번 반전된다 (setup 'west' 시작 +
 *  gameStore 턴 롤오버 2곳). 즉 지금이 nightSide면 n턴 뒤는 n이 홀수일 때만 반대편.
 *  AI가 "이 경로가 완성되는 턴에 목적지가 낮인가"를 예측할 때 쓴다. */
export function nightSideAfter(currentNightSide: 'west' | 'east', turnsAhead: number): 'west' | 'east' {
  const flipped = turnsAhead % 2 !== 0;
  if (!flipped) return currentNightSide;
  return currentNightSide === 'west' ? 'east' : 'west';
}

/** 그 턴에 이 좌표가 낮인가 (중앙 열은 밤낮 없음 = 항상 낮 취급 — Moon Base는 무수요라 무해) */
export function isDayAtTurn(coord: HexCoord, currentNightSide: 'west' | 'east', turnsAhead: number): boolean {
  const side = getMoonSide(coord);
  if (side === null) return true;
  return side !== nightSideAfter(currentNightSide, turnsAhead);
}

// === 랩 어라운드: 외곽 같은 번호 변 연결 (1~37, 화면 좌표+화면 변으로 기술 후 변환) ===
// 시트 실측: 두 변은 항상 보드 180° 점대칭 위치 (몽타주 74변 전수 판독, 2026-07-14).
// 화면 변 번호: 0=N, 1=NE, 2=SE, 3=S, 4=SW, 5=NW
const WRAP_SCREEN: [number, [number, number, number], [number, number, number]][] = [
  [1,  [6, 2, 0],  [6, 10, 3]],
  [2,  [5, 1, 1],  [7, 10, 4]],
  [3,  [5, 1, 0],  [7, 10, 3]],
  [4,  [5, 1, 5],  [7, 10, 2]],
  [5,  [4, 2, 0],  [8, 10, 3]],
  [6,  [4, 2, 5],  [8, 10, 2]],
  [7,  [3, 2, 0],  [9, 9, 3]],
  [8,  [3, 2, 5],  [9, 9, 2]],
  [9,  [2, 3, 0],  [10, 9, 3]],
  [10, [2, 3, 5],  [10, 9, 2]],
  [11, [1, 3, 0],  [11, 8, 3]],
  [12, [1, 3, 5],  [11, 8, 2]],
  [13, [0, 4, 0],  [12, 8, 3]],
  [14, [0, 4, 5],  [12, 8, 2]],
  [15, [-1, 4, 0], [13, 7, 3]],
  [16, [-1, 4, 5], [13, 7, 2]],
  [17, [-1, 4, 4], [13, 7, 1]],
  [18, [-1, 5, 5], [13, 6, 2]],
  [19, [-1, 5, 4], [13, 6, 1]],
  [20, [-1, 6, 5], [13, 5, 2]],
  [21, [-1, 6, 4], [13, 5, 1]],
  [22, [-1, 7, 5], [13, 4, 2]],
  [23, [-1, 7, 4], [13, 4, 1]],
  [24, [-1, 7, 3], [13, 4, 0]],
  [25, [0, 8, 4],  [12, 4, 1]],
  [26, [0, 8, 3],  [12, 4, 0]],
  [27, [1, 8, 4],  [11, 3, 1]],
  [28, [1, 8, 3],  [11, 3, 0]],
  [29, [2, 9, 4],  [10, 3, 1]],
  [30, [2, 9, 3],  [10, 3, 0]],
  [31, [3, 9, 4],  [9, 2, 1]],
  [32, [3, 9, 3],  [9, 2, 0]],
  [33, [4, 10, 4], [8, 2, 1]],
  [34, [4, 10, 3], [8, 2, 0]],
  [35, [5, 10, 4], [7, 1, 1]],
  [36, [5, 10, 3], [7, 1, 0]],
  [37, [5, 10, 2], [7, 1, 5]],
];

export const MOON_WRAP_EDGES: WrapEdge[] = WRAP_SCREEN.map(([number, [ac, ar, ae], [bc, br, be]]) => ({
  number,
  a: { coord: toData(ac, ar), edge: SCREEN_TO_DATA_EDGE[ae] },
  b: { coord: toData(bc, br), edge: SCREEN_TO_DATA_EDGE[be] },
}));

// === 물품 디스플레이 열-도시 매핑 (공식 룰: "평소처럼 디스플레이를 채운다", 검은 신도시 제외) ===
// 도시 열 6개(열당 3칸 — 표준 도시 열과 동일) + 신규 도시 A·B·C·D(열당 2칸).
// 실제 도시(원본 6개) 성장 판정은 diceNumber가 아니라 MapProfile.cityGrowthDice(도시당 두 번호
// 1/2·3/4·5/6)로 별도 처리한다. 신규 도시는 도시화 전엔 물리 도시가 아니라 인쇄 번호가 없으므로
// **표준 diceNumber 방식**(다른 맵의 신도시 열과 동일 — 배치되면 도시 취급)을 그대로 쓴다.
export const MOON_COLUMN_MAPPING: GoodsColumnMapping[] = [
  ...CITIES_SCREEN.filter((c) => c.id !== 'moonBase').map((c) => ({
    columnId: c.id as GoodsColumnId,
    cityId: c.id,
    isNewCity: false,
    rowCount: 3,
    displayLabel: MOON_CITY_DICE[c.id]?.join('/'),
  })),
  ...(['A', 'B', 'C', 'D'] as const).map((id, i) => ({
    columnId: id as GoodsColumnId,
    cityId: id,
    isNewCity: true,
    rowCount: 2,
    diceNumber: i + 1, // 1·2·3·4 — 표준 신도시 열 관례(예: Rust Belt A~H)와 동일하게 순환 배정
  })),
];

// === 건설 비용 (달 룰: 크레이터 $3 / 산 $4) ===
export const MOON_COSTS = {
  CRATER: 3,
  MOUNTAIN: 4,
};

// === 헥스 타일 생성 ===
export function generateMoonHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const boardKeys = new Set<string>();
  for (const [r, cs] of Object.entries(SCREEN_ROWS)) {
    for (const c of cs) {
      const d = toData(c, Number(r));
      boardKeys.add(`${d.col},${d.row}`);
    }
  }
  const cityKeys = new Set(MOON_CITIES.map((c) => `${c.coord.col},${c.coord.row}`));
  const mountainKeys = new Set(MOUNTAINS_SCREEN.map(([c, r]) => {
    const d = toData(c, r);
    return `${d.col},${d.row}`;
  }));

  for (let row = 0; row < MOON_MAP.rows; row++) {
    for (let col = MOON_MAP.startCol; col < MOON_MAP.cols; col++) {
      const key = `${col},${row}`;
      if (cityKeys.has(key)) continue; // 도시 헥스는 지형 없음
      if (!boardKeys.has(key)) {
        tiles.push({ coord: { col, row }, terrain: 'lake' }); // 보드 밖 — hideLakeHexes로 미표시
        continue;
      }
      if (mountainKeys.has(key)) {
        tiles.push({ coord: { col, row }, terrain: 'mountain', fixedCost: MOON_COSTS.MOUNTAIN });
      } else {
        // 크레이터 — 평지지만 $3 (표준 $2와 달라 fixedCost 주입)
        tiles.push({ coord: { col, row }, terrain: 'plain', fixedCost: MOON_COSTS.CRATER });
      }
    }
  }
  return tiles;
}

// === 초기 보드 상태 ===
export function createMoonBoardState(): BoardState {
  return {
    cities: MOON_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: MOON_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateMoonHexTiles(),
    wrapEdges: MOON_WRAP_EDGES,
  };
}

// === 색상 상수 (공식 맵 톤 — 크림 배경 + 회색 달 표면) ===
export const MOON_COLORS = {
  terrain: {
    plain: '#908E8F',      // 크레이터 (밝은 회색)
    mountain: '#666162',   // 산 (진회색)
    lake: '#F3F3E3',       // 보드 밖 (크림)
  },
  background: '#F3F3E3',
  border: '#413A29',
};
