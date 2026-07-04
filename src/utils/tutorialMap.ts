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
  cols: 6,
  rows: 5,
  startCol: 0,
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
    coord: { col: 0, row: 0 },
    color: 'red',
    cubes: [],
  },
  {
    id: 'C',
    name: 'Cleveland',
    coord: { col: 4, row: 0 },
    color: 'blue',
    cubes: [],
  },
  {
    id: 'O',
    name: 'Columbus',
    coord: { col: 2, row: 2 },
    color: 'yellow',
    cubes: [],
  },
  {
    id: 'I',
    name: 'Cincinnati',
    coord: { col: 0, row: 4 },
    color: 'purple',
    cubes: [],
  },
];

// === 마을 위치 ===
// Wheeling: 원래 검정 도시였으나 마을로 변경 (도시화 시 신규 도시 타일로 승격 가능).
// 마을은 물품을 생산하지 않으므로 검정 화물은 도시화 후에만 배달 가능.
export const TUTORIAL_TOWNS: Town[] = [
  { id: 'W', coord: { col: 4, row: 3 }, newCityColor: null, cubes: [] }, // Wheeling
];

// === 물품 디스플레이 열-도시 매핑 ===
// Tutorial 맵에서 주사위 결과(1-6)가 어느 도시에 물품을 배치하는지 정의
// A-D는 신규 도시(Urbanization)용 열
// 튜토리얼 물품 디스플레이: 1~6 열은 칸 3개, 신도시(A~D) 열은 칸 2개 (좁은 튜토리얼 맵에 맞춘 축소 구성)
export const TUTORIAL_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: '1' as GoodsColumnId, cityId: 'P', isNewCity: false, rowCount: 3 }, // Pittsburgh
  { columnId: '2' as GoodsColumnId, cityId: 'C', isNewCity: false, rowCount: 3 }, // Cleveland
  { columnId: '3' as GoodsColumnId, cityId: 'O', isNewCity: false, rowCount: 3 }, // Columbus
  { columnId: '4' as GoodsColumnId, cityId: '', isNewCity: false, rowCount: 3 }, // Wheeling(마을) — 물품 생산 없음, 빈 열
  { columnId: '5' as GoodsColumnId, cityId: 'I', isNewCity: false, rowCount: 3 }, // Cincinnati
  { columnId: '6' as GoodsColumnId, cityId: 'P', isNewCity: false, rowCount: 3 }, // Pittsburgh (다시)
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2 },  // New City A
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2 },  // New City B
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2 },  // New City C (중복 주의)
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2 },  // New City D
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

// === 산 타일 ===
// 우측 열(col 5)은 원래 호수(건설 불가)였으나 산($4, 건설 가능)으로 변경 (2026-07-04 사용자 요청)
export const TUTORIAL_MOUNTAIN_TILES: { col: number; row: number }[] = [
  { col: 5, row: 0 },
  { col: 5, row: 1 },
  { col: 5, row: 2 },
  { col: 5, row: 3 },
];

// === 헥스 타일 (지형 정보) ===
export function generateTutorialHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];

  for (let row = 0; row < TUTORIAL_MAP.rows; row++) {
    for (let col = TUTORIAL_MAP.startCol; col < TUTORIAL_MAP.cols; col++) {
      // 산인지 확인
      const isMountain = TUTORIAL_MOUNTAIN_TILES.some(
        (l) => l.col === col && l.row === row
      );

      // 도시인지 확인 (도시 헥스는 지형 없음)
      const isCity = TUTORIAL_CITIES.some(
        (c) => c.coord.col === col && c.coord.row === row
      );

      if (!isCity) {
        tiles.push({
          coord: { col, row },
          terrain: isMountain ? 'mountain' : 'plain',
        });
      }
    }
  }

  return tiles;
}

// === 물품 디스플레이 초기화 ===
// 맵별로 큐브 색 구성과 디스플레이 칸 수가 다를 수 있어 파라미터화한다.
// 기본값은 룰북 표준 구성(빨강/파랑/보라/노랑 20 + 검정 16)과 52칸 — Tutorial 등 표준 맵.
// Rust Belt처럼 검정 도시가 없는 맵은 검정 큐브를 빼고 호출한다 (배달 불가 데드 큐브 방지).
export const DEFAULT_CUBE_COUNTS: Partial<Record<CubeColor, number>> = {
  red: 20, blue: 20, purple: 20, yellow: 20, black: 16,
};

export function initializeGoodsDisplay(
  cubeCounts: Partial<Record<CubeColor, number>> = DEFAULT_CUBE_COUNTS,
  totalSlots: number = 52
): GoodsDisplay {
  const cubes: CubeColor[] = [];
  for (const [color, count] of Object.entries(cubeCounts)) {
    for (let i = 0; i < (count ?? 0); i++) cubes.push(color as CubeColor);
  }

  // 셔플
  const shuffled = [...cubes].sort(() => Math.random() - 0.5);

  // 디스플레이 채우기 (나머지는 주머니)
  const slots: (CubeColor | null)[] = shuffled.slice(0, totalSlots);
  const bag = shuffled.slice(totalSlots);

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
        const cube = newBag.pop();
        if (cube) city.cubes.push(cube);
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
    townSpurs: [],
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
    I: CITY_COLORS.purple,   // Cincinnati
  },

  // 지형 색상 (다른 맵과 동일한 표준 톤)
  terrain: {
    plain: '#8DB36A',     // 연두 평원 (러스트벨트 등과 동일)
    lake: '#E9E2CB',      // 호수/외곽
    river: '#5FA3D4',     // 강 파랑
    mountain: '#A9763F',  // 산악 갈색
  },

  // 보드 배경 (러스트벨트 등 다른 맵과 동일한 크림 톤)
  background: '#E9E2CB',
  border: '#6B5B3A',
};

// === 유효한 헥스인지 확인 ===
export function isValidHex(col: number, row: number): boolean {
  // 범위 체크 (산은 건설 가능 지형이라 제외하지 않는다)
  if (col < TUTORIAL_MAP.startCol || col >= TUTORIAL_MAP.cols) return false;
  if (row < 0 || row >= TUTORIAL_MAP.rows) return false;

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
