// Western US 맵 데이터
// Age of Steam Western U.S. (John Bohrer 2012 / James Mathias 아트 2018). 6인 전용(6턴).
//
// 공식 맵 시트(maps/western-us-v1.pdf → public/maps/western-us.png, 3368×2382)를
// 색상 자동 검출 + 헥스 내부 라벨링(면적 ~33020px) + 행/열 자기상관으로 추출했다.
//   원본은 pointy-top(꼭짓점이 위/아래) 헥스 — 엔진 네이티브 배향이라 전치 없이 그대로 저장한다
//   (St.Lucia/Rust Belt/Germany의 flat-top 전치와 다름, orientation 기본 'pointy').
//   원본은 even-r 오프셋(짝수행 우측 시프트)이지만 엔진은 odd-r(홀수행 우측)이므로,
//   추출 시 engine_row = data_row + 1 로 패리티를 맞췄다(맨 위 row 0은 비어 있어 lake로만 채워짐).
//   유효 좌표: col 0~13, row 1~13.
//
// 특수 개념(룰북 Western US — 자세한 적용은 WesternUsMapProfile + gameStore 훅):
//  - 도시당 큐브 2 + 마을당 큐브 1, 시작 현금 $20(2주)
//  - 지형 비용: 늪/강 $4, 산 $5 (지형타입 기반 — MapProfile.terrainCost)
//  - 동(east)↔서(west) 배달 시 +$1 income 보너스 (City.region)
//  - 모든 트랙은 서부/동부 Starting City에서 시작, 대륙횡단 연결 전까지 연속성 강제
//  - 대륙횡단(서부 시작도시↔동부 시작도시) 최초 연결 보너스 $4/$2
//  - Kansas City 도시화 → 동부, San Diego/Portland 도시화 → 서부 (배달 판정)
//
// 도시 12, 마을 20.

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

// === 맵 메타 정보 (pointy-top 네이티브, 전치 없음) ===
export const WESTERN_US_MAP = {
  id: 'western-us',
  name: 'Western U.S.',
  nameKo: '서부 미국',
  description:
    '태평양에서 미시시피까지, 산맥과 사막을 가로지르는 대륙횡단 6인 맵. ' +
    '서부·동부 시작 도시 연결 보너스와 동서 배달 보너스가 특징.',
  players: { min: 6, max: 6 },
  supportedPlayers: [6],
  difficulty: 5,
  cols: 14, // 유효 col: 0 ~ 13
  rows: 14, // 유효 row: 1 ~ 13 (row 0은 비어 lake)
  startCol: 0,
  maxTurns: 6, // 룰북 표준 턴 트랙: 6인 = 6턴
};

// === 도시 12 (좌표 / 색 / 동서 지역) ===
// region: 'west' = 서부 시작도시(◆), 'east' = 동부 시작도시(●), 미지정 = 중앙(Denver/SLC, 시작 불가)
export const WESTERN_US_CITIES: City[] = [
  { id: 'seattle',      name: 'Seattle',       coord: { col: 0,  row: 1 },  color: 'blue',   cubes: [], region: 'west' },
  { id: 'duluth',       name: 'Duluth',        coord: { col: 13, row: 1 },  color: 'red',    cubes: [], region: 'east' },
  { id: 'minneapolis',  name: 'Minneapolis',   coord: { col: 12, row: 2 },  color: 'red',    cubes: [], region: 'east' },
  { id: 'desmoines',    name: 'Des Moines',    coord: { col: 13, row: 4 },  color: 'red',    cubes: [], region: 'east' },
  { id: 'saltlakecity', name: 'Salt Lake City', coord: { col: 3, row: 5 },  color: 'yellow', cubes: [] },
  { id: 'denver',       name: 'Denver',        coord: { col: 8,  row: 6 },  color: 'purple', cubes: [] },
  { id: 'stlouis',      name: 'St. Louis',     coord: { col: 13, row: 7 },  color: 'yellow', cubes: [], region: 'east' },
  { id: 'sanfrancisco', name: 'San Francisco', coord: { col: 0,  row: 8 },  color: 'purple', cubes: [], region: 'west' },
  { id: 'memphis',      name: 'Memphis',       coord: { col: 13, row: 9 },  color: 'blue',   cubes: [], region: 'east' },
  { id: 'losangeles',   name: 'Los Angeles',   coord: { col: 1,  row: 10 }, color: 'red',    cubes: [], region: 'west' },
  { id: 'vicksburg',    name: 'Vicksburg',     coord: { col: 13, row: 11 }, color: 'blue',   cubes: [], region: 'east' },
  { id: 'neworleans',   name: 'New Orleans',   coord: { col: 13, row: 13 }, color: 'blue',   cubes: [], region: 'east' },
];

// === 마을 20 (좌표) ===
export const WESTERN_US_TOWNS: Town[] = [
  { id: 'SPO', coord: { col: 2,  row: 1 },  newCityColor: null, cubes: [] }, // Spokane
  { id: 'FAR', coord: { col: 9,  row: 1 },  newCityColor: null, cubes: [] }, // Fargo
  { id: 'BUT', coord: { col: 4,  row: 2 },  newCityColor: null, cubes: [] }, // Butte
  { id: 'BIL', coord: { col: 6,  row: 2 },  newCityColor: null, cubes: [] }, // Billings
  { id: 'POR', coord: { col: 0,  row: 3 },  newCityColor: null, cubes: [] }, // Portland
  { id: 'CHE', coord: { col: 8,  row: 4 },  newCityColor: null, cubes: [] }, // Cheyenne
  { id: 'OMA', coord: { col: 11, row: 4 },  newCityColor: null, cubes: [] }, // Omaha
  { id: 'SAC', coord: { col: 1,  row: 6 },  newCityColor: null, cubes: [] }, // Sacramento
  { id: 'KAN', coord: { col: 12, row: 6 },  newCityColor: null, cubes: [] }, // Kansas City
  { id: 'WIC', coord: { col: 10, row: 7 },  newCityColor: null, cubes: [] }, // Wichita
  { id: 'DUR', coord: { col: 5,  row: 8 },  newCityColor: null, cubes: [] }, // Durango
  { id: 'TRI', coord: { col: 8,  row: 8 },  newCityColor: null, cubes: [] }, // Trinidad
  { id: 'SFE', coord: { col: 6,  row: 9 },  newCityColor: null, cubes: [] }, // Santa Fe
  { id: 'AMA', coord: { col: 9,  row: 9 },  newCityColor: null, cubes: [] }, // Amarillo
  { id: 'SDG', coord: { col: 2,  row: 11 }, newCityColor: null, cubes: [] }, // San Diego
  { id: 'YUM', coord: { col: 4,  row: 11 }, newCityColor: null, cubes: [] }, // Yuma
  { id: 'ELP', coord: { col: 7,  row: 11 }, newCityColor: null, cubes: [] }, // El Paso
  { id: 'FTW', coord: { col: 10, row: 11 }, newCityColor: null, cubes: [] }, // Fort Worth
  { id: 'CHI', coord: { col: 6,  row: 13 }, newCityColor: null, cubes: [] }, // Chihuahua
  { id: 'HOU', coord: { col: 10, row: 13 }, newCityColor: null, cubes: [] }, // Houston
];

export const WESTERN_US_TOWN_NAMES: Record<string, string> = {
  SPO: 'Spokane', FAR: 'Fargo', BUT: 'Butte', BIL: 'Billings', POR: 'Portland',
  CHE: 'Cheyenne', OMA: 'Omaha', SAC: 'Sacramento', KAN: 'Kansas City', WIC: 'Wichita',
  DUR: 'Durango', TRI: 'Trinidad', SFE: 'Santa Fe', AMA: 'Amarillo', SDG: 'San Diego',
  YUM: 'Yuma', ELP: 'El Paso', FTW: 'Fort Worth', CHI: 'Chihuahua', HOU: 'Houston',
};

// === 동서 분류 (배달 보너스 + 대륙횡단 판정) ===
// 시작 도시(트랙 시작 허용). Denver/SLC는 중앙이라 시작 불가.
export const WESTERN_START_CITIES = ['seattle', 'sanfrancisco', 'losangeles'];
export const EASTERN_START_CITIES = ['duluth', 'minneapolis', 'desmoines', 'stlouis', 'memphis', 'vicksburg', 'neworleans'];
// 도시화 특례: 마을이 도시화되면 이 지역의 도시로 취급(배달/대륙횡단)
export const URBANIZE_REGION: Record<string, 'east' | 'west'> = {
  KAN: 'east', // Kansas City → 동부
  SDG: 'west', // San Diego → 서부
  POR: 'west', // Portland → 서부
};

// === 물품 디스플레이 열-도시 매핑 ===
// diceNumber = 도시 헥스에 인쇄된 주사위 번호:
//   1: Duluth·Los Angeles  2: Minneapolis·San Francisco  3: Seattle·Des Moines
//   4: Salt Lake City·Memphis  5: Denver·Vicksburg  6: St. Louis·New Orleans
export const WESTERN_US_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'duluth',       cityId: 'duluth',       isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'losangeles',   cityId: 'losangeles',   isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'minneapolis',  cityId: 'minneapolis',  isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'sanfrancisco', cityId: 'sanfrancisco', isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'seattle',      cityId: 'seattle',      isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'desmoines',    cityId: 'desmoines',    isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'saltlakecity', cityId: 'saltlakecity', isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'memphis',      cityId: 'memphis',      isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'denver',       cityId: 'denver',       isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'vicksburg',    cityId: 'vicksburg',    isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'stlouis',      cityId: 'stlouis',      isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'neworleans',   cityId: 'neworleans',   isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2, diceNumber: 2 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

// 검정 도시가 없으므로 black 큐브 제외 (배달 불가 데드 큐브 방지 — Rust Belt와 동일).
// 총 100개 — 디스플레이 52 + 셋업(도시 12×2=24 + 마을 20×1=20=44) + 예비 4.
// 색 비율은 도시 색 분포(red·blue 각 4도시, yellow·purple 각 2도시)에 맞춤.
export const WESTERN_US_CUBE_COUNTS: Partial<Record<CubeColor, number>> = {
  red: 26, blue: 26, yellow: 24, purple: 24,
};

// === 지형 좌표 (추출 결과, [col, row]) ===
const MOUNTAIN: [number, number][] = [
  [1,1],[3,1],[4,1],[5,1],[0,2],[1,2],[2,2],[3,2],[5,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],
  [0,4],[1,4],[2,4],[4,4],[7,4],[0,5],[1,5],[4,5],[5,5],[6,5],[7,5],[0,6],[2,6],[4,6],[5,6],
  [6,6],[7,6],[1,7],[2,7],[4,7],[5,7],[6,7],[7,7],[2,8],[4,8],[6,8],[7,8],[0,9],[1,9],[3,9],
  [5,9],[2,10],[4,10],[5,10],[6,10],[5,11],[3,12],[5,12],[3,13],[5,13],
];

const RIVER: [number, number][] = [
  [12,3],[13,5],[13,6],[13,8],[13,10],[13,12],
];

const SWAMP: [number, number][] = [
  [12,8],[11,9],[12,9],[12,10],[11,11],[12,11],[12,12],[12,13],
];

// 비-lake(타일을 생성할) 셀 전체 — 산/강/늪을 제외한 나머지는 평지. 도시 셀은 제외(타일 없음).
// 마을 셀도 포함(평지 배경 + 마을 원). 이 집합에 없는 셀은 모두 lake(바다/맵 밖, hideLakeHexes).
const LAND: [number, number][] = [
  [1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],
  [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[13,2],
  [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],
  [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],
  [0,5],[1,5],[2,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[12,5],[13,5],
  [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6],[9,6],[10,6],[11,6],[12,6],[13,6],
  [0,7],[1,7],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],[13,8],
  [0,9],[1,9],[2,9],[3,9],[4,9],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9],
  [2,10],[3,10],[4,10],[5,10],[6,10],[7,10],[8,10],[9,10],[10,10],[11,10],[12,10],[13,10],
  [2,11],[3,11],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11],[11,11],[12,11],
  [3,12],[5,12],[6,12],[7,12],[8,12],[9,12],[10,12],[11,12],[12,12],[13,12],
  [3,13],[5,13],[6,13],[7,13],[8,13],[9,13],[10,13],[11,13],[12,13],
];

// 지형별 건설 비용 (룰북: 늪/강 $4, 산 $5, 평지 $2).
// Germany처럼 헥스 fixedCost로 주입 → 모든 비용 헬퍼(fixedCost 우선 처리)가 자동 적용.
// 평지($2)는 표준 기본값과 같아 fixedCost 미지정.
const SWAMP_RIVER_COST = 4;
const MOUNTAIN_COST = 5;

// === 헥스 타일 생성 ===
export function generateWesternUsHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const key = (c: number, r: number) => `${c},${r}`;
  const cityKeys = new Set(WESTERN_US_CITIES.map((c) => key(c.coord.col, c.coord.row)));
  const landKeys = new Set(LAND.map(([c, r]) => key(c, r)));
  const mtnKeys = new Set(MOUNTAIN.map(([c, r]) => key(c, r)));
  const rivKeys = new Set(RIVER.map(([c, r]) => key(c, r)));
  const swpKeys = new Set(SWAMP.map(([c, r]) => key(c, r)));

  for (let row = 0; row < WESTERN_US_MAP.rows; row++) {
    for (let col = WESTERN_US_MAP.startCol; col < WESTERN_US_MAP.cols; col++) {
      const k = key(col, row);
      if (cityKeys.has(k)) continue; // 도시 헥스는 지형 없음
      let terrain: TerrainType = 'lake';
      let fixedCost: number | undefined;
      if (landKeys.has(k)) {
        if (mtnKeys.has(k)) { terrain = 'mountain'; fixedCost = MOUNTAIN_COST; }
        else if (rivKeys.has(k)) { terrain = 'river'; fixedCost = SWAMP_RIVER_COST; }
        else if (swpKeys.has(k)) { terrain = 'swamp'; fixedCost = SWAMP_RIVER_COST; }
        else terrain = 'plain';
      }
      tiles.push(fixedCost !== undefined ? { coord: { col, row }, terrain, fixedCost } : { coord: { col, row }, terrain });
    }
  }
  return tiles;
}

// === 초기 보드 상태 ===
export function createWesternUsBoardState(): BoardState {
  return {
    cities: WESTERN_US_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: WESTERN_US_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateWesternUsHexTiles(),
    directLinks: [],
  };
}

// === 색상 상수 (공식 맵 톤) ===
export const WESTERN_US_COLORS = {
  terrain: {
    plain: '#78C078',      // 녹색 평원
    river: '#3F90E0',      // 강 파랑 (평지 위 강줄기)
    mountain: '#A86030',   // 산악 갈색
    swamp: '#8A5FA0',      // 늪 보라
    lake: '#0090A8',       // 바다 (hideLakeHexes로 안 그림 → 배경 노출)
  } as Record<TerrainType, string>,
  background: '#0090A8',   // 태평양/멕시코만 바다
  border: '#0A3A44',
};
