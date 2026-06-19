// St. Lucia 맵 데이터
// Age of Steam: St. Lucia (Ted Alspach, Bezier Games) - 2인 전용, 8턴
//
// 공식 맵 시트(maps/aos-st_lucia.pdf)를 픽셀 단위로 측정해 추출한 데이터입니다.
// 원본은 flat-top(평평한 윗변) 헥스 보드 — 게임 좌표는 전치(transpose)해 저장하고
// (인접 관계 동형이라 게임 로직 무변경), 렌더링은 orientation: 'flat'으로 다시
// 전치해 원본과 동일한 배치/비율로 그립니다.
//   변환: 데이터 (col, row) = (원본 r + 1, 원본 q)
//
// 측정 결과: 육지 59헥스, 마을 11, 산 10, 강 9 (도시 없음 — 도시화로만 생성)

import {
  City,
  Town,
  HexTile,
  BoardState,
  GoodsColumnMapping,
  GoodsColumnId,
  TerrainType,
} from '@/types/game';

// === 맵 메타 정보 ===
export const ST_LUCIA_MAP = {
  id: 'st-lucia',
  name: 'St. Lucia',
  nameKo: '세인트루시아',
  description: '카리브해의 섬 세인트루시아. 마을을 도시화하며 경쟁하는 2인 전용 8턴 맵',
  players: { min: 2, max: 2 },
  supportedPlayers: [2],
  difficulty: 3,
  cols: 11, // 유효 col: 0 ~ 10 (0-base)
  rows: 7,  // 유효 row: 0 ~ 6
  startCol: 0,
  maxTurns: 8,
};

// === 도시: 없음 (공식 맵 — 도시는 Urbanization으로만 생성) ===
export const ST_LUCIA_CITIES: City[] = [];

// === 마을 11개 (공식 맵 픽셀 측정 좌표) ===
export const ST_LUCIA_TOWNS: Town[] = [
  { id: 'LC', coord: { col: 0, row: 4 }, newCityColor: null, cubes: [] },   // Le Cap (북단)
  { id: 'CS', coord: { col: 2, row: 2 }, newCityColor: null, cubes: [] },   // Castries
  { id: 'GA', coord: { col: 2, row: 5 }, newCityColor: null, cubes: [] },   // Grand Anse
  { id: 'BI', coord: { col: 4, row: 3 }, newCityColor: null, cubes: [] },   // Barre de l'Isle
  { id: 'AR', coord: { col: 5, row: 0 }, newCityColor: null, cubes: [] },   // Anse Le Raye
  { id: 'DN', coord: { col: 5, row: 6 }, newCityColor: null, cubes: [] },   // Dennery
  { id: 'MG', coord: { col: 6, row: 3 }, newCityColor: null, cubes: [] },   // Morne Gimie
  { id: 'AC', coord: { col: 7, row: 0 }, newCityColor: null, cubes: [] },   // Anse Chastenet
  { id: 'FJ', coord: { col: 8, row: 2 }, newCityColor: null, cubes: [] },   // Fond St Jacques
  { id: 'MC', coord: { col: 8, row: 6 }, newCityColor: null, cubes: [] },   // Micoud
  { id: 'LB', coord: { col: 9, row: 3 }, newCityColor: null, cubes: [] },  // Laborie (남단)
];

/** 마을 이름 (UI 표시용) */
export const ST_LUCIA_TOWN_NAMES: Record<string, string> = {
  LC: 'Le Cap',
  CS: 'Castries',
  GA: 'Grand Anse',
  BI: "Barre de l'Isle",
  AR: 'Anse Le Raye',
  DN: 'Dennery',
  MG: 'Morne Gimie',
  AC: 'Anse Chastenet',
  FJ: 'Fond St Jacques',
  MC: 'Micoud',
  LB: 'Laborie',
};

// === 섬 윤곽: row(원본 열 q)별 육지 col 범위 (픽셀 측정) ===
const LAND_RANGES: Record<number, [number, number]> = {
  0: [5, 8],
  1: [4, 9],
  2: [2, 10],
  3: [0, 9],
  4: [0, 10],
  5: [0, 9],
  6: [1, 9],
};

// 산악 지대 10헥스 (공식 맵 진녹색 — 중앙 능선)
const MOUNTAIN_TILES: { col: number; row: number }[] = [
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 4, row: 4 },
  { col: 5, row: 3 },
  { col: 5, row: 4 },
  { col: 6, row: 2 },
  { col: 6, row: 4 },
  { col: 7, row: 2 },
  { col: 7, row: 3 },
  { col: 7, row: 4 },
];

// 강 9헥스 (공식 맵 4개 하천의 경유 헥스 — 픽셀 클러스터 측정)
const RIVER_TILES: { col: number; row: number }[] = [
  { col: 3, row: 2 },  // 북서 하천 (Castries 남측)
  { col: 3, row: 3 },
  { col: 4, row: 5 },  // 동부 하천 (Grand Anse 남측 → Dennery 북측)
  { col: 4, row: 6 },
  { col: 6, row: 0 },  // 서부 하천 (Anse Le Raye ~ Anse Chastenet)
  { col: 6, row: 1 },
  { col: 8, row: 4 },  // 남동 하천 (Fond St Jacques → Micoud)
  { col: 9, row: 4 },
  { col: 9, row: 5 },
];

// === 호수(바다) 타일 ===
export const ST_LUCIA_LAKE_TILES: { col: number; row: number }[] = (() => {
  const lakes: { col: number; row: number }[] = [];
  for (let row = 0; row < ST_LUCIA_MAP.rows; row++) {
    const [min, max] = LAND_RANGES[row];
    for (let col = ST_LUCIA_MAP.startCol; col < ST_LUCIA_MAP.cols; col++) {
      if (col < min || col > max) {
        lakes.push({ col, row });
      }
    }
  }
  return lakes;
})();

// === 물품 디스플레이 열-도시 매핑 (물품 성장 없음 — 신규 도시 A-D만 형식상) ===
export const ST_LUCIA_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 4 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 4 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 4 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 4 },
];

// === 헥스 타일 (지형 정보) 생성 ===
export function generateStLuciaHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];

  for (let row = 0; row < ST_LUCIA_MAP.rows; row++) {
    for (let col = ST_LUCIA_MAP.startCol; col < ST_LUCIA_MAP.cols; col++) {
      let terrain: TerrainType = 'plain';
      if (ST_LUCIA_LAKE_TILES.some((l) => l.col === col && l.row === row)) {
        terrain = 'lake';
      } else if (MOUNTAIN_TILES.some((m) => m.col === col && m.row === row)) {
        terrain = 'mountain';
      } else if (RIVER_TILES.some((r) => r.col === col && r.row === row)) {
        terrain = 'river';
      }

      tiles.push({ coord: { col, row }, terrain });
    }
  }

  return tiles;
}

// === 초기 보드 상태 생성 ===
export function createStLuciaBoardState(): BoardState {
  return {
    cities: ST_LUCIA_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: ST_LUCIA_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateStLuciaHexTiles(),
  };
}

// === 색상 상수 (공식 맵에서 추출한 실측 색) ===
export const ST_LUCIA_COLORS = {
  terrain: {
    plain: '#84A262',    // 측정값 (132,162,98)
    lake: '#8090C0',     // 배경 그라디언트 톤
    river: '#7BA3C9',
    mountain: '#46633F', // 측정값 진녹
  },
  background: '#8C9CCC',
  border: '#5A6B4A',
};
