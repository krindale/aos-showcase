// Tutorial 맵 데이터
// Age of Steam Deluxe Edition 기본 맵

import {
  City,
  Town,
  HexTile,
  CubeColor,
  BoardState,
  GoodsDisplay,
  GoodsColumnMapping,
  GoodsColumnId,
  CITY_COLORS,
  MapConfig,
} from '@/types/game';

// === 맵 메타 정보 ===
export const TUTORIAL_MAP = {
  id: 'tutorial',
  name: 'Tutorial',
  nameKo: '튜토리얼',
  description: '미국 중서부와 동부를 연결하는 철도 네트워크',
  players: { min: 2, max: 2 },
  supportedPlayers: [2],  // 튜토리얼은 2인 전용
  difficulty: 2,
  cols: 7,
  rows: 5,
  startCol: 1,
};

// MapConfig 형식의 맵 설정 (게임 초기화용)
export const TUTORIAL_MAP_CONFIG: MapConfig = {
  id: TUTORIAL_MAP.id,
  name: TUTORIAL_MAP.name,
  supportedPlayers: TUTORIAL_MAP.supportedPlayers,
  description: TUTORIAL_MAP.description,
};

// === 도시 데이터 ===
export const TUTORIAL_CITIES: City[] = [
  {
    id: 'P',
    name: 'Pittsburgh',
    coord: { col: 1, row: 0 },
    color: 'red',
    cubes: [],
  },
  {
    id: 'C',
    name: 'Cleveland',
    coord: { col: 5, row: 0 },
    color: 'blue',
    cubes: [],
  },
  {
    id: 'O',
    name: 'Columbus',
    coord: { col: 3, row: 2 },
    color: 'yellow',
    cubes: [],
  },
  {
    id: 'W',
    name: 'Wheeling',
    coord: { col: 5, row: 3 },
    color: 'black',
    cubes: [],
  },
  {
    id: 'I',
    name: 'Cincinnati',
    coord: { col: 1, row: 4 },
    color: 'purple',
    cubes: [],
  },
];

// === 마을 위치 (Tutorial에서는 마을 없음, 확장용) ===
export const TUTORIAL_TOWNS: Town[] = [];

// === 물품 디스플레이 열-도시 매핑 ===
// Tutorial 맵에서 주사위 결과(1-6)가 어느 도시에 물품을 배치하는지 정의
// A-D는 신규 도시(Urbanization)용 열
export const TUTORIAL_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: '1' as GoodsColumnId, cityId: 'P', isNewCity: false, rowCount: 6 }, // Pittsburgh
  { columnId: '2' as GoodsColumnId, cityId: 'C', isNewCity: false, rowCount: 6 }, // Cleveland
  { columnId: '3' as GoodsColumnId, cityId: 'O', isNewCity: false, rowCount: 6 }, // Columbus
  { columnId: '4' as GoodsColumnId, cityId: 'W', isNewCity: false, rowCount: 6 }, // Wheeling
  { columnId: '5' as GoodsColumnId, cityId: 'I', isNewCity: false, rowCount: 6 }, // Cincinnati
  { columnId: '6' as GoodsColumnId, cityId: 'P', isNewCity: false, rowCount: 6 }, // Pittsburgh (다시)
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 4 },  // New City A
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 4 },  // New City B
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 4 },  // New City C (중복 주의)
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 4 },  // New City D
];

// 주사위 결과에서 도시 ID 가져오기
export function getCityIdByDiceResult(diceResult: number): string | null {
  const mapping = TUTORIAL_COLUMN_MAPPING.find(
    m => m.columnId === String(diceResult) && !m.isNewCity
  );
  return mapping?.cityId || null;
}

// 열 ID에서 도시 정보 가져오기
export function getColumnCityInfo(columnId: GoodsColumnId): GoodsColumnMapping | undefined {
  return TUTORIAL_COLUMN_MAPPING.find(m => m.columnId === columnId);
}

// === 호수 타일 ===
export const TUTORIAL_LAKE_TILES: { col: number; row: number }[] = [
  { col: 6, row: 0 },
  { col: 6, row: 1 },
  { col: 6, row: 2 },
  { col: 6, row: 3 },
];

// === 헥스 타일 (지형 정보) ===
export function generateTutorialHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];

  for (let row = 0; row < TUTORIAL_MAP.rows; row++) {
    for (let col = TUTORIAL_MAP.startCol; col < TUTORIAL_MAP.cols; col++) {
      // 호수인지 확인
      const isLake = TUTORIAL_LAKE_TILES.some(
        (l) => l.col === col && l.row === row
      );

      // 도시인지 확인 (도시 헥스는 지형 없음)
      const isCity = TUTORIAL_CITIES.some(
        (c) => c.coord.col === col && c.coord.row === row
      );

      if (!isCity) {
        tiles.push({
          coord: { col, row },
          terrain: isLake ? 'lake' : 'plain',
        });
      }
    }
  }

  return tiles;
}

// === 물품 디스플레이 초기화 ===
export function initializeGoodsDisplay(): GoodsDisplay {
  // 물품 큐브 초기 수량 (2인 게임)
  // 빨강 20, 파랑 20, 보라 20, 노랑 20, 검정 16
  const cubes: CubeColor[] = [];

  for (let i = 0; i < 20; i++) cubes.push('red');
  for (let i = 0; i < 20; i++) cubes.push('blue');
  for (let i = 0; i < 20; i++) cubes.push('purple');
  for (let i = 0; i < 20; i++) cubes.push('yellow');
  for (let i = 0; i < 16; i++) cubes.push('black');

  // 셔플
  const shuffled = [...cubes].sort(() => Math.random() - 0.5);

  // 52칸 디스플레이 채우기
  const slots: (CubeColor | null)[] = shuffled.slice(0, 52);
  const bag = shuffled.slice(52);

  return { slots, bag };
}

// === 도시에 물품 배치 (게임 시작 시) ===
export function placeCubesOnCities(
  cities: City[],
  goodsDisplay: GoodsDisplay
): { cities: City[]; goodsDisplay: GoodsDisplay } {
  const updatedCities = cities.map((city) => ({
    ...city,
    cubes: [] as CubeColor[],
  }));

  // 각 도시에 2개씩 물품 배치 (주머니에서)
  const newBag = [...goodsDisplay.bag];

  for (const city of updatedCities) {
    for (let i = 0; i < 2; i++) {
      if (newBag.length > 0) {
        const cube = newBag.pop()!;
        city.cubes.push(cube);
      }
    }
  }

  return {
    cities: updatedCities,
    goodsDisplay: {
      ...goodsDisplay,
      bag: newBag,
    },
  };
}

// === 초기 보드 상태 생성 ===
export function createInitialBoardState(): BoardState {
  const goodsDisplay = initializeGoodsDisplay();
  const { cities } = placeCubesOnCities(
    TUTORIAL_CITIES.map((c) => ({ ...c, cubes: [] })),
    goodsDisplay
  );

  return {
    cities,
    towns: TUTORIAL_TOWNS,
    trackTiles: [],
    hexTiles: generateTutorialHexTiles(),
  };
}

// === 색상 상수 (UI용) ===
export const TUTORIAL_COLORS = {
  // 도시 색상 (세련된 톤)
  cities: {
    P: CITY_COLORS.red,      // Pittsburgh
    C: CITY_COLORS.blue,     // Cleveland
    O: CITY_COLORS.yellow,   // Columbus
    W: CITY_COLORS.black,    // Wheeling
    I: CITY_COLORS.purple,   // Cincinnati
  },

  // 지형 색상
  terrain: {
    plain: '#3D5A3D',
    lake: '#4A7A8A',
    river: '#5A8A9A',
    mountain: '#6A6A7A',
  },

  // 보드 배경
  background: '#252D25',
  border: '#2D3F2D',
};

// === 유효한 헥스인지 확인 ===
export function isValidHex(col: number, row: number): boolean {
  // 범위 체크
  if (col < TUTORIAL_MAP.startCol || col >= TUTORIAL_MAP.cols) return false;
  if (row < 0 || row >= TUTORIAL_MAP.rows) return false;

  // 호수 체크
  if (TUTORIAL_LAKE_TILES.some((l) => l.col === col && l.row === row)) {
    return false;
  }

  return true;
}

// === 도시 헥스인지 확인 ===
export function isCityHex(col: number, row: number): boolean {
  return TUTORIAL_CITIES.some(
    (c) => c.coord.col === col && c.coord.row === row
  );
}

// === 도시 ID로 도시 찾기 ===
export function getCityById(cityId: string): City | undefined {
  return TUTORIAL_CITIES.find((c) => c.id === cityId);
}

// === 좌표로 도시 찾기 ===
export function getCityAtCoord(col: number, row: number): City | undefined {
  return TUTORIAL_CITIES.find(
    (c) => c.coord.col === col && c.coord.row === row
  );
}
