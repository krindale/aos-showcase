// Rust Belt 맵 데이터
// Age of Steam 기본 맵 (John Bohrer, 2002 / Deluxe Edition). 미국 북동부·중서부.
// 사용자 결정으로 5인 전용(7턴)으로 제공한다.
//
// 공식 맵 시트(maps/rust-belt-v2.pdf)를 고해상도 렌더 후 색상 기반 자동 검출로 추출했다.
// 원본은 St. Lucia와 동일한 flat-top(평평한 윗변) 헥스 보드 — 게임 좌표는 전치(transpose)해
// 저장하고(인접 관계 동형이라 게임 로직 무변경), 렌더링만 orientation:'flat'으로 다시 전치한다.
//   변환: 데이터(col, row) = (측정 화면세로, 측정 화면가로) = (측정.row, 측정.col)
//   측정 그리드 18열×11행(even-q) → 데이터 그리드 11열(0~10)×18행(0~17)
//
// 도시 12개(red4/blue4/yellow2/purple2 — 검정 도시 없음), 마을 14개, 산 10, 강 14, 호수/외곽 34.

import {
  City,
  Town,
  HexTile,
  BoardState,
  CubeColor,
  GoodsColumnMapping,
  GoodsColumnId,
  TerrainType,
} from '@/types/game';

// === 맵 메타 정보 ===
export const RUST_BELT_MAP = {
  id: 'rust-belt',
  name: 'Rust Belt',
  nameKo: '러스트 벨트',
  description: '미국 북동부·중서부를 잇는 Age of Steam 기본 맵. 오대호와 산악, 두 강을 낀 5인 대결 맵.',
  players: { min: 5, max: 5 },
  supportedPlayers: [5],
  difficulty: 2,
  cols: 11, // 유효 col: 0 ~ 10 (0-base)
  rows: 18, // 유효 row: 0 ~ 17
  startCol: 0,
  maxTurns: 7, // 룰북: 5인 게임은 7턴
};

// === 도시 12개 (전치 좌표 / 색 / 물품성장 주사위 번호) ===
export const RUST_BELT_CITIES: City[] = [
  { id: 'kansascity',  name: 'Kansas City',  coord: { col: 10, row: 0 },  color: 'purple', cubes: [] },
  { id: 'minneapolis', name: 'Minneapolis',  coord: { col: 2,  row: 1 },  color: 'blue',   cubes: [] },
  { id: 'duluth',      name: 'Duluth',       coord: { col: 0,  row: 2 },  color: 'purple', cubes: [] },
  { id: 'desmoines',   name: 'Des Moines',   coord: { col: 7,  row: 2 },  color: 'blue',   cubes: [] },
  { id: 'stlouis',     name: 'St. Louis',    coord: { col: 9,  row: 5 },  color: 'red',    cubes: [] },
  { id: 'chicago',     name: 'Chicago',      coord: { col: 5,  row: 7 },  color: 'red',    cubes: [] },
  { id: 'evansville',  name: 'Evansville',   coord: { col: 9,  row: 9 },  color: 'blue',   cubes: [] },
  { id: 'cincinnati',  name: 'Cincinnati',   coord: { col: 8,  row: 12 }, color: 'blue',   cubes: [] },
  { id: 'detroit',     name: 'Detroit',      coord: { col: 3,  row: 13 }, color: 'red',    cubes: [] },
  { id: 'wheeling',    name: 'Wheeling',     coord: { col: 8,  row: 16 }, color: 'yellow', cubes: [] },
  { id: 'toronto',     name: 'Toronto',      coord: { col: 1,  row: 16 }, color: 'yellow', cubes: [] },
  { id: 'pittsburgh',  name: 'Pittsburgh',   coord: { col: 5,  row: 17 }, color: 'red',    cubes: [] },
];

// === 마을 14개 (전치 좌표) ===
export const RUST_BELT_TOWNS: Town[] = [
  { id: 'GB', coord: { col: 1, row: 7 },  newCityColor: null, cubes: [] }, // Green Bay
  { id: 'LC', coord: { col: 3, row: 4 },  newCityColor: null, cubes: [] }, // La Crosse
  { id: 'MW', coord: { col: 3, row: 7 },  newCityColor: null, cubes: [] }, // Milwaukee
  { id: 'GR', coord: { col: 3, row: 10 }, newCityColor: null, cubes: [] }, // Grand Rapids
  { id: 'CL', coord: { col: 4, row: 15 }, newCityColor: null, cubes: [] }, // Cleveland
  { id: 'MC', coord: { col: 5, row: 9 },  newCityColor: null, cubes: [] }, // Michigan City
  { id: 'TL', coord: { col: 5, row: 12 }, newCityColor: null, cubes: [] }, // Toledo
  { id: 'RI', coord: { col: 6, row: 5 },  newCityColor: null, cubes: [] }, // Rock Island
  { id: 'FW', coord: { col: 6, row: 11 }, newCityColor: null, cubes: [] }, // Fort Wayne
  { id: 'SP', coord: { col: 8, row: 6 },  newCityColor: null, cubes: [] }, // Springfield
  { id: 'TH', coord: { col: 8, row: 8 },  newCityColor: null, cubes: [] }, // Terre Haute
  { id: 'IN', coord: { col: 8, row: 10 }, newCityColor: null, cubes: [] }, // Indianapolis
  { id: 'LX', coord: { col: 9, row: 13 }, newCityColor: null, cubes: [] }, // Lexington
  { id: 'BF', coord: { col: 2, row: 17 }, newCityColor: null, cubes: [] }, // Buffalo
];

/** 마을 이름 (UI 표시용) */
export const RUST_BELT_TOWN_NAMES: Record<string, string> = {
  GB: 'Green Bay', LC: 'La Crosse', MW: 'Milwaukee', GR: 'Grand Rapids',
  CL: 'Cleveland', MC: 'Michigan City', TL: 'Toledo', RI: 'Rock Island',
  FW: 'Fort Wayne', SP: 'Springfield', TH: 'Terre Haute', IN: 'Indianapolis',
  LX: 'Lexington', BF: 'Buffalo',
};

// === 물품 디스플레이 열-도시 매핑 ===
// 12개 도시가 6개 주사위 번호를 2개씩 공유 (열당 3칸 = 36) + 신규 도시 A~H (열당 2칸 = 16) = 52칸.
export const RUST_BELT_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'chicago',     cityId: 'chicago',     isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'evansville',  cityId: 'evansville',  isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'stlouis',     cityId: 'stlouis',     isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'cincinnati',  cityId: 'cincinnati',  isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'kansascity',  cityId: 'kansascity',  isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'detroit',     cityId: 'detroit',     isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'desmoines',   cityId: 'desmoines',   isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'wheeling',    cityId: 'wheeling',    isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'minneapolis', cityId: 'minneapolis', isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'pittsburgh',  cityId: 'pittsburgh',  isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'duluth',      cityId: 'duluth',      isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'toronto',     cityId: 'toronto',     isNewCity: false, rowCount: 3, diceNumber: 6 },
  // 신규 도시 열에도 주사위 번호를 부여해, 배치된 신규 도시가 물품 성장을 받게 한다.
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2, diceNumber: 2 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

// 물품 큐브는 룰북 표준(DEFAULT_CUBE_COUNTS: red/blue/yellow/purple 20 + black 16)을 mapRegistry에서
// 주입한다. 검정 화물은 검정 신규 도시(도시화로 NEW_CITY_TILES 검정 4개 생성)로 배달된다.

// === 호수/외곽 타일 (전치 좌표) — orientation:flat + hideLakeHexes로 빈 공간 처리 ===
const LAKE_TILES: { col: number; row: number }[] = [
  { col: 0, row: 3 }, { col: 0, row: 4 }, { col: 0, row: 8 }, { col: 0, row: 9 },
  { col: 0, row: 10 }, { col: 0, row: 11 }, { col: 0, row: 13 }, { col: 0, row: 14 },
  { col: 1, row: 8 }, { col: 1, row: 9 }, { col: 1, row: 12 }, { col: 1, row: 13 },
  { col: 1, row: 17 }, { col: 2, row: 8 }, { col: 2, row: 9 }, { col: 2, row: 12 },
  { col: 2, row: 13 }, { col: 3, row: 8 }, { col: 3, row: 9 }, { col: 3, row: 15 },
  { col: 3, row: 16 }, { col: 4, row: 8 }, { col: 4, row: 9 }, { col: 4, row: 13 },
  { col: 4, row: 14 }, { col: 5, row: 8 }, { col: 10, row: 1 }, { col: 10, row: 3 },
  { col: 10, row: 5 }, { col: 10, row: 7 }, { col: 10, row: 9 }, { col: 10, row: 11 },
  { col: 10, row: 13 }, { col: 10, row: 17 },
  { col: 0, row: 12 }, // 외곽(베이지) — 자동 분류 경계 보정
];

// === 산악 지대 10헥스 (전치 좌표) — Pittsburgh/Wheeling 동쪽 ===
const MOUNTAIN_TILES: { col: number; row: number }[] = [
  { col: 4, row: 17 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 8, row: 17 },
  { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }, { col: 10, row: 14 },
  { col: 10, row: 15 }, { col: 10, row: 16 },
];

// === 강 19헥스 (전치 좌표) — 원본 파란 곡선을 따라 연속 추출 ===
// edges = 강이 지나는 두 면 [면1, 면2] (0=E,1=SE,2=SW,3=W,4=NW,5=NE). 지정 시 그 두 면으로 그림(도시로 끝맺음 등).
const RIVER_TILES: { col: number; row: number; edges?: [number, number] }[] = [
  // Mississippi: Minneapolis 남하 → St. Louis
  { col: 3, row: 2 }, { col: 3, row: 3 }, { col: 4, row: 4 }, { col: 5, row: 4 },
  { col: 6, row: 4 }, { col: 7, row: 4 }, { col: 8, row: 4 }, { col: 8, row: 5 },
  { col: 9, row: 6 }, { col: 10, row: 6 },
  // Niagara: Toronto–Buffalo
  { col: 2, row: 16, edges: [2, 0] }, // 2시(면2) 시작 → 6시(면0) 끝
  // Ohio: Pittsburgh → Cincinnati → 남서
  { col: 7, row: 15 }, { col: 7, row: 16 },
  { col: 6, row: 16, edges: [0, 2] }, // E→(7,16) 강 / SW→Pittsburgh(5,17) — 강이 Pittsburgh로 끝남
  { col: 8, row: 13 }, { col: 8, row: 14 }, { col: 9, row: 11 }, { col: 9, row: 12 },
  { col: 10, row: 10 },
];

// === 헥스 타일 (지형 정보) 생성 ===
export function generateRustBeltHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const cityKeys = new Set(RUST_BELT_CITIES.map((c) => `${c.coord.col},${c.coord.row}`));
  const lakeKeys = new Set(LAKE_TILES.map((t) => `${t.col},${t.row}`));
  const mtnKeys = new Set(MOUNTAIN_TILES.map((t) => `${t.col},${t.row}`));
  const rivKeys = new Set(RIVER_TILES.map((t) => `${t.col},${t.row}`));
  const rivEdges = new Map<string, [number, number]>(RIVER_TILES.filter((t) => t.edges).map((t) => [`${t.col},${t.row}`, t.edges!] as const));

  for (let row = 0; row < RUST_BELT_MAP.rows; row++) {
    for (let col = RUST_BELT_MAP.startCol; col < RUST_BELT_MAP.cols; col++) {
      const key = `${col},${row}`;
      if (cityKeys.has(key)) continue; // 도시 헥스는 지형 없음

      let terrain: TerrainType = 'plain';
      if (lakeKeys.has(key)) terrain = 'lake';
      else if (mtnKeys.has(key)) terrain = 'mountain';
      else if (rivKeys.has(key)) terrain = 'river';

      const tile: HexTile = { coord: { col, row }, terrain };
      if (terrain === 'river' && rivEdges.has(key)) tile.riverEdges = rivEdges.get(key);
      tiles.push(tile);
    }
  }

  return tiles;
}

// === 초기 보드 상태 생성 (도시 큐브는 createInitialGameState에서 배치) ===
export function createRustBeltBoardState(): BoardState {
  return {
    cities: RUST_BELT_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: RUST_BELT_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateRustBeltHexTiles(),
  };
}

// === 색상 상수 (공식 맵 톤 기반) ===
export const RUST_BELT_COLORS = {
  terrain: {
    plain: '#8DB36A',     // 연두 평원
    lake: '#E9E2CB',      // 호수/외곽 (빈 공간 톤)
    river: '#5FA3D4',     // 강 파랑
    mountain: '#A9763F',  // 산악 갈색
  },
  background: '#E9E2CB',
  border: '#6B5B3A',
};
