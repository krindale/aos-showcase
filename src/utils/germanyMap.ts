// Germany 맵 데이터
// Age of Steam Germany (John Bohrer, 2003 / James Mathias 아트 2018). 4인 전용(6턴).
//
// 공식 맵 시트(maps/germany-v2.pdf → public/maps/germany.png)를 고해상도 렌더 후
// 색상 기반 자동 검출 + 격자 피팅으로 추출했다.
//   pointy-top odd-r offset. 격자 파라미터: X0=88, DX=115.87, Y0=531, DY=100.1 (px)
//   (col,row) = round 변환, orientation 'pointy' 기본이라 전치 불필요.
//
// 특수 개념:
//  - 외국 터미널 6 (isTerminal): 셋업때 무작위 큐브1로 수용색 결정, 통과 불가, 생산 안 함
//  - 헥스 고정비용 (fixedCost €6~€12): 지형 기본비용 대신 사용 (이미지 숫자 판독)
//  - Essen/Dortmund↔Düsseldorf/Köln 직결 €2: 중간 헥스(4,12) fixedCost=2로 표현
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

// === 맵 메타 정보 ===
export const GERMANY_MAP = {
  id: 'germany',
  name: 'Germany',
  nameKo: '독일',
  description: '외국 터미널과 알프스를 낀 중부 유럽 4인 맵. 헥스별 고정 건설비용과 Berlin 물품 보너스가 특징.',
  players: { min: 4, max: 4 },
  supportedPlayers: [4],
  difficulty: 4,
  cols: 20, // 유효 col: 0 ~ 19
  rows: 29, // 유효 row: 0 ~ 28
  startCol: 0,
  maxTurns: 6, // 4인 게임 6턴
};

// === 도시 13 (내국 도시; 색/좌표) ===
export const GERMANY_CITIES: City[] = [
  { id: 'koenigsberg', name: 'Königsberg',      coord: { col: 18, row: 3 },  color: 'yellow', cubes: [] },
  { id: 'oldenburg',   name: 'Oldenburg/Bremen', coord: { col: 5,  row: 6 },  color: 'blue',   cubes: [] },
  { id: 'hannover',    name: 'Hannover',         coord: { col: 8,  row: 8 },  color: 'red',    cubes: [] },
  { id: 'berlin',      name: 'Berlin',           coord: { col: 14, row: 8 },  color: 'black',  cubes: [] },
  { id: 'essen',       name: 'Essen/Dortmund',   coord: { col: 5,  row: 12 }, color: 'blue',   cubes: [] },
  { id: 'duesseldorf', name: 'Düsseldorf/Köln',  coord: { col: 3,  row: 13 }, color: 'red',    cubes: [] },
  { id: 'dresden',     name: 'Dresden',          coord: { col: 15, row: 15 }, color: 'blue',   cubes: [] },
  { id: 'breslau',     name: 'Breslau',          coord: { col: 18, row: 15 }, color: 'purple', cubes: [] },
  { id: 'nuernberg',   name: 'Nürnberg',         coord: { col: 11, row: 20 }, color: 'red',    cubes: [] },
  { id: 'stuttgart',   name: 'Stuttgart',        coord: { col: 6,  row: 21 }, color: 'blue',   cubes: [] },
  { id: 'muenchen',    name: 'München',          coord: { col: 11, row: 24 }, color: 'red',    cubes: [] },
  { id: 'zuerich',     name: 'Zürich',           coord: { col: 6,  row: 27 }, color: 'purple', cubes: [] },
  { id: 'wien',        name: 'Wien',             coord: { col: 18, row: 27 }, color: 'yellow', cubes: [] },
];

// === 외국 터미널 6 (isTerminal — 셋업때 수용색이 무작위로 정해진다; color는 placeholder) ===
export const GERMANY_TERMINALS: City[] = [
  { id: 'kopenhagen', name: 'Kopenhagen', coord: { col: 11, row: 0 },  color: 'blue', cubes: [], isTerminal: true },
  { id: 'rotterdam',  name: 'Rotterdam',  coord: { col: 0,  row: 9 },  color: 'blue', cubes: [], isTerminal: true },
  { id: 'warschau',   name: 'Warschau',   coord: { col: 18, row: 9 },  color: 'blue', cubes: [], isTerminal: true },
  { id: 'antwerpen',  name: 'Antwerpen',  coord: { col: 0,  row: 15 }, color: 'blue', cubes: [], isTerminal: true },
  { id: 'paris',      name: 'Paris',      coord: { col: 0,  row: 21 }, color: 'blue', cubes: [], isTerminal: true },
  { id: 'lyon',       name: 'Lyon',       coord: { col: 0,  row: 27 }, color: 'blue', cubes: [], isTerminal: true },
];

// 도시 + 터미널 (보드 cities 배열에 함께 들어간다)
export const GERMANY_ALL_CITIES: City[] = [...GERMANY_CITIES, ...GERMANY_TERMINALS];

// === 마을 14 ===
export const GERMANY_TOWNS: Town[] = [
  { id: 'HAM', coord: { col: 8,  row: 4 },  newCityColor: null, cubes: [] }, // Hamburg
  { id: 'ROS', coord: { col: 12, row: 5 },  newCityColor: null, cubes: [] }, // Rostock
  { id: 'STE', coord: { col: 17, row: 6 },  newCityColor: null, cubes: [] }, // Stettin
  { id: 'MAG', coord: { col: 11, row: 10 }, newCityColor: null, cubes: [] }, // Magdeburg
  { id: 'KAS', coord: { col: 8,  row: 12 }, newCityColor: null, cubes: [] }, // Kassel
  { id: 'GOE', coord: { col: 17, row: 12 }, newCityColor: null, cubes: [] }, // Görlitz
  { id: 'LEI', coord: { col: 12, row: 13 }, newCityColor: null, cubes: [] }, // Leipzig
  { id: 'FRA', coord: { col: 6,  row: 17 }, newCityColor: null, cubes: [] }, // Frankfurt
  { id: 'WUR', coord: { col: 9,  row: 17 }, newCityColor: null, cubes: [] }, // Würzburg
  { id: 'PIL', coord: { col: 15, row: 19 }, newCityColor: null, cubes: [] }, // Pilsen
  { id: 'PRA', coord: { col: 18, row: 19 }, newCityColor: null, cubes: [] }, // Prag
  { id: 'SAA', coord: { col: 3,  row: 21 }, newCityColor: null, cubes: [] }, // Saarbrücken
  { id: 'PAS', coord: { col: 15, row: 23 }, newCityColor: null, cubes: [] }, // Passau
  { id: 'FRE', coord: { col: 5,  row: 24 }, newCityColor: null, cubes: [] }, // Freiburg
];

export const GERMANY_TOWN_NAMES: Record<string, string> = {
  HAM: 'Hamburg', ROS: 'Rostock', STE: 'Stettin', MAG: 'Magdeburg', KAS: 'Kassel',
  GOE: 'Görlitz', LEI: 'Leipzig', FRA: 'Frankfurt', WUR: 'Würzburg', PIL: 'Pilsen',
  PRA: 'Prag', SAA: 'Saarbrücken', PAS: 'Passau', FRE: 'Freiburg',
};

// === 물품 디스플레이 열-도시 매핑 (터미널·Berlin 제외 → 그들은 일반 물품성장 안 받음) ===
// 12개 내국 도시(Berlin 제외)가 주사위 6번호를 2개씩 공유(열당 3칸=36) + 신규 도시 A~H(2칸=16) = 52칸.
export const GERMANY_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'koenigsberg', cityId: 'koenigsberg', isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'muenchen',    cityId: 'muenchen',    isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'oldenburg',   cityId: 'oldenburg',   isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'zuerich',     cityId: 'zuerich',     isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'hannover',    cityId: 'hannover',    isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'wien',        cityId: 'wien',        isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'essen',       cityId: 'essen',       isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'dresden',     cityId: 'dresden',     isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'duesseldorf', cityId: 'duesseldorf', isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'breslau',     cityId: 'breslau',     isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'nuernberg',   cityId: 'nuernberg',   isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'stuttgart',   cityId: 'stuttgart',   isNewCity: false, rowCount: 3, diceNumber: 6 },
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

// === 맵 밖(베이지 외곽) 헥스 — 생성하지 않는다 ===
const OFFMAP: [number, number][] = [
  [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],
  [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[11,1],[12,1],[13,1],[14,1],[15,1],[16,1],[17,1],[18,1],[19,1],
  [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[11,2],[12,2],[13,2],[14,2],[15,2],[16,2],[17,2],[18,2],[19,2],
  [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[9,3],[10,3],[11,3],[12,3],[13,3],[14,3],[15,3],[16,3],
  [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[10,4],[11,4],[12,4],
  [0,5],[1,5],[3,5],[4,5],
  [0,6],[1,6],[19,6],
  [0,7],[18,7],[19,7],
  [0,8],[19,8],
  [0,10],[19,10],
  [0,11],[18,11],[19,11],
  [0,12],[1,12],[19,12],
  [0,13],
  [0,14],
  [0,16],
  [0,17],[0,18],[1,18],
  [0,19],
  [0,20],
  [0,22],
  [0,23],
  [0,24],[1,24],
  [0,25],
  [0,26],
  [0,28],[2,28],[3,28],[5,28],[6,28],[7,28],[8,28],[9,28],[11,28],[12,28],[14,28],[15,28],[17,28],[18,28],[19,28],
];

// === 산악(갈색) 헥스 ===
const MOUNTAIN: [number, number][] = [
  [8,15],[11,15],[8,16],[9,16],[11,16],[12,16],[13,16],[16,16],[11,17],[12,17],[13,17],[14,17],[15,17],[16,17],[17,17],
  [13,18],[14,18],[15,18],[16,18],[17,18],[18,18],[13,19],[14,19],[14,20],[15,20],[16,20],
  [14,21],[15,21],[16,21],[17,21],[4,22],[7,22],[16,22],[17,22],[18,22],[19,22],
  [3,23],[4,23],[6,23],[7,23],[8,23],[16,23],[17,23],[18,23],[19,23],
  [3,24],[4,24],[7,24],[8,24],[9,24],[13,24],[14,24],[15,24],[16,24],[17,24],[18,24],[19,24],
  [3,25],[4,25],[8,25],[9,25],[10,25],[11,25],[12,25],[13,25],[14,25],[15,25],[16,25],[17,25],
  [3,26],[4,26],[9,26],[10,26],[11,26],[12,26],[13,26],[14,26],[15,26],[16,26],
  [3,27],[4,27],[9,27],[10,27],[11,27],[12,27],[13,27],[14,27],[15,27],[16,27],[4,28],[10,28],[13,28],[16,28],
];

// === 강(파랑) 헥스 ===
const RIVER: [number, number][] = [
  [10,1],[5,5],[6,5],[7,5],[15,5],[8,6],[4,7],[5,7],[1,8],[18,8],[1,10],[8,10],[18,10],
  [3,11],[4,11],[5,11],[2,12],[4,13],[5,13],[1,14],[15,14],[16,14],[3,15],[1,16],[5,16],[15,16],
  [5,18],[1,20],[6,20],[7,20],[1,22],[6,22],[1,26],[1,28],
];

// === 헥스별 고정 건설비용 (€) — 이미지 숫자 판독. (4,12)=2 는 Essen↔Düsseldorf 직결 링크 ===
const FIXED_COST: Record<string, number> = {
  '10,0':8,'9,1':8,'7,4':7,'17,4':12,'11,5':8,'18,5':12,'4,6':6,'16,6':8,
  '2,8':6,'7,8':8,'13,8':8,'17,8':8,'17,9':8,'2,10':6,'10,10':8,'17,10':8,
  '4,12':2,'7,12':8,'16,12':8,'2,13':6,'11,13':8,'18,13':8,'2,14':7,'17,14':9,
  '14,15':8,'17,15':7,'2,16':7,'17,16':9,'5,17':9,'18,17':11,'8,17':9,'2,20':11,
  '10,20':8,'17,19':9,'2,21':11,'5,21':11,'2,22':11,'14,23':10,'10,24':10,'6,25':9,
  '18,25':10,'2,26':10,'5,26':9,'8,26':8,'17,26':10,'5,27':9,'17,27':10,
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
      if (offKeys.has(key)) continue;     // 맵 밖

      const fixedCost = FIXED_COST[key];
      let terrain: TerrainType = 'plain';
      // 고정비용 헥스는 평지로 두고 fixedCost로 비용 결정 (지형 우선순위보다 명시 비용이 위)
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
    lake: '#E9E2CB',       // (미사용)
    river: '#5FA3D4',      // 강 파랑
    mountain: '#A07838',   // 산악 갈색
  },
  background: '#E9E2CB',
  border: '#5B4A2E',
};
