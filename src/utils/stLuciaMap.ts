// St. Lucia 맵 데이터
// Age of Steam Deluxe Edition - 2인 전용 맵 (8턴)
//
// 카리브해의 화산섬 세인트루시아를 모티프로 한 섬 지형 맵입니다.
// - 섬 모양: 남북으로 긴 타원형, 바깥은 바다(lake)
// - 중앙부: 피톤(Pitons) 화산 산악 지대 (mountain)
// - 해안 도시 5개를 잇는 해안선 경로가 주요 건설 루트

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
  description: '카리브해의 섬 세인트루시아. 2인 전용 8턴 대결 맵',
  players: { min: 2, max: 2 },
  supportedPlayers: [2], // 2인 전용
  difficulty: 3,
  cols: 7, // 유효 col: startCol(1) ~ cols-1(6)
  rows: 7,
  startCol: 1,
  maxTurns: 8, // 룰북: 8턴 완료 후 게임 종료
};

// === 도시 데이터 (실제 세인트루시아의 해안 도시들) ===
export const ST_LUCIA_CITIES: City[] = [
  {
    id: 'G',
    name: 'Gros Islet',
    coord: { col: 4, row: 0 }, // 북단
    color: 'red',
    cubes: [],
  },
  {
    id: 'C',
    name: 'Castries',
    coord: { col: 2, row: 1 }, // 북서 해안 (수도)
    color: 'blue',
    cubes: [],
  },
  {
    id: 'D',
    name: 'Dennery',
    coord: { col: 6, row: 2 }, // 동부 해안
    color: 'yellow',
    cubes: [],
  },
  {
    id: 'S',
    name: 'Soufrière',
    coord: { col: 2, row: 4 }, // 남서 해안 (피톤 인근)
    color: 'purple',
    cubes: [],
  },
  {
    id: 'V',
    name: 'Vieux Fort',
    coord: { col: 4, row: 6 }, // 남단
    color: 'black',
    cubes: [],
  },
];

// === 마을 (도시화 대상) ===
export const ST_LUCIA_TOWNS: Town[] = [
  { id: 'AR', coord: { col: 2, row: 3 }, newCityColor: null, cubes: [] }, // Anse La Raye (서부 해안)
  { id: 'MC', coord: { col: 6, row: 4 }, newCityColor: null, cubes: [] }, // Micoud (동부 해안)
];

// === 섬 지형 정의 ===
// 행별 육지 col 범위 (그 외는 바다 = lake)
const LAND_RANGES: Record<number, [number, number]> = {
  0: [3, 4], // 북단 (좁음)
  1: [2, 5],
  2: [2, 6],
  3: [1, 6], // 중앙 (가장 넓음)
  4: [2, 6],
  5: [2, 5],
  6: [3, 4], // 남단 (좁음)
};

// 산악 지대 (피톤 화산 능선 - 섬 중앙)
const MOUNTAIN_TILES: { col: number; row: number }[] = [
  { col: 3, row: 3 },
  { col: 4, row: 3 },
  { col: 3, row: 4 },
  { col: 4, row: 4 },
];

// 강 (해안 경로를 가로지르는 하천)
const RIVER_TILES: { col: number; row: number }[] = [
  { col: 4, row: 2 }, // Castries → Dennery 경로
  { col: 5, row: 4 }, // 동부 내륙
  { col: 3, row: 5 }, // 남부 해안 경로
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

// === 물품 디스플레이 열-도시 매핑 ===
export const ST_LUCIA_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: '1' as GoodsColumnId, cityId: 'G', isNewCity: false, rowCount: 6 }, // Gros Islet
  { columnId: '2' as GoodsColumnId, cityId: 'C', isNewCity: false, rowCount: 6 }, // Castries
  { columnId: '3' as GoodsColumnId, cityId: 'D', isNewCity: false, rowCount: 6 }, // Dennery
  { columnId: '4' as GoodsColumnId, cityId: 'S', isNewCity: false, rowCount: 6 }, // Soufrière
  { columnId: '5' as GoodsColumnId, cityId: 'V', isNewCity: false, rowCount: 6 }, // Vieux Fort
  { columnId: '6' as GoodsColumnId, cityId: 'C', isNewCity: false, rowCount: 6 }, // Castries (다시)
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
      // 도시 헥스는 지형 없음
      const isCity = ST_LUCIA_CITIES.some(
        (c) => c.coord.col === col && c.coord.row === row
      );
      if (isCity) continue;

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
    hexTiles: generateStLuciaHexTiles(),
  };
}

// === 색상 상수 (UI용 - 열대 섬 톤) ===
export const ST_LUCIA_COLORS = {
  terrain: {
    plain: '#3F6B44',    // 열대 우림 녹색
    lake: '#2E6E8C',     // 카리브해 청록
    river: '#4E8AA0',    // 하천
    mountain: '#6E5F50', // 화산 능선
  },
  background: '#1E3038',
  border: '#2A4250',
};
