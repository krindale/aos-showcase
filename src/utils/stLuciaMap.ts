// St. Lucia 맵 데이터
// Age of Steam: St. Lucia (Ted Alspach, Bezier Games) - 2인 전용, 8턴
//
// 공식 맵 시트(maps/aos-st_lucia.pdf) 기준:
// - 도시가 없고 **마을 11개**만 존재 — 배달 목적지는 도시화(Urbanization)로 생성
// - 남북으로 긴 섬 (13행), 중앙 산맥(Barre de l'Isle ~ Morne Gimie 능선), 강 4곳
// - 셋업: 모든 평지/강 헥스에 큐브 1개
// - Turn Order / Production 행동 불가, 물품 성장 없음

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
  supportedPlayers: [2], // 2인 전용
  difficulty: 3,
  cols: 9, // 유효 col: startCol(1) ~ cols-1(8)
  rows: 13,
  startCol: 1,
  maxTurns: 8, // 룰북: 8턴 완료 후 게임 종료
};

// === 도시: 없음! (공식 맵 — 도시는 Urbanization으로만 생성) ===
export const ST_LUCIA_CITIES: City[] = [];

// === 마을 11개 (공식 맵 시트의 실제 마을) ===
export const ST_LUCIA_TOWNS: Town[] = [
  { id: 'LC', coord: { col: 5, row: 0 }, newCityColor: null, cubes: [] },  // Le Cap (북단)
  { id: 'CS', coord: { col: 3, row: 3 }, newCityColor: null, cubes: [] },  // Castries (북서 해안)
  { id: 'GA', coord: { col: 6, row: 4 }, newCityColor: null, cubes: [] },  // Grand Anse (북동 해안)
  { id: 'BI', coord: { col: 4, row: 6 }, newCityColor: null, cubes: [] },  // Barre de l'Isle (중앙)
  { id: 'AR', coord: { col: 1, row: 7 }, newCityColor: null, cubes: [] },  // Anse Le Raye (서해안)
  { id: 'DN', coord: { col: 7, row: 7 }, newCityColor: null, cubes: [] },  // Dennery (동해안)
  { id: 'MG', coord: { col: 4, row: 9 }, newCityColor: null, cubes: [] },  // Morne Gimie (중앙 산악)
  { id: 'AC', coord: { col: 1, row: 9 }, newCityColor: null, cubes: [] },  // Anse Chastenet (서해안)
  { id: 'FJ', coord: { col: 3, row: 11 }, newCityColor: null, cubes: [] }, // Fond St Jacques (남부)
  { id: 'MC', coord: { col: 7, row: 11 }, newCityColor: null, cubes: [] }, // Micoud (남동 해안)
  { id: 'LB', coord: { col: 4, row: 12 }, newCityColor: null, cubes: [] }, // Laborie (남단)
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

// === 섬 지형 정의 ===
// 행별 육지 col 범위 — 공식 맵의 섬 윤곽 (북단 좁음 → 중앙 넓음 → 남단 좁음)
const LAND_RANGES: Record<number, [number, number]> = {
  0: [4, 6],   // 북단 (Le Cap)
  1: [4, 6],
  2: [3, 6],
  3: [3, 7],   // Castries 행
  4: [2, 7],   // Grand Anse 행
  5: [2, 7],
  6: [1, 7],   // Barre de l'Isle — 중앙 (가장 넓음)
  7: [1, 7],   // Anse Le Raye ~ Dennery
  8: [1, 7],
  9: [1, 7],   // Anse Chastenet ~ Morne Gimie
  10: [1, 7],
  11: [2, 7],  // Fond St Jacques ~ Micoud
  12: [3, 6],  // 남단 (Laborie)
};

// 산악 지대 (공식 맵의 진녹색 — 중앙 능선 + Morne Gimie 군집)
const MOUNTAIN_TILES: { col: number; row: number }[] = [
  { col: 5, row: 2 },  // 북부 능선 (Castries 동측)
  { col: 5, row: 4 },  // 중북부
  { col: 5, row: 6 },  // Barre de l'Isle 동측
  { col: 5, row: 7 },
  { col: 2, row: 8 },  // Morne Gimie 서측 군집
  { col: 3, row: 8 },
  { col: 5, row: 8 },  // Morne Gimie 동측
  { col: 3, row: 10 }, // Morne Gimie 남측
  { col: 4, row: 10 },
];

// 강 (공식 맵의 4개 하천)
const RIVER_TILES: { col: number; row: number }[] = [
  { col: 2, row: 4 },  // Castries 남서쪽 → 서해안
  { col: 6, row: 5 },  // Dennery 북쪽 → 동해안
  { col: 2, row: 7 },  // Anse Chastenet 북쪽 → 서해안
  { col: 5, row: 11 }, // Micoud 남서쪽 → 남동 해안
  { col: 6, row: 12 },
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
// 물품 성장이 없는 맵이라 사실상 미사용 — 신규 도시(A-D) 열만 형식상 유지
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
      // 도시는 없음 — 모든 육지 헥스에 지형 부여 (마을 헥스 포함: 마을은 트랙 배치 가능)
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

// === 색상 상수 (UI용 - 공식 맵 톤) ===
export const ST_LUCIA_COLORS = {
  terrain: {
    plain: '#8FBC6E',    // 공식 맵의 연녹색
    lake: '#8C9FC9',     // 바다 (배경 보라-블루 톤)
    river: '#7BA3C9',    // 하천
    mountain: '#3E6B3A', // 공식 맵의 진녹색 산
  },
  background: '#9FA8D0',
  border: '#5A6B4A',
};
