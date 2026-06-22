// Germany 맵 데이터
// Age of Steam Germany (John Bohrer, 2003 / James Mathias 아트 2018). 4인 전용(8턴).
//
// 공식 맵 시트(maps/germany-v2.pdf → public/maps/germany.png)를 고해상도 렌더 후
// 색상 기반 자동 검출 + 테두리 자기상관 격자 피팅으로 추출했다.
//   원본은 flat-top(평평한 윗변) 헥스 보드 — St.Lucia/Rust Belt와 동일하게 게임 좌표는
//   전치(transpose)해 저장하고(인접 관계 동형이라 게임 로직 무변경), 렌더만 orientation:'flat'
//   으로 다시 전치한다. 빈 상단 2칸은 col을 −2 평행이동해 제거(맵을 위로 당김).
//   데이터 그리드 15열(0~14) × 13행(0~12).
//
// 특수 개념:
//  - 외국 터미널 6 (isTerminal): 셋업때 무작위 큐브1로 수용색 결정, 통과 불가, 생산 안 함
//  - 헥스 고정비용 (fixedCost €6~€12): 지형 기본비용 대신 사용 (이미지 숫자 판독, 화면에 숫자 표시)
//  - 갈색 산악(mountain), 파란 강(river)
//
// 도시 13(터미널 제외), 외국터미널 6, 마을 14.

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

// === 맵 메타 정보 (전치 저장: cols=화면세로, rows=화면가로) ===
export const GERMANY_MAP = {
  id: 'germany',
  name: 'Germany',
  nameKo: '독일',
  description: '외국 터미널과 알프스를 낀 중부 유럽 4인 맵. 헥스별 고정 건설비용과 Berlin 물품 보너스가 특징.',
  players: { min: 4, max: 4 },
  supportedPlayers: [4],
  difficulty: 4,
  cols: 15, // 유효 col: 0 ~ 14 (전치 — 화면 세로)
  rows: 13, // 유효 row: 0 ~ 12 (전치 — 화면 가로)
  startCol: 0,
  maxTurns: 8, // 룰북 표준: 4인 게임 8턴 (3인10/4인8/5인7/6인6)
};

// === 도시 13 (전치 좌표 / 색) ===
export const GERMANY_CITIES: City[] = [
  { id: 'koenigsberg', name: 'Königsberg',      coord: { col: 2,  row: 12 }, color: 'yellow', cubes: [] },
  { id: 'oldenburg',   name: 'Oldenburg/Bremen', coord: { col: 3,  row: 3 },  color: 'blue',   cubes: [] },
  { id: 'hannover',    name: 'Hannover',         coord: { col: 4,  row: 5 },  color: 'red',    cubes: [] },
  { id: 'berlin',      name: 'Berlin',           coord: { col: 4,  row: 9 },  color: 'black',  cubes: [] },
  { id: 'essen',       name: 'Essen/Dortmund',   coord: { col: 6,  row: 3 },  color: 'blue',   cubes: [] },
  { id: 'duesseldorf', name: 'Düsseldorf/Köln',  coord: { col: 7,  row: 2 },  color: 'red',    cubes: [] },
  { id: 'dresden',     name: 'Dresden',          coord: { col: 8,  row: 10 }, color: 'blue',   cubes: [] },
  { id: 'breslau',     name: 'Breslau',          coord: { col: 8,  row: 12 }, color: 'purple', cubes: [] },
  { id: 'nuernberg',   name: 'Nürnberg',         coord: { col: 10, row: 7 },  color: 'red',    cubes: [] },
  { id: 'stuttgart',   name: 'Stuttgart',        coord: { col: 11, row: 4 },  color: 'blue',   cubes: [] },
  { id: 'muenchen',    name: 'München',          coord: { col: 12, row: 7 },  color: 'red',    cubes: [] },
  { id: 'zuerich',     name: 'Zürich',           coord: { col: 14, row: 4 },  color: 'purple', cubes: [] },
  { id: 'wien',        name: 'Wien',             coord: { col: 14, row: 12 }, color: 'yellow', cubes: [] },
];

// === 외국 터미널 6 (isTerminal — 셋업때 수용색이 무작위로 정해진다; color는 placeholder) ===
export const GERMANY_TERMINALS: City[] = [
  { id: 'kopenhagen', name: 'Kopenhagen', coord: { col: 0,  row: 7 },  color: 'blue', cubes: [], isTerminal: true },
  { id: 'rotterdam',  name: 'Rotterdam',  coord: { col: 5,  row: 0 },  color: 'blue', cubes: [], isTerminal: true },
  { id: 'warschau',   name: 'Warschau',   coord: { col: 5,  row: 12 }, color: 'blue', cubes: [], isTerminal: true },
  { id: 'antwerpen',  name: 'Antwerpen',  coord: { col: 8,  row: 0 },  color: 'blue', cubes: [], isTerminal: true },
  { id: 'paris',      name: 'Paris',      coord: { col: 11, row: 0 },  color: 'blue', cubes: [], isTerminal: true },
  { id: 'lyon',       name: 'Lyon',       coord: { col: 14, row: 0 },  color: 'blue', cubes: [], isTerminal: true },
];

export const GERMANY_ALL_CITIES: City[] = [...GERMANY_CITIES, ...GERMANY_TERMINALS];

// === 마을 14 (전치 좌표) ===
export const GERMANY_TOWNS: Town[] = [
  { id: 'HAM', coord: { col: 2,  row: 5 },  newCityColor: null, cubes: [] }, // Hamburg
  { id: 'ROS', coord: { col: 3,  row: 8 },  newCityColor: null, cubes: [] }, // Rostock
  { id: 'STE', coord: { col: 3,  row: 11 }, newCityColor: null, cubes: [] }, // Stettin
  { id: 'MAG', coord: { col: 5,  row: 7 },  newCityColor: null, cubes: [] }, // Magdeburg
  { id: 'KAS', coord: { col: 6,  row: 5 },  newCityColor: null, cubes: [] }, // Kassel
  { id: 'GOE', coord: { col: 6,  row: 11 }, newCityColor: null, cubes: [] }, // Görlitz
  { id: 'LEI', coord: { col: 7,  row: 8 },  newCityColor: null, cubes: [] }, // Leipzig
  { id: 'FRA', coord: { col: 9,  row: 4 },  newCityColor: null, cubes: [] }, // Frankfurt
  { id: 'WUR', coord: { col: 9,  row: 6 },  newCityColor: null, cubes: [] }, // Würzburg
  { id: 'PIL', coord: { col: 10, row: 10 }, newCityColor: null, cubes: [] }, // Pilsen
  { id: 'PRA', coord: { col: 10, row: 12 }, newCityColor: null, cubes: [] }, // Prag
  { id: 'SAA', coord: { col: 11, row: 2 },  newCityColor: null, cubes: [] }, // Saarbrücken
  { id: 'PAS', coord: { col: 12, row: 10 }, newCityColor: null, cubes: [] }, // Passau
  { id: 'FRE', coord: { col: 12, row: 3 },  newCityColor: null, cubes: [] }, // Freiburg
];

export const GERMANY_TOWN_NAMES: Record<string, string> = {
  HAM: 'Hamburg', ROS: 'Rostock', STE: 'Stettin', MAG: 'Magdeburg', KAS: 'Kassel',
  GOE: 'Görlitz', LEI: 'Leipzig', FRA: 'Frankfurt', WUR: 'Würzburg', PIL: 'Pilsen',
  PRA: 'Prag', SAA: 'Saarbrücken', PAS: 'Passau', FRE: 'Freiburg',
};

// === 물품 디스플레이 열-도시 매핑 (터미널·Berlin 제외 → 일반 물품성장 안 받음) ===
// diceNumber = 원본 맵 도시 헥스에 인쇄된 숫자 (그 도시가 물품을 받는 주사위 번호).
//   1: München·Zürich  2: Nürnberg·Stuttgart  3: Essen·Düsseldorf
//   4: Oldenburg·Wien  5: Hannover·Dresden    6: Königsberg·Breslau
export const GERMANY_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'muenchen',    cityId: 'muenchen',    isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'zuerich',     cityId: 'zuerich',     isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'nuernberg',   cityId: 'nuernberg',   isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'stuttgart',   cityId: 'stuttgart',   isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'essen',       cityId: 'essen',       isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'duesseldorf', cityId: 'duesseldorf', isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'oldenburg',   cityId: 'oldenburg',   isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'wien',        cityId: 'wien',        isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'hannover',    cityId: 'hannover',    isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'dresden',     cityId: 'dresden',     isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'koenigsberg', cityId: 'koenigsberg', isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'breslau',     cityId: 'breslau',     isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2, diceNumber: 2 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

export const GERMANY_CUBE_COUNTS: Partial<Record<CubeColor, number>> = {
  red: 20, blue: 20, yellow: 20, purple: 20, black: 16,
};

// === 맵 밖(베이지 외곽) — lake로 생성 후 hideLakeHexes로 안 그려 독일 국경 윤곽 표현 (전치 좌표) ===
const OFFMAP: [number, number][] = [
  [0,0],[0,1],[0,2],[0,3],[0,4],[0,6],[0,8],[0,9],[0,10],[0,11],[0,12],
  [1,0],[1,1],[1,2],[1,3],[1,4],[1,7],[1,8],[1,9],[1,10],[1,11],[1,12],
  [2,0],[2,1],[2,2],[2,3],[2,4],[2,6],[2,7],[2,8],[2,10],
  [3,0],[3,2],[4,0],[4,12],[6,0],[6,12],[7,0],[9,0],[10,0],[12,0],[13,0],
  [14,1],[14,3],[14,5],[14,7],[14,9],[14,11],
];

// === 산악(갈색) 헥스 (전치 좌표) ===
const MOUNTAIN: [number, number][] = [
  [8,5],[8,7],[9,8],[9,9],[9,10],[9,11],[10,9],[11,10],[11,11],[12,2],[12,4],[12,5],
  [12,9],[12,11],[12,12],[13,2],[13,6],[13,7],[13,8],[13,9],[13,10],[14,2],[14,6],[14,8],[14,10],
];

// === 강(파랑) 헥스 (전치 좌표) ===
const RIVER: [number, number][] = [
  [3,4],[3,5],[3,10],[5,5],[6,1],[6,2],[8,2],[8,3],[9,3],
];

// === 헥스별 고정 건설비용 (€) — 이미지 숫자 판독 (전치 좌표) ===
const FIXED_COST: Record<string, number> = {
  '1,6':8,'2,11':12,'3,12':12,'4,1':6,'4,11':8,'5,1':6,'5,11':8,'7,1':7,'7,11':9,'7,12':8,
  '8,1':7,'8,11':9,'9,12':9,'10,1':11,'11,1':11,'13,1':10,'13,3':9,'13,4':9,'13,5':9,'13,11':10,'13,12':10,
};

// === 헥스 타일 생성 ===
export function generateGermanyHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const cityKeys = new Set(GERMANY_ALL_CITIES.map((c) => `${c.coord.col},${c.coord.row}`));
  const offKeys = new Set(OFFMAP.map(([c, r]) => `${c},${r}`));
  const mtnKeys = new Set(MOUNTAIN.map(([c, r]) => `${c},${r}`));
  const rivKeys = new Set(RIVER.map(([c, r]) => `${c},${r}`));

  for (let row = 0; row < GERMANY_MAP.rows; row++) {
    for (let col = GERMANY_MAP.startCol; col < GERMANY_MAP.cols; col++) {
      const key = `${col},${row}`;
      if (cityKeys.has(key)) continue;   // 도시/터미널 헥스는 지형 없음
      // 맵 밖(베이지 외곽)은 lake로 생성 → hideLakeHexes로 안 그려 독일 국경 윤곽을 표현
      if (offKeys.has(key)) { tiles.push({ coord: { col, row }, terrain: 'lake' }); continue; }

      const fixedCost = FIXED_COST[key];
      let terrain: TerrainType = 'plain';
      if (fixedCost === undefined) {
        if (mtnKeys.has(key)) terrain = 'mountain';
        else if (rivKeys.has(key)) terrain = 'river';
      }

      tiles.push(fixedCost !== undefined ? { coord: { col, row }, terrain, fixedCost } : { coord: { col, row }, terrain });
    }
  }
  return tiles;
}

// === 초기 보드 상태 ===
export function createGermanyBoardState(): BoardState {
  return {
    cities: GERMANY_ALL_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: GERMANY_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateGermanyHexTiles(),
  };
}

// === 색상 상수 (공식 맵 톤) ===
export const GERMANY_COLORS = {
  terrain: {
    plain: '#80C080',      // 연두 평원
    lake: '#E9E2CB',       // 맵 밖 (베이지)
    river: '#5FA3D4',      // 강 파랑
    mountain: '#A07838',   // 산악 갈색
  },
  background: '#E9E2CB',
  border: '#5B4A2E',
};
