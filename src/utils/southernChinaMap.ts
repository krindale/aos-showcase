// Southern China 맵 데이터
// Age of Steam Southern China (Vince Alvarez 2020 / James Mathias 아트 2021). 4~5인 지원(디폴트 4인 8턴 / 5인 7턴).
//
// 공식 맵 시트(maps/southern-china.pdf)를 200dpi 렌더 후 색상 블롭 검출(도시 상/하 반쪽 쌍의
// 중점) + 격자 피팅(CX=283.5, RY=241.7, X0=132.5, Y0=235)으로 추출했다.
//   원본은 pointy-top(꼭짓점이 위/아래) 헥스 — Western US처럼 엔진 네이티브 배향이라 전치 없이
//   그대로 저장한다(odd-r: 홀수 행이 우측 반칸). 유효 좌표: col 0~14, row 0~12.
//   강 통과 면(riverEdges)은 각 면 중점의 강색 픽셀 밀도로 자동 산출 후 인접 면 매칭으로 검증.
//
// 특수 개념(룰북 Southern China — 적용은 SouthernChinaMapProfile + store 훅):
//  - 소유 디스크 4개 제한 + 국유화 트랙(수입0·VP0·누구나 사용, 보상 = 지지 토큰 1 + $1/구간)
//  - 지지 토큰(tokens of support): 미사용 1개 = 종료 시 3 VP. 반납 → 건설 4개 or 기관차 임시 +1
//  - Engineer·Locomotive 미사용, 신규 행동 Gain Support(토큰 1개 획득)
//  - Hong Kong: 모든 색 수용·국유화 트랙 경유 배달 금지·마지막 2턴 수령 불가
//  - 인터어반(Guangzhou↔Shenzhen)·페리(Guangzhou↔HK, (6,9)↔HK): $8, 플레이어당 턴 1개,
//    건설 1회 카운트 + 1 VP
//  - 추가비용 헥스 $4/$5(원 숫자): 복합 타일 전에 단순 타일 선행 필수
//
// 도시 10, 마을 11.

import {
  City,
  Town,
  HexTile,
  BoardState,
  GoodsColumnMapping,
  GoodsColumnId,
  TerrainType,
} from '@/types/game';

// === 맵 메타 정보 (pointy-top 네이티브, 전치 없음) ===
export const SOUTHERN_CHINA_MAP = {
  id: 'southern-china',
  name: 'Southern China',
  nameKo: '남부 중국',
  description:
    '홍콩과 주강 삼각주를 둘러싼 4~5인 맵. 소유 디스크 4개 제한과 국유화 트랙, ' +
    '지지 토큰, 모든 색을 받는 홍콩(마지막 2턴 폐쇄)이 특징.',
  players: { min: 4, max: 5 },
  supportedPlayers: [4, 5], // [0]=디폴트 인원 (GamePageClient/OnlineLobby 초기 선택)
  difficulty: 5,
  cols: 15, // 유효 col: 0 ~ 14
  rows: 13, // 유효 row: 0 ~ 12
  startCol: 0,
  maxTurns: 8, // 디폴트(4인) 기준 — 실제 턴 수는 turnsByPlayers[인원]
  turnsByPlayers: { 3: 10, 4: 8, 5: 7 }, // 룰북 표준 턴 트랙
};

// === 도시 10 (좌표 / 색 / 주사위 번호는 SOUTHERN_CHINA_COLUMN_MAPPING) ===
// Hong Kong: 모든 색 수용(acceptsAllColors) — cityAcceptsCube 한 곳에서 판정, 렌더는 회색.
export const SOUTHERN_CHINA_CITIES: City[] = [
  { id: 'chongqing', name: 'Chongqing 重庆', coord: { col: 1,  row: 0 },  color: 'blue',   cubes: [] },
  { id: 'ningbo',    name: 'Ningbo 宁波',    coord: { col: 14, row: 0 },  color: 'purple', cubes: [] },
  { id: 'changsha',  name: 'Changsha 长沙',  coord: { col: 7,  row: 1 },  color: 'red',    cubes: [] },
  { id: 'guiyang',   name: 'Guiyang 贵阳',   coord: { col: 1,  row: 3 },  color: 'purple', cubes: [] },
  { id: 'xiamen',    name: 'Xiamen 厦门',    coord: { col: 11, row: 6 },  color: 'red',    cubes: [] },
  { id: 'nanning',   name: 'Nanning 南宁',   coord: { col: 3,  row: 8 },  color: 'yellow', cubes: [] },
  { id: 'guangzhou', name: 'Guangzhou 广州', coord: { col: 7,  row: 8 },  color: 'blue',   cubes: [] },
  { id: 'shenzhen',  name: 'Shenzhen 深圳',  coord: { col: 8,  row: 8 },  color: 'yellow', cubes: [] },
  { id: 'hongkong',  name: 'Hong Kong 香港', coord: { col: 8,  row: 9 },  color: 'black',  cubes: [], acceptsAllColors: true },
  { id: 'haikou',    name: 'Haikou 海口',    coord: { col: 4,  row: 11 }, color: 'red',    cubes: [] },
];

// === 마을 11 (좌표) ===
export const SOUTHERN_CHINA_TOWNS: Town[] = [
  { id: 'ZJJ', coord: { col: 5,  row: 0 },  newCityColor: null, cubes: [] }, // Zhangjiajie
  { id: 'HGS', coord: { col: 11, row: 0 },  newCityColor: null, cubes: [] }, // Huangshan
  { id: 'JIN', coord: { col: 12, row: 1 },  newCityColor: null, cubes: [] }, // Jinhua
  { id: 'HUA', coord: { col: 4,  row: 2 },  newCityColor: null, cubes: [] }, // Huaihua
  { id: 'NCH', coord: { col: 10, row: 2 },  newCityColor: null, cubes: [] }, // Nanchang
  { id: 'HEN', coord: { col: 6,  row: 3 },  newCityColor: null, cubes: [] }, // Hengyang
  { id: 'GAN', coord: { col: 9,  row: 4 },  newCityColor: null, cubes: [] }, // Ganzhou
  { id: 'FUZ', coord: { col: 12, row: 4 },  newCityColor: null, cubes: [] }, // Fuzhou
  { id: 'GUI', coord: { col: 4,  row: 5 },  newCityColor: null, cubes: [] }, // Guilin
  { id: 'QXN', coord: { col: 1,  row: 6 },  newCityColor: null, cubes: [] }, // Qianxinan
  { id: 'WUZ', coord: { col: 5,  row: 7 },  newCityColor: null, cubes: [] }, // Wuzhou
];

export const SOUTHERN_CHINA_TOWN_NAMES: Record<string, string> = {
  ZJJ: 'Zhangjiajie', HGS: 'Huangshan', JIN: 'Jinhua', HUA: 'Huaihua', NCH: 'Nanchang',
  HEN: 'Hengyang', GAN: 'Ganzhou', FUZ: 'Fuzhou', GUI: 'Guilin', QXN: 'Qianxinan', WUZ: 'Wuzhou',
};

// === 물품 디스플레이 열-도시 매핑 ===
// diceNumber = 도시 헥스에 인쇄된 주사위 번호(라이트/다크 쌍):
//   1: Nanning·Haikou  2: Guiyang·Guangzhou  3: Chongqing·Shenzhen  4: Ningbo·Xiamen
//   5/6: Changsha·Hong Kong — 두 도시는 주사위 5와 6 모두에 성장(diceNumbers 확장 필드)
export const SOUTHERN_CHINA_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'nanning',   cityId: 'nanning',   isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'haikou',    cityId: 'haikou',    isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'guiyang',   cityId: 'guiyang',   isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'guangzhou', cityId: 'guangzhou', isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'chongqing', cityId: 'chongqing', isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'shenzhen',  cityId: 'shenzhen',  isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'ningbo',    cityId: 'ningbo',    isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'xiamen',    cityId: 'xiamen',    isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'changsha',  cityId: 'changsha',  isNewCity: false, rowCount: 3, diceNumber: 5, diceNumbers: [5, 6], displayLabel: '5/6' },
  { columnId: 'hongkong',  cityId: 'hongkong',  isNewCity: false, rowCount: 3, diceNumber: 6, diceNumbers: [5, 6], displayLabel: '5/6' },
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2, diceNumber: 2 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

// === 지형 좌표 (추출 결과, [col, row]) ===
const MOUNTAIN: [number, number][] = [
  [2,0],[3,0],[6,0],[12,0],
  [1,1],[2,1],[4,1],[5,1],[10,1],[11,1],
  [4,3],
  [5,4],[7,4],[8,4],
  [0,5],[1,5],[5,5],[6,5],
  [2,6],
];

// 강 타일 + 각 타일이 지나는 두 면 [진입, 진출] (면 번호: 0=E, 1=SE, 2=SW, 3=W, 4=NW, 5=NE).
// 수계: 양쯔 상류(맵 상단), 우강(Guiyang→Wuzhou→주강 하구), 간강·민강(NE→남해안).
const RIVER: { coord: [number, number]; edges: [number, number] }[] = [
  // 양쯔 상류 — Zhangjiajie 남쪽 지류가 북동진해 상단 본류와 합류
  { coord: [5, 2],  edges: [2, 0] },
  { coord: [6, 2],  edges: [3, 5] },
  { coord: [6, 1],  edges: [2, 5] },
  { coord: [7, 0],  edges: [2, 0] },
  { coord: [8, 0],  edges: [3, 5] }, // 상단 보드 경계를 따라 흐름
  { coord: [9, 0],  edges: [4, 1] }, // 상단 경계를 따라 오다 남쪽 지류로 분기
  { coord: [9, 1],  edges: [4, 2] }, // 상단 본류에서 남하 (Nanchang 서쪽)
  { coord: [9, 2],  edges: [5, 1] },
  { coord: [9, 3],  edges: [4, 0] },
  { coord: [10, 3], edges: [3, 1] },
  { coord: [11, 4], edges: [4, 1] },
  { coord: [11, 5], edges: [4, 1] }, // 하구 (Xiamen 북쪽 해안)
  // 우강 — Guiyang 동쪽 → S자 사행 → Guilin 동쪽 → Wuzhou → 주강 하구
  { coord: [2, 2],  edges: [5, 1] },
  { coord: [2, 3],  edges: [4, 2] },
  { coord: [2, 4],  edges: [5, 0] },
  { coord: [3, 4],  edges: [3, 5] },
  { coord: [3, 3],  edges: [2, 1] }, // S자 사행 구간 (북쪽으로 되감김)
  { coord: [4, 4],  edges: [4, 2] },
  { coord: [3, 5],  edges: [5, 1] },
  { coord: [4, 6],  edges: [4, 0] },
  { coord: [5, 6],  edges: [3, 1] }, // → Wuzhou(마을 헥스, 타일 없음)
  { coord: [6, 7],  edges: [3, 0] },
  { coord: [7, 7],  edges: [3, 1] }, // $5 추가비용 헥스 — 주강 삼각주 진입
  { coord: [6, 8],  edges: [4, 1] },
  { coord: [6, 9],  edges: [4, 0] }, // 하구 (페리 서안)
  // 간강 — Ganzhou 북동쪽 발원 → 남하 → 남해안 하구
  { coord: [10, 4], edges: [3, 2] }, // Ganzhou 곁 발원
  { coord: [9, 5],  edges: [5, 2] },
  { coord: [9, 6],  edges: [5, 1] },
  { coord: [9, 7],  edges: [4, 2] },
  { coord: [9, 8],  edges: [5, 1] }, // $5 추가비용 헥스 — Shenzhen 동쪽 하구
  { coord: [10, 6], edges: [4, 1] }, // 동쪽 분류
  { coord: [10, 7], edges: [4, 2] },
];

// === 추가비용 헥스 (원 숫자 — 비용이 지형 기본값을 대체, 복합 타일 전 단순 타일 선행 필수) ===
// showCostMarker: 화면에 비용 원 표시 (Montréal 마커 렌더 재사용)
const EXTRA_COST: { coord: [number, number]; cost: number }[] = [
  { coord: [7, 7],  cost: 5 },
  { coord: [9, 8],  cost: 5 },
  { coord: [4, 10], cost: 4 }, // 하이난 해협 (본토↔Haikou 유일 통로)
];

// 원본 시트 재현: 해협 헥스 (4,10)의 윗변(NW·NE)을 두꺼운 흰 실선으로 강조 (시각 전용)
const WHITE_EDGES: { coord: [number, number]; edges: number[] }[] = [
  { coord: [4, 10], edges: [4, 5] },
];

// 비-lake(타일을 생성할) 셀 전체 — 도시 셀 제외. 이 집합에 없는 셀은 모두 lake(바다, hideLakeHexes).
// 마을 셀 포함(평지 배경 + 마을 원). 좌측 경계는 짝수 행 col0 = 바다인 지그재그 해안.
const LAND: [number, number][] = [
  [2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],
  [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],
  [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],[13,2],
  [0,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],
  [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],
  [0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],
  [1,6],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],
  [0,7],[1,7],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
  [1,8],[2,8],[4,8],[5,8],[6,8],[9,8],
  [0,9],[1,9],[2,9],[3,9],[4,9],[5,9],[6,9],
  [1,10],[4,10],
  [0,11],[3,11],
  [3,12],[4,12],
];

// === 인터어반·페리 (룰북: $8, 플레이어당 턴 1개, 건설 1회 카운트 + 1 VP) ===
// 인터어반·GZ↔HK 페리는 도시↔도시 직결 링크(구매식 — Germany Essen↔Düsseldorf 기계 재사용).
// (6,9)↔HK 페리는 도시가 아닌 육지 헥스가 서안이라 "구매식 wrap 인접"(Moon wrapEdges 기계):
// 구매 시 (6,9) E면 ↔ Hong Kong W면이 인접이 되고, (6,9)에 E면으로 나가는 트랙을 지으면 연결된다.
export const SOUTHERN_CHINA_INTERURBAN = {
  cityA: 'guangzhou', cityB: 'shenzhen', cost: 8,
};
// Shenzhen↔Hong Kong — 인접 도시 쌍 (사이 헥스 없음) → 인터어반처럼 공유 변 위 "8" 마커
export const SOUTHERN_CHINA_SZ_HK_LINK = {
  cityA: 'shenzhen', cityB: 'hongkong', cost: 8,
};
export const SOUTHERN_CHINA_CITY_FERRY = {
  cityA: 'guangzhou', cityB: 'hongkong', cost: 8,
  // 시각: GZ의 SE(5시, 변1) 면 ↔ HK의 W(9시, 변3) 면을 직선 점선으로 (중심 직선은 SZ 관통)
  faces: [1, 3] as [number, number],
};
// (구) 서안 (6,9)↔HK 변 페리는 사용자 확인으로 제거 — 홍콩 연결은 SZ↔HK·GZ↔HK 두 링크가 정본.
// 구매식 변 인접 기계(board.ferryEdges + buildFerryEdge + getNeighborHex)는 무해하게 남아 있다.

// === 헥스 타일 생성 ===
export function generateSouthernChinaHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const key = (c: number, r: number) => `${c},${r}`;
  const cityKeys = new Set(SOUTHERN_CHINA_CITIES.map((c) => key(c.coord.col, c.coord.row)));
  const landKeys = new Set(LAND.map(([c, r]) => key(c, r)));
  const mtnKeys = new Set(MOUNTAIN.map(([c, r]) => key(c, r)));
  const rivEdges = new Map(RIVER.map((r) => [key(r.coord[0], r.coord[1]), r.edges] as const));
  const extraCost = new Map(EXTRA_COST.map((e) => [key(e.coord[0], e.coord[1]), e.cost] as const));

  for (let row = 0; row < SOUTHERN_CHINA_MAP.rows; row++) {
    for (let col = SOUTHERN_CHINA_MAP.startCol; col < SOUTHERN_CHINA_MAP.cols; col++) {
      const k = key(col, row);
      if (cityKeys.has(k)) continue; // 도시 헥스는 지형 없음
      let terrain: TerrainType = 'lake';
      let riverEdges: [number, number] | undefined;
      if (landKeys.has(k)) {
        if (mtnKeys.has(k)) terrain = 'mountain';
        else if (rivEdges.has(k)) { terrain = 'river'; riverEdges = rivEdges.get(k); }
        else terrain = 'plain';
      }
      const tile: HexTile = { coord: { col, row }, terrain };
      const cost = extraCost.get(k);
      if (cost !== undefined) {
        tile.fixedCost = cost;        // 지형 기본비용 대체 (모든 비용 헬퍼가 fixedCost 우선)
        tile.showCostMarker = true;   // 원 숫자 표시 (Montréal 마커 렌더 재사용)
      }
      const white = WHITE_EDGES.find((w) => w.coord[0] === col && w.coord[1] === row);
      if (white) tile.whiteEdges = white.edges;
      if (riverEdges) tile.riverEdges = riverEdges;
      tiles.push(tile);
    }
  }
  return tiles;
}

// === 초기 보드 상태 ===
export function createSouthernChinaBoardState(): BoardState {
  return {
    cities: SOUTHERN_CHINA_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: SOUTHERN_CHINA_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateSouthernChinaHexTiles(),
    // 인터어반(GZ↔SZ)·SZ↔HK·페리(GZ↔HK) — $8 구매식 직결 링크 (buildDirectLink + interurbanFerryRule)
    directLinks: [
      { ...SOUTHERN_CHINA_INTERURBAN, owner: null },
      { ...SOUTHERN_CHINA_SZ_HK_LINK, owner: null },
      { ...SOUTHERN_CHINA_CITY_FERRY, owner: null },
    ],
  };
}

// === 색상 상수 (공식 맵 톤 — 이미지 실측) ===
export const SOUTHERN_CHINA_COLORS = {
  terrain: {
    plain: '#89CA88',      // 녹색 평원 (실측 137,202,136)
    river: '#1A9485',      // 강 청록 (실측 26,148,133)
    mountain: '#AA7736',   // 산악 갈색 (실측 170,119,54)
    lake: '#E1F3EF',       // 바다 연민트 (hideLakeHexes로 안 그림 → 배경 노출)
  } as Record<TerrainType, string>,
  background: '#E1F3EF',   // 남중국해
  border: '#1D7A6E',       // 해안 짙은 청록
};
