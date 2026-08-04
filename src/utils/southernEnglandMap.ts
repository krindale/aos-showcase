// Southern England 맵 데이터
// Age of Steam Expansion Vol. IV "England" (Martin Wallace ©2003, 시트 아트 James Mathias ©2018).
// 사용자 결정으로 5~6인 지원(디폴트 5인 7턴 / 6인 6턴)으로 제공한다.
//
// 공식 맵 시트(maps/southern-england-v2.pdf)를 200DPI 렌더 후 색상 기반 자동 검출로 추출했다
// (도시 색 덩어리 중심 최소제곱 격자 fit → 대각 4점 샘플 분류 → 오버레이 시각 검증).
// 원본은 Rust Belt와 동일한 flat-top 헥스 보드 — 게임 좌표는 전치(transpose)해 저장하고
// (인접 관계 동형이라 게임 로직 무변경), 렌더링만 orientation:'flat'으로 다시 전치한다.
//   변환: 데이터(col, row) = (측정 화면세로, 측정 화면가로) = (측정.row, 측정.col)
//   측정 그리드 18열×11행(홀수 열 아래로 반칸 = 전치 후 엔진 odd-r과 동형) → 데이터 11열×18행
//
// 도시 12개 = 물품 디스플레이 라이트 1~6 + 다크 1~6 (red4/yellow4/purple3/blue1 — 검정 없음),
// 마을 15개, 산(웨일스·데번 구릉) 24, 강 10(세번·트렌트·템스), 바다/외곽 29.
//
// 특수룰 (Vol IV England + v2 시트 SETUP 인쇄문):
//  - North West 큐브 3개, 그 외 도시 2개
//  - 신규 도시 B(파랑)는 게임에서 제거 (London이 유일한 파랑 목적지)
//  - 셋업·물품 성장 중 파란 큐브가 London에 놓이려 하면 주사위 1-4 → North West, 5-6 → North East
//  - 승리 동점: 현금 → 트랙 타일 수 → 주사위 (사이트는 공동 승리 표시 — 안내문으로 제공)

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
export const SOUTHERN_ENGLAND_MAP = {
  id: 'southern-england',
  name: 'Southern England',
  nameKo: '영국 남부',
  description:
    '웨일스 산악과 세번·트렌트·템스 강을 낀 잉글랜드 남부 맵. 유일한 파랑 도시 London으로 향하는 장거리 배달이 핵심인 5~6인전.',
  players: { min: 5, max: 6 },
  supportedPlayers: [5, 6], // [0]=디폴트 인원 (GamePageClient/OnlineLobby 초기 선택)
  difficulty: 2,
  cols: 11, // 유효 col: 0 ~ 10 (0-base)
  rows: 18, // 유효 row: 0 ~ 17
  startCol: 0,
  maxTurns: 7, // 디폴트(5인) 기준 — 실제 턴 수는 turnsByPlayers[인원]
  turnsByPlayers: { 3: 10, 4: 8, 5: 7, 6: 6 }, // 룰북 표준 턴 트랙
};

// === 도시 12개 (전치 좌표 / 색 / 물품성장 주사위 번호) ===
// 라이트(흰 박스): Holyhead1·Cardiff2·Bristol3·Southampton4·London5·Dover6
// 다크(검은 박스): Exeter1·NorthWest2·Birmingham3·Nottingham4·NorthEast5·Norwich6
export const SOUTHERN_ENGLAND_CITIES: City[] = [
  { id: 'holyhead',    name: 'Holyhead',    coord: { col: 1,  row: 0 },  color: 'red',    cubes: [] },
  { id: 'northwest',   name: 'North West',  coord: { col: 0,  row: 5 },  color: 'yellow', cubes: [] },
  { id: 'northeast',   name: 'North East',  coord: { col: 0,  row: 13 }, color: 'red',    cubes: [] },
  { id: 'norwich',     name: 'Norwich',     coord: { col: 1,  row: 17 }, color: 'yellow', cubes: [] },
  { id: 'nottingham',  name: 'Nottingham',  coord: { col: 2,  row: 10 }, color: 'red',    cubes: [] },
  { id: 'birmingham',  name: 'Birmingham',  coord: { col: 3,  row: 7 },  color: 'red',    cubes: [] },
  { id: 'cardiff',     name: 'Cardiff',     coord: { col: 7,  row: 2 },  color: 'purple', cubes: [] },
  { id: 'bristol',     name: 'Bristol',     coord: { col: 7,  row: 5 },  color: 'yellow', cubes: [] },
  { id: 'london',      name: 'London',      coord: { col: 7,  row: 14 }, color: 'blue',   cubes: [] },
  { id: 'dover',       name: 'Dover',       coord: { col: 8,  row: 17 }, color: 'purple', cubes: [] },
  { id: 'southampton', name: 'Southampton', coord: { col: 9,  row: 9 },  color: 'yellow', cubes: [] },
  { id: 'exeter',      name: 'Exeter',      coord: { col: 10, row: 1 },  color: 'purple', cubes: [] },
];

// === 마을 15개 (전치 좌표) ===
export const SOUTHERN_ENGLAND_TOWNS: Town[] = [
  { id: 'CH', coord: { col: 0,  row: 3 },  newCityColor: null, cubes: [] }, // Chester
  { id: 'SH', coord: { col: 2,  row: 5 },  newCityColor: null, cubes: [] }, // Shrewsbury
  { id: 'LE', coord: { col: 3,  row: 11 }, newCityColor: null, cubes: [] }, // Leicester
  { id: 'WP', coord: { col: 4,  row: 2 },  newCityColor: null, cubes: [] }, // Welshpool
  { id: 'CV', coord: { col: 4,  row: 9 },  newCityColor: null, cubes: [] }, // Coventry
  { id: 'CB', coord: { col: 4,  row: 14 }, newCityColor: null, cubes: [] }, // Cambridge
  { id: 'NH', coord: { col: 5,  row: 12 }, newCityColor: null, cubes: [] }, // Northampton
  { id: 'IP', coord: { col: 5,  row: 16 }, newCityColor: null, cubes: [] }, // Ipswich
  { id: 'SW', coord: { col: 6,  row: 0 },  newCityColor: null, cubes: [] }, // Swansea
  { id: 'OX', coord: { col: 6,  row: 9 },  newCityColor: null, cubes: [] }, // Oxford
  { id: 'SD', coord: { col: 7,  row: 7 },  newCityColor: null, cubes: [] }, // Swindon
  { id: 'RD', coord: { col: 7,  row: 11 }, newCityColor: null, cubes: [] }, // Reading
  { id: 'TA', coord: { col: 8,  row: 3 },  newCityColor: null, cubes: [] }, // Taunton
  { id: 'BM', coord: { col: 10, row: 7 },  newCityColor: null, cubes: [] }, // Bournemouth
  { id: 'BR', coord: { col: 10, row: 14 }, newCityColor: null, cubes: [] }, // Brighton
];

/** 마을 이름 (UI 표시용) — 원본 시트의 "CONVENTRY" 오기는 Coventry로 교정 */
export const SOUTHERN_ENGLAND_TOWN_NAMES: Record<string, string> = {
  CH: 'Chester', SH: 'Shrewsbury', LE: 'Leicester', WP: 'Welshpool',
  CV: 'Coventry', CB: 'Cambridge', NH: 'Northampton', IP: 'Ipswich',
  SW: 'Swansea', OX: 'Oxford', SD: 'Swindon', RD: 'Reading',
  TA: 'Taunton', BM: 'Bournemouth', BR: 'Brighton',
};

// === 물품 디스플레이 열-도시 매핑 ===
// 12개 도시 = 라이트/다크가 주사위 번호 1~6을 하나씩 공유 (열당 3칸 = 36)
// + 신규 도시 A·C~H (열당 2칸 = 14) = 50칸. B(파랑)는 게임에서 제거 — 열 자체를 두지 않는다
// (Vol IV: "Do not place any Goods cubes on the New City B spaces" — 배치 불가 타일의 열에
//  큐브를 깔면 영구 데드 큐브가 되므로 열 제거가 룰 의도와 일치).
export const SOUTHERN_ENGLAND_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'holyhead',    cityId: 'holyhead',    isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'exeter',      cityId: 'exeter',      isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'cardiff',     cityId: 'cardiff',     isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'northwest',   cityId: 'northwest',   isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'bristol',     cityId: 'bristol',     isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'birmingham',  cityId: 'birmingham',  isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'southampton', cityId: 'southampton', isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'nottingham',  cityId: 'nottingham',  isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'london',      cityId: 'london',      isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'northeast',   cityId: 'northeast',   isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'dover',       cityId: 'dover',       isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'norwich',     cityId: 'norwich',     isNewCity: false, rowCount: 3, diceNumber: 6 },
  // 신규 도시 열 (B 제외 — 게임에서 제거). 주사위 번호는 표준 시트 관례(A1 C3 D4 E5 F6 G1 H2).
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

// 물품 큐브는 룰북 표준(DEFAULT_CUBE_COUNTS: red/blue/yellow/purple 20 + black 16)을 mapRegistry에서
// 주입한다. 검정 화물은 검정 신규 도시(E~H 도시화)로 배달된다.

// === 바다/외곽 타일 (전치 좌표) — orientation:flat + hideLakeHexes로 빈 공간 처리 ===
// col 0의 짝수 row 9개는 "존재하지 않는 반칸"(화면 최상단 짝수 열은 홀수 열보다 반칸 위 = 보드 밖).
const LAKE_TILES: { col: number; row: number }[] = [
  // 화면 최상단 짝수 열 반칸 (보드 밖)
  { col: 0, row: 0 }, { col: 0, row: 2 }, { col: 0, row: 4 }, { col: 0, row: 6 },
  { col: 0, row: 8 }, { col: 0, row: 10 }, { col: 0, row: 12 }, { col: 0, row: 14 },
  { col: 0, row: 16 },
  // 북동 모서리 (North East 동쪽 바다)
  { col: 0, row: 17 },
  // 동해안 The Wash·에식스 만입부
  { col: 5, row: 17 },
  { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 6, row: 17 },
  { col: 7, row: 16 },
  // 브리스틀 해협 (웨일스—데번 사이 바다)
  { col: 7, row: 0 }, { col: 7, row: 1 }, { col: 7, row: 3 }, { col: 7, row: 4 },
  { col: 8, row: 0 }, { col: 8, row: 2 },
  // 남동 해안 (Dover 남쪽)
  { col: 9, row: 17 },
  // 남해안 (영국 해협)
  { col: 10, row: 3 }, { col: 10, row: 9 }, { col: 10, row: 11 }, { col: 10, row: 13 },
  { col: 10, row: 15 }, { col: 10, row: 16 }, { col: 10, row: 17 },
];

// === 산악 지대 24헥스 (전치 좌표) — 웨일스 산악 + 데번 구릉 ===
const MOUNTAIN_TILES: { col: number; row: number }[] = [
  // 웨일스 (Holyhead~Cardiff 사이 대산괴)
  { col: 0, row: 1 }, { col: 0, row: 7 }, { col: 0, row: 9 },
  { col: 1, row: 1 }, { col: 1, row: 3 }, { col: 1, row: 8 },
  { col: 2, row: 0 }, { col: 2, row: 1 }, { col: 2, row: 2 }, { col: 2, row: 3 },
  { col: 3, row: 0 }, { col: 3, row: 1 }, { col: 3, row: 2 }, { col: 3, row: 3 },
  { col: 4, row: 0 }, { col: 4, row: 1 }, { col: 4, row: 3 },
  { col: 5, row: 0 }, { col: 5, row: 1 }, { col: 5, row: 2 }, { col: 5, row: 3 },
  { col: 6, row: 2 },
  // 데번 구릉 (Exeter 주변)
  { col: 8, row: 1 }, { col: 10, row: 0 },
];

// === 강 10헥스 (전치 좌표) — 세번·트렌트·템스 ===
// edges = 강이 지나는 두 면 [면1, 면2] (0=E,1=SE,2=SW,3=W,4=NW,5=NE — 데이터 공간).
// 미지정 시 인접 강 타일끼리 자동 연결 — 끝점이 도시/마을/바다를 향해야 하는 3곳만 명시.
const RIVER_TILES: { col: number; row: number; edges?: [number, number] }[] = [
  // 트렌트: North East(0,13)에서 남서로 → Nottingham(2,10)
  { col: 1, row: 12 }, // 자동: NE시티 쪽 변 → (1,11)
  { col: 1, row: 11 }, // 자동: (1,12) → Nottingham 쪽 변
  // 세번: Shrewsbury(2,5)에서 남하 → 브리스틀 해협
  { col: 3, row: 5 }, // 자동: Shrewsbury 쪽 변 → (4,5)
  { col: 4, row: 5 },
  { col: 5, row: 5 },
  { col: 6, row: 5, edges: [3, 5] }, // (5,5)에서 받아 해협(7,4) 쪽으로 — 자동이면 Bristol을 관통
  // 템스: Oxford(6,9)에서 동으로 사행 → London(7,14)
  { col: 7, row: 10, edges: [4, 2] }, // Oxford 쪽 변 → (6,11) — 자동이면 Oxford 반대편으로 흐름
  { col: 6, row: 11 },
  { col: 7, row: 12 },
  { col: 7, row: 13, edges: [4, 2] }, // (7,12)에서 받아 London 쪽 변으로
];

// === 헥스 타일 (지형 정보) 생성 ===
export function generateSouthernEnglandHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const cityKeys = new Set(SOUTHERN_ENGLAND_CITIES.map((c) => `${c.coord.col},${c.coord.row}`));
  const lakeKeys = new Set(LAKE_TILES.map((t) => `${t.col},${t.row}`));
  const mtnKeys = new Set(MOUNTAIN_TILES.map((t) => `${t.col},${t.row}`));
  const rivKeys = new Set(RIVER_TILES.map((t) => `${t.col},${t.row}`));
  const rivEdges = new Map<string, [number, number]>(
    RIVER_TILES.filter((t) => t.edges).map((t) => [`${t.col},${t.row}`, t.edges!] as const)
  );

  for (let row = 0; row < SOUTHERN_ENGLAND_MAP.rows; row++) {
    for (let col = SOUTHERN_ENGLAND_MAP.startCol; col < SOUTHERN_ENGLAND_MAP.cols; col++) {
      const key = `${col},${row}`;
      if (cityKeys.has(key)) continue; // 도시 헥스는 지형 없음

      let terrain: TerrainType = 'plain';
      if (lakeKeys.has(key)) terrain = 'lake';
      else if (mtnKeys.has(key)) terrain = 'mountain';
      else if (rivKeys.has(key)) terrain = 'river';

      const tile: HexTile = { coord: { col, row }, terrain };
      if (terrain === 'river' && rivEdges.has(key)) tile.riverEdges = rivEdges.get(key);
      tiles.push(tile);
    }
  }

  return tiles;
}

// === 초기 보드 상태 생성 (도시 큐브는 createInitialGameState에서 배치) ===
export function createSouthernEnglandBoardState(): BoardState {
  return {
    cities: SOUTHERN_ENGLAND_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: SOUTHERN_ENGLAND_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateSouthernEnglandHexTiles(),
  };
}

// === 색상 상수 (공식 맵 시트 실측 톤) ===
export const SOUTHERN_ENGLAND_COLORS = {
  terrain: {
    plain: '#83d076',     // 연두 평원 (시트 실측 (131,208,118))
    lake: '#f4f4e8',      // 바다/외곽 (빈 공간 톤)
    river: '#4a90c8',     // 강 파랑
    mountain: '#936123',  // 웨일스 산악 갈색 (실측 (147,97,35))
  },
  background: '#f4f4e8',
  border: '#413928',      // 보드 외곽 짙은 갈색 (실측 (65,57,40))
};
