// Montréal Métro 맵 데이터
// Age of Steam Expansion — Montréal Métro (Michael Webb 2007 / James Mathias 아트 2018). 3인 전용(9턴).
//
// 공식 맵 시트(maps/montreal-metro-v2.pdf)를 고해상도 렌더 후 격자 피팅 + 색상 분류로 추출했다.
//   원본은 flat-top(평평한 윗변) 헥스 보드 — Germany/Rust Belt와 동일하게 게임 좌표는
//   전치(transpose)해 저장하고(인접 관계 동형이라 게임 로직 무변경), 렌더만 orientation:'flat'.
//   데이터 그리드 11열(0~10, 화면 세로) × 15행(0~14, 화면 가로). 홀수 데이터 row(화면 열)가 반 칸 아래.
//
// 특수 개념 (몬트리올 용어 — Station=도시, Stop=마을, Passenger=화물):
//  - 지형 비용: 평지 $2 / 언덕(mountain) $3 / 도로(street=swamp 재사용) $4 / 물(sea, 전체 채움) $6
//    → 표준 기본비용과 다른 지형은 전부 fixedCost로 주입 (Western US 패턴)
//  - Jean-Drapeau 우측 물 헥스 1개만 $5 (원본 맵 표기)
//  - Parc Mont-Royal: 언덕 3헥스 클러스터 — 관통 건설 금지 (blockedEdges로 밀봉, 굵은 외곽선 렌더)
//  - Atwater는 빨강+파랑 겸용 도시 (City.extraColor)
//
// 도시(Station) 11, 마을(Stop) 16. 물품 디스플레이 미사용(성장 단계 없음 — Repopulation이 주머니에서 뽑음).

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
export const MONTREAL_MAP = {
  id: 'montreal',
  name: 'Montréal Métro',
  nameKo: '몬트리올 메트로',
  description:
    '몬트리올 지하철망을 놓는 3인 전용 맵. 매 라운드 정부가 중립 링크를 건설하고, 보드 위 모든 트랙이 하나로 이어져야 한다.',
  players: { min: 3, max: 3 },
  supportedPlayers: [3],
  difficulty: 5,
  cols: 11, // 유효 col: 0 ~ 10 (전치 — 화면 세로)
  rows: 15, // 유효 row: 0 ~ 14 (전치 — 화면 가로)
  startCol: 0,
  maxTurns: 9, // 원본 룰: 3인 9라운드
};

// === 도시(Station) 11 (전치 좌표 / 색 / 초기 화물 수는 MONTREAL_CITY_CUBE_COUNTS) ===
export const MONTREAL_CITIES: City[] = [
  { id: 'coteVertu',     name: 'Côte-Vertu',     coord: { col: 0,  row: 1 },  color: 'purple', cubes: [] },
  { id: 'henriBourassa', name: 'Henri-Bourassa', coord: { col: 2,  row: 6 },  color: 'purple', cubes: [] },
  { id: 'snowdon',       name: 'Snowdon',        coord: { col: 5,  row: 1 },  color: 'blue',   cubes: [] },
  { id: 'jeanTalon',     name: 'Jean-Talon',     coord: { col: 5,  row: 6 },  color: 'blue',   cubes: [] },
  { id: 'saintMichel',   name: 'Saint-Michel',   coord: { col: 5,  row: 10 }, color: 'blue',   cubes: [] },
  // Atwater는 공식 시트에서 빨강/파랑 반반 — 두 색 화물을 모두 받는다 (extraColor)
  { id: 'atwater',       name: 'Atwater',        coord: { col: 7,  row: 3 },  color: 'red',    cubes: [], extraColor: 'blue' },
  { id: 'assomption',    name: 'Assomption',     coord: { col: 7,  row: 12 }, color: 'red',    cubes: [] },
  { id: 'berriUqam',     name: 'Berri-UQAM',     coord: { col: 8,  row: 7 },  color: 'yellow', cubes: [] },
  { id: 'angrignon',     name: 'Angrignon',      coord: { col: 9,  row: 0 },  color: 'red',    cubes: [] },
  { id: 'lionelGroulx',  name: 'Lionel-Groulx',  coord: { col: 10, row: 2 },  color: 'red',    cubes: [] },
  { id: 'longueuil',     name: 'Longueuil',      coord: { col: 10, row: 10 }, color: 'yellow', cubes: [] },
];

/** 셋업: 도시별 초기 화물 수 (공식 시트 도시 헥스의 숫자 박스) */
export const MONTREAL_CITY_CUBE_COUNTS: Record<string, number> = {
  coteVertu: 5,
  henriBourassa: 3,
  snowdon: 4,
  jeanTalon: 4,
  saintMichel: 3,
  atwater: 4,
  assomption: 4,
  berriUqam: 6,
  angrignon: 4,
  lionelGroulx: 3,
  longueuil: 4,
};

// === 마을(Stop) 16 (전치 좌표) ===
export const MONTREAL_TOWNS: Town[] = [
  { id: 'MON', coord: { col: 0,  row: 4 },  newCityColor: null, cubes: [] }, // Montmorency
  { id: 'CAR', coord: { col: 0,  row: 6 },  newCityColor: null, cubes: [] }, // Cartier
  { id: 'CAN', coord: { col: 2,  row: 3 },  newCityColor: null, cubes: [] }, // Canora
  { id: 'SLE', coord: { col: 2,  row: 9 },  newCityColor: null, cubes: [] }, // Saint-Léonard
  { id: 'NAM', coord: { col: 3,  row: 1 },  newCityColor: null, cubes: [] }, // Namur
  { id: 'ACA', coord: { col: 4,  row: 4 },  newCityColor: null, cubes: [] }, // Acadie
  { id: 'UDM', coord: { col: 5,  row: 3 },  newCityColor: null, cubes: [] }, // Université-de-Montréal
  { id: 'FAB', coord: { col: 5,  row: 8 },  newCityColor: null, cubes: [] }, // Fabre
  { id: 'LAU', coord: { col: 6,  row: 7 },  newCityColor: null, cubes: [] }, // Laurier
  { id: 'VEN', coord: { col: 7,  row: 1 },  newCityColor: null, cubes: [] }, // Vendôme
  { id: 'PDA', coord: { col: 7,  row: 5 },  newCityColor: null, cubes: [] }, // Place-des-Arts
  { id: 'PIX', coord: { col: 8,  row: 10 }, newCityColor: null, cubes: [] }, // Pie-IX
  { id: 'BON', coord: { col: 9,  row: 4 },  newCityColor: null, cubes: [] }, // Bonaventure
  { id: 'JDR', coord: { col: 10, row: 8 },  newCityColor: null, cubes: [] }, // Jean-Drapeau
  { id: 'HBG', coord: { col: 7,  row: 14 }, newCityColor: null, cubes: [] }, // Honoré-Beaugrand
  { id: 'BOU', coord: { col: 10, row: 14 }, newCityColor: null, cubes: [] }, // Boucherville
];

export const MONTREAL_TOWN_NAMES: Record<string, string> = {
  MON: 'Montmorency', CAR: 'Cartier', CAN: 'Canora', SLE: 'Saint-Léonard',
  NAM: 'Namur', ACA: 'Acadie', UDM: 'Université-de-Montréal', FAB: 'Fabre',
  LAU: 'Laurier', VEN: 'Vendôme', PDA: 'Place-des-Arts', PIX: 'Pie-IX',
  BON: 'Bonaventure', JDR: 'Jean-Drapeau', HBG: 'Honoré-Beaugrand', BOU: 'Boucherville',
};

// === 물품 디스플레이 열-도시 매핑 (물품 성장 없음 — rowCount 전부 0 = 디스플레이 미사용) ===
// 도시 항목의 diceNumber는 주사위 번호가 아니라 **원본 시트에 인쇄된 초기 화물 수** —
// 성장 단계가 없어 주사위로는 쓰이지 않고, 도시 헥스 위·아래 숫자 박스 표시에만 쓰인다.
export const MONTREAL_COLUMN_MAPPING: GoodsColumnMapping[] = [
  ...MONTREAL_CITIES.map((c) => ({
    columnId: c.id as GoodsColumnId,
    cityId: c.id,
    isNewCity: false,
    rowCount: 0,
    diceNumber: MONTREAL_CITY_CUBE_COUNTS[c.id],
  })),
  ...(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const).map((id) => ({
    columnId: id as GoodsColumnId,
    cityId: id,
    isNewCity: true,
    rowCount: 0,
  })),
];

// === 맵 밖(베이지 외곽) — lake로 생성 후 hideLakeHexes로 안 그려 보드 윤곽 표현 (전치 좌표) ===
const OFFMAP: [number, number][] = [
  // 우상단 정부 트랙 패널 영역 (화면: 열 11~14 × 행 0~4)
  ...([0, 1, 2, 3, 4] as const).flatMap((c) => [11, 12, 13, 14].map((r) => [c, r] as [number, number])),
  [5, 14],
  // 화면 최하단 행(r=10)의 홀수 열은 반 칸 내려가 보드 밖
  [10, 1], [10, 3], [10, 5], [10, 7], [10, 9], [10, 11], [10, 13],
];

// === 언덕(갈색, $3) 헥스 (전치 좌표) ===
const HILL: [number, number][] = [
  [5, 4], [5, 5], [5, 7], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [7, 2],
];

/** Parc Mont-Royal — 언덕 3헥스 클러스터, 관통 건설 금지 (전치 좌표) */
export const MONTREAL_PARC_HEXES: [number, number][] = [
  [6, 3], [6, 4], [6, 5],
];

// === 물(sea, 파랑 전체 채움, $6) 헥스 (전치 좌표). 도로가 지나는 물 헥스도 $6 유지(원본 룰) ===
const WATER: [number, number][] = [
  [0, 2], [0, 3],
  [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10],
  [8, 9], [8, 11], [8, 13],
  [9, 5], [9, 7], [9, 8], [9, 9], [9, 10], [9, 12], [9, 14],
  [10, 4], [10, 6],
];

/** Jean-Drapeau 우측 물 헥스 — 유일한 $5 (원본 맵 표기) */
const WATER_COST5_KEY = '9,9';

/** 원본 시트에 비용 숫자가 인쇄된 헥스 (도로가 지나는 물 "6" 2곳 + 예외 "5" 1곳) — 이곳만 숫자 표시 */
const COST_MARKER_KEYS = new Set(['0,2', '8,13', WATER_COST5_KEY]);

// === 도로(street, $4) 헥스 — swamp 지형 재사용 (전치 좌표) ===
const STREET: [number, number][] = [
  // 좌측 세로 도로 (화면 열 0)
  [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [10, 0],
  // 상단 세로 도로 (화면 열 2)
  [1, 2], [2, 2],
  // 가로 도로 1 (Canora~Saint-Léonard 라인 — 위아래 두 줄의 헥스를 가로지름)
  [2, 1], [2, 5], [2, 7],
  [3, 2], [3, 4], [3, 6], [3, 8], [3, 10],
  // 가로 도로 2 (Berri-UQAM 라인)
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 6],
  // 우측 세로 도로 (화면 열 13)
  [5, 13], [6, 13], [7, 13], [9, 13],
];

// === 도로 라인 (원본 시트 재현 — 검정 도로 + 노란 점선 중앙선) ===
// 데이터 좌표(전치) + 화면 px 오프셋(HEX_SIZE=55 기준, flat 렌더 화면 공간).
// 세로 도로는 헥스 중심을 관통, 가로 도로는 위아래 두 줄 헥스 사이를 가로지른다 (원본과 동일).
export const MONTREAL_ROADS: { coord: { col: number; row: number }; dx?: number; dy?: number }[][] = [
  // 좌측 세로 도로 (화면 열 0): 가로 도로 1 분기점 → 맵 하단
  [{ coord: { col: 3, row: 0 }, dy: -19 }, { coord: { col: 10, row: 0 }, dy: 48 }],
  // 상단 세로 도로 (화면 열 2): 맵 상단(물 헥스) → 가로 도로 1 분기점
  [{ coord: { col: 0, row: 2 }, dy: -48 }, { coord: { col: 3, row: 2 }, dy: -19 }],
  // 가로 도로 1 (Canora~Saint-Léonard 라인)
  [{ coord: { col: 3, row: 0 }, dx: -55, dy: -19 }, { coord: { col: 3, row: 10 }, dx: 55, dy: -19 }],
  // 가로 도로 2 (Berri-UQAM 라인) — 좌측 끝 → Berri-UQAM
  [{ coord: { col: 8, row: 1 }, dx: -137.5, dy: -23 }, { coord: { col: 8, row: 7 }, dy: -23 }],
  // 우측 세로 도로 (화면 열 13): Honoré-Beaugrand 앞 세로선
  [{ coord: { col: 5, row: 13 }, dy: -48 }, { coord: { col: 9, row: 13 }, dy: 48 }],
];

// === 건설 비용 (몬트리올 룰) ===
export const MONTREAL_COSTS = {
  HILL: 3,
  STREET: 4,
  WATER: 6,
  WATER_SPECIAL: 5,
};

// === 헥스 타일 생성 ===
export function generateMontrealHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const cityKeys = new Set(MONTREAL_CITIES.map((c) => `${c.coord.col},${c.coord.row}`));
  const offKeys = new Set(OFFMAP.map(([c, r]) => `${c},${r}`));
  const hillKeys = new Set(HILL.map(([c, r]) => `${c},${r}`));
  const waterKeys = new Set(WATER.map(([c, r]) => `${c},${r}`));
  const streetKeys = new Set(STREET.map(([c, r]) => `${c},${r}`));

  for (let row = 0; row < MONTREAL_MAP.rows; row++) {
    for (let col = MONTREAL_MAP.startCol; col < MONTREAL_MAP.cols; col++) {
      const key = `${col},${row}`;
      if (cityKeys.has(key)) continue; // 도시 헥스는 지형 없음
      if (offKeys.has(key)) { tiles.push({ coord: { col, row }, terrain: 'lake' }); continue; }

      let terrain: TerrainType = 'plain';
      let fixedCost: number | undefined;
      if (hillKeys.has(key)) { terrain = 'mountain'; fixedCost = MONTREAL_COSTS.HILL; }
      else if (waterKeys.has(key)) {
        // 바다(sea) — 헥스 전체 물색 채움 (원본 시트의 꽉 찬 파란 물 헥스). 강(river) 곡선 아님.
        terrain = 'sea';
        fixedCost = key === WATER_COST5_KEY ? MONTREAL_COSTS.WATER_SPECIAL : MONTREAL_COSTS.WATER;
      } else if (streetKeys.has(key)) { terrain = 'swamp'; fixedCost = MONTREAL_COSTS.STREET; }

      const tile: HexTile = { coord: { col, row }, terrain };
      if (fixedCost !== undefined) tile.fixedCost = fixedCost;
      if (COST_MARKER_KEYS.has(key)) tile.showCostMarker = true; // 원본 표기 재현
      // $5 헥스는 원본 시트처럼 서쪽 초록 쐐기 + 바다 사선 분할로 그린다 (시각 전용)
      if (key === WATER_COST5_KEY) tile.landWedgeWest = true;
      tiles.push(tile);
    }
  }
  return tiles;
}

// === Parc Mont-Royal 밀봉 경계 변 (관통 건설 금지 — 클러스터의 모든 외곽 변) ===
function generateParcBlockedEdges(): { a: { col: number; row: number }; b: { col: number; row: number } }[] {
  const parcKeys = new Set(MONTREAL_PARC_HEXES.map(([c, r]) => `${c},${r}`));
  const edges: { a: { col: number; row: number }; b: { col: number; row: number } }[] = [];
  // pointy-top odd-r 이웃 오프셋 (docs/hex-geometry.md)
  const oddRow: [number, number][] = [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  const evenRow: [number, number][] = [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  for (const [col, row] of MONTREAL_PARC_HEXES) {
    const offsets = row % 2 === 1 ? oddRow : evenRow;
    for (const [dc, dr] of offsets) {
      const n = { col: col + dc, row: row + dr };
      if (parcKeys.has(`${n.col},${n.row}`)) continue; // 클러스터 내부 변은 열어둠 (원본 시트와 동일 렌더)
      edges.push({ a: { col, row }, b: n });
    }
  }
  return edges;
}

// === 초기 보드 상태 ===
export function createMontrealBoardState(): BoardState {
  return {
    cities: MONTREAL_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: MONTREAL_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateMontrealHexTiles(),
    blockedEdges: generateParcBlockedEdges(),
  };
}

// === 색상 상수 (공식 맵 톤) ===
export const MONTREAL_COLORS = {
  terrain: {
    plain: '#8FBF7F',      // 잔디 초록
    lake: '#F0ECDE',       // 맵 밖 (크림)
    sea: '#3E7CA7',        // 물 파랑 (헥스 전체 채움)
    mountain: '#96692F',   // 언덕 갈색
    swamp: '#8FBF7F',      // 도로(street) 헥스 — 원본처럼 평지와 동일 초록 (도로 라인이 구분 표시)
  },
  background: '#F0ECDE',
  border: '#33301F',
};
