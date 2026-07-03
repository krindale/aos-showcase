// Southern US 맵 데이터
// Age of Steam Southern U.S. — 면화(흰 큐브) 운송 맵. 6인 전용(6턴).
//
// 사용자 제공 디자인 이미지(2000×1435)를 색상 자동 검출 + 격자 피팅으로 추출했다.
//   원본은 flat-top(평평한 윗변) 헥스 보드 — Germany/Rust Belt와 동일하게 게임 좌표는
//   전치(transpose)해 저장하고(인접 관계 동형이라 게임 로직 무변경), 렌더만 orientation:'flat'
//   으로 다시 전치한다. 화면 짝수 열이 아래로 반 칸 밀린 배열이라 엔진 odd-r 패리티를 맞추기
//   위해 row = 화면열 + 1 로 저장(맨 위 row 0은 비어 lake — Western US의 row 0과 동일 기법).
//   데이터 그리드 11열(0~10, 화면 세로) × 17행(0~16, 화면 가로).
//   (이미지 최하단에 걸친 col 11 잘린 헥스 2개는 하단 여백만 키워서 제거 — 사용자 확정.)
//
// 특수 개념(룰북 Southern US — 적용은 SouthernUsMapProfile + gameStore/cityAcceptsCube 훅):
//  - 모든 마을에 면화(흰 큐브) 1개. 면화는 4대 항구(Charleston/Savannah/Mobile/New Orleans)
//    에서만 배달 종료, 배달 시 +1 보너스 수입, 배달 후 게임에서 제거(주머니 반환 없음)
//  - 면화 마을이 도시화되면 면화는 신규 도시 위로 이동
//  - Atlanta는 1~4턴 물품 성장마다 주머니에서 큐브 1개 추가 (남북전쟁 전 호황)
//  - 4턴(남북전쟁)에는 수입 감소가 2배
//  - 도시 초기 큐브: Atlanta 4, 4대 항구 3, 나머지 1
//
// 도시 12, 마을 14, 산 15, 강 11 (Tennessee/Alabama/Chattahoochee/Savannah 강).

import {
  City,
  Town,
  HexTile,
  BoardState,
  GoodsColumnMapping,
  GoodsColumnId,
  TerrainType,
} from '@/types/game';

// === 맵 메타 정보 (전치 저장: cols=화면세로, rows=화면가로) ===
export const SOUTHERN_US_MAP = {
  id: 'southern-us',
  name: 'Southern U.S.',
  nameKo: '남부 미국',
  description:
    '면화의 땅 — 모든 마을의 면화(흰 큐브)를 4대 항구로 실어 나르는 6인 맵. ' +
    '4턴 남북전쟁의 수입 감소 2배와 애팔래치아 산맥이 특징.',
  players: { min: 6, max: 6 },
  supportedPlayers: [6],
  difficulty: 4,
  cols: 11, // 유효 col: 0 ~ 10 (전치 — 화면 세로)
  rows: 17, // 유효 row: 1 ~ 16 (전치 — 화면 가로, row 0은 비어 lake)
  startCol: 0,
  maxTurns: 6, // 룰북 표준 턴 트랙: 6인 = 6턴
};

// === 4대 항구 (면화 배달 종착지, 룰북) ===
export const SOUTHERN_PORTS = ['charleston', 'savannah', 'mobile', 'neworleans'];

// === 도시 12 (전치 좌표 / 색) ===
export const SOUTHERN_US_CITIES: City[] = [
  { id: 'memphis',      name: 'Memphis',      coord: { col: 2,  row: 1 },  color: 'red',    cubes: [] },
  { id: 'jackson',      name: 'Jackson',      coord: { col: 6,  row: 1 },  color: 'blue',   cubes: [] },
  { id: 'neworleans',   name: 'New Orleans',  coord: { col: 10, row: 1 },  color: 'yellow', cubes: [] },
  { id: 'nashville',    name: 'Nashville',    coord: { col: 0,  row: 6 },  color: 'blue',   cubes: [] },
  { id: 'mobile',       name: 'Mobile',       coord: { col: 9,  row: 5 },  color: 'purple', cubes: [] },
  { id: 'montgomery',   name: 'Montgomery',   coord: { col: 6,  row: 7 },  color: 'blue',   cubes: [] },
  { id: 'knoxville',    name: 'Knoxville',    coord: { col: 0,  row: 10 }, color: 'red',    cubes: [] },
  { id: 'atlanta',      name: 'Atlanta',      coord: { col: 4,  row: 10 }, color: 'red',    cubes: [] },
  { id: 'jacksonville', name: 'Jacksonville', coord: { col: 9,  row: 14 }, color: 'red',    cubes: [] },
  { id: 'savannah',     name: 'Savannah',     coord: { col: 6,  row: 15 }, color: 'yellow', cubes: [] },
  { id: 'raleigh',      name: 'Raleigh',      coord: { col: 0,  row: 16 }, color: 'blue',   cubes: [] },
  { id: 'charleston',   name: 'Charleston',   coord: { col: 5,  row: 16 }, color: 'purple', cubes: [] },
];

// === 마을 14 (전치 좌표) ===
export const SOUTHERN_US_TOWNS: Town[] = [
  { id: 'JAC', coord: { col: 1, row: 3 },  newCityColor: null, cubes: [] }, // Jackson (TN)
  { id: 'TUP', coord: { col: 3, row: 3 },  newCityColor: null, cubes: [] }, // Tupelo
  { id: 'MER', coord: { col: 6, row: 3 },  newCityColor: null, cubes: [] }, // Meridian
  { id: 'BIL', coord: { col: 9, row: 3 },  newCityColor: null, cubes: [] }, // Biloxi
  { id: 'SEL', coord: { col: 6, row: 5 },  newCityColor: null, cubes: [] }, // Selma
  { id: 'DEC', coord: { col: 3, row: 6 },  newCityColor: null, cubes: [] }, // Decatur
  { id: 'BIR', coord: { col: 5, row: 6 },  newCityColor: null, cubes: [] }, // Birmingham
  { id: 'CHT', coord: { col: 2, row: 8 },  newCityColor: null, cubes: [] }, // Chattanooga
  { id: 'CLM', coord: { col: 6, row: 9 },  newCityColor: null, cubes: [] }, // Columbus (GA)
  { id: 'TAL', coord: { col: 9, row: 10 }, newCityColor: null, cubes: [] }, // Tallahassee
  { id: 'MAC', coord: { col: 5, row: 11 }, newCityColor: null, cubes: [] }, // Macon
  { id: 'AUG', coord: { col: 4, row: 13 }, newCityColor: null, cubes: [] }, // Augusta
  { id: 'CHR', coord: { col: 1, row: 14 }, newCityColor: null, cubes: [] }, // Charlotte
  { id: 'CLB', coord: { col: 3, row: 14 }, newCityColor: null, cubes: [] }, // Columbia
];

export const SOUTHERN_US_TOWN_NAMES: Record<string, string> = {
  JAC: 'Jackson', TUP: 'Tupelo', MER: 'Meridian', BIL: 'Biloxi', SEL: 'Selma',
  DEC: 'Decatur', BIR: 'Birmingham', CHT: 'Chattanooga', CLM: 'Columbus',
  TAL: 'Tallahassee', MAC: 'Macon', AUG: 'Augusta', CHR: 'Charlotte', CLB: 'Columbia',
};

// === 물품 디스플레이 열-도시 매핑 ===
// diceNumber = 도시 헥스에 인쇄된 주사위 번호 (이미지 원본):
//   1 Nashville·Knoxville / 2 Memphis·Raleigh / 3 Jackson·Atlanta
//   4 Charleston·New Orleans / 5 Mobile·Savannah / 6 Montgomery·Jacksonville
export const SOUTHERN_US_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'nashville',    cityId: 'nashville',    isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'knoxville',    cityId: 'knoxville',    isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'memphis',      cityId: 'memphis',      isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'raleigh',      cityId: 'raleigh',      isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'jackson',      cityId: 'jackson',      isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'atlanta',      cityId: 'atlanta',      isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'charleston',   cityId: 'charleston',   isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'neworleans',   cityId: 'neworleans',   isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'mobile',       cityId: 'mobile',       isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'savannah',     cityId: 'savannah',     isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'montgomery',   cityId: 'montgomery',   isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'jacksonville', cityId: 'jacksonville', isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2, diceNumber: 2 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

// 물품 큐브는 룰북 표준(DEFAULT_CUBE_COUNTS)을 mapRegistry에서 주입 — 면화(흰 큐브)는
// 주머니/디스플레이에 넣지 않고 셋업 시 마을 위에만 놓는다 (SouthernUsMapProfile.townFixedCube).

// === 지형 좌표 (추출 결과, [col, row] — 전치 좌표) ===
// 애팔래치아 산맥 (Knoxville~Atlanta 북동부)
const MOUNTAIN: [number, number][] = [
  [0, 8],
  [0, 9], [1, 9], [2, 9],
  [1, 10], [2, 10], [3, 10],
  [0, 11], [1, 11], [2, 11],
  [0, 12], [1, 12], [2, 12],
  [0, 13], [1, 13],
];

// 강 — Tennessee(내슈빌 서쪽), Alabama(Selma→Mobile), Chattahoochee(Columbus→멕시코만),
// Savannah(Augusta→대서양)
const RIVER: [number, number][] = [
  [0, 4], [1, 4], [2, 4], [2, 5],   // Tennessee
  [7, 5], [8, 5],                    // Alabama
  [7, 9], [8, 9], [9, 9],            // Chattahoochee
  [5, 14], [5, 15],                  // Savannah
];

// 비-lake(타일을 생성할) 셀 전체 — 도시 셀은 생성기에서 제외되므로 포함해도 무해.
// 이 집합에 없는 셀은 모두 lake(멕시코만/대서양/맵 밖, hideLakeHexes).
const LAND: [number, number][] = [
  // row: [col 시작, col 끝] 압축 표기 대신 명시 나열 (추출 결과 그대로)
  ...rangeCells(1, 0, 10),
  ...rangeCells(2, 0, 9),
  ...rangeCells(3, 0, 9),
  ...rangeCells(4, 0, 9),
  ...rangeCells(5, 0, 9),
  ...rangeCells(6, 0, 9),
  ...rangeCells(7, 0, 9),
  ...rangeCells(8, 0, 10),
  ...rangeCells(9, 0, 9),
  ...rangeCells(10, 0, 10),
  ...rangeCells(11, 0, 9),
  ...rangeCells(12, 0, 10),
  ...rangeCells(13, 0, 10),
  ...rangeCells(14, 0, 10),
  ...rangeCells(15, 0, 6),
  ...rangeCells(16, 0, 5),
];

function rangeCells(row: number, colFrom: number, colTo: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let col = colFrom; col <= colTo; col++) cells.push([col, row]);
  return cells;
}

// === 헥스 타일 생성 ===
export function generateSouthernUsHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const key = (c: number, r: number) => `${c},${r}`;
  const cityKeys = new Set(SOUTHERN_US_CITIES.map((c) => key(c.coord.col, c.coord.row)));
  const landKeys = new Set(LAND.map(([c, r]) => key(c, r)));
  const mtnKeys = new Set(MOUNTAIN.map(([c, r]) => key(c, r)));
  const rivKeys = new Set(RIVER.map(([c, r]) => key(c, r)));

  for (let row = 0; row < SOUTHERN_US_MAP.rows; row++) {
    for (let col = SOUTHERN_US_MAP.startCol; col < SOUTHERN_US_MAP.cols; col++) {
      const k = key(col, row);
      if (cityKeys.has(k)) continue; // 도시 헥스는 지형 없음
      let terrain: TerrainType = 'lake';
      if (landKeys.has(k)) {
        if (mtnKeys.has(k)) terrain = 'mountain';
        else if (rivKeys.has(k)) terrain = 'river';
        else terrain = 'plain';
      }
      tiles.push({ coord: { col, row }, terrain });
    }
  }
  return tiles;
}

// === 초기 보드 상태 ===
export function createSouthernUsBoardState(): BoardState {
  return {
    cities: SOUTHERN_US_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: SOUTHERN_US_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateSouthernUsHexTiles(),
    directLinks: [],
    // 면화(흰 큐브) 배달 종착지 — cityAcceptsCube가 이 목록으로 흰 큐브 수용을 판정
    cottonPorts: SOUTHERN_PORTS,
  };
}

// === 색상 상수 (제공 이미지 톤) ===
export const SOUTHERN_US_COLORS = {
  terrain: {
    plain: '#9FBD65',      // 남부 평원 (초록)
    river: '#4A90BE',      // 강 파랑
    mountain: '#88806A',   // 애팔래치아 회갈색
    lake: '#66969E',       // 바다 (hideLakeHexes로 안 그림 → 배경 노출)
  } as Partial<Record<TerrainType, string>>,
  background: '#66969E',   // 멕시코만/대서양
  border: '#2E4A38',
};
