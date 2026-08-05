// Scotland 맵 데이터
// Age of Steam Expansion "Scotland" (Kevin Duffy ©2006, 시트 아트 James Mathias ©2018).
// 정본: rules/AOSD Exp Vol II Rules v2.pdf "Scotland" (p.4) + maps/scotland-v2.pdf 인쇄 셋업문.
// 2인 전용 8턴 (룰북: "The game ends after 8 turns (the 4-player end)").
//
// 공식 맵 시트(maps/scotland-v2.pdf)를 300DPI 렌더 후 격자 오버레이 수동 판독으로 추출했다
// (flat-top R≈240px·열 간격 360px 실측 → (col,row) 라벨 오버레이 → 6분할 정밀 판독).
// 원본은 Rust Belt와 동일한 flat-top 헥스 보드 — 게임 좌표는 전치(transpose)해 저장하고
// (인접 관계 동형이라 게임 로직 무변경), 렌더링만 orientation:'flat'으로 다시 전치한다.
//   변환: 데이터(col, row) = (측정 화면세로, 측정 화면가로) = (측정.row, 측정.col)
//   측정 그리드 8열×9행(홀수 열 아래로 반칸 = 전치 후 엔진 odd-r과 동형) → 데이터 9열×8행
//
// 도시 6개 = 물품 디스플레이 1~6 (red2/yellow2/blue2 — 보라·검정 없음), 마을 8개
// (Stornoway·Belfast는 페리로만 닿는 섬), 산 9 (그중 산+강 $5가 3곳), 강 평지 10, 바다/외곽 23.
//
// 특수룰 (Vol II Scotland + v2 시트 인쇄문): ScotlandMapProfile 참조.
//  - 페리 항로 2개(Ayr↔Belfast·Ullapool↔Stornoway): 양끝 마을이 모두 도시화된 후에만 $6 구매
//  - Ayr↔Glasgow 특수 링크 $2: 마을 상태에선 표준 마을 가닥($1+$1=$2)이 그 링크 자체이고,
//    Ayr 도시화 시 가닥이 직결 링크로 승계된다 (원본 룰: "링크는 도시화돼도 제거되지 않는다")
//  - 산+강 헥스 $5, 경매 패자 절반(올림), Turn Order = 다음 턴 경매 생략·무조건 선공
//  - 물품 성장: 주사위 4개(라이트: 도시 1~6·신도시 A~D) + 4개(다크: 신도시 E~H)

import {
  City,
  Town,
  HexTile,
  BoardState,
  DirectLink,
  GoodsColumnMapping,
  GoodsColumnId,
  TerrainType,
} from '@/types/game';

// === 맵 메타 정보 ===
export const SCOTLAND_MAP = {
  id: 'scotland',
  name: 'Scotland',
  nameKo: '스코틀랜드',
  description:
    '하이랜드 산악과 협만이 갈라놓은 스코틀랜드 맵. 마을 도시화로 페리 항로를 열어 섬을 잇는 2인 전용전.',
  players: { min: 2, max: 2 },
  supportedPlayers: [2], // 2인 전용 (룰북: "recommended for 2 players")
  difficulty: 2,
  cols: 9, // 유효 col: 0 ~ 8 (0-base)
  rows: 8, // 유효 row: 0 ~ 7
  startCol: 0,
  maxTurns: 8, // 룰북: 8턴 고정 ("the 4-player end")
};

// === 도시 6개 (전치 좌표 / 색 / 물품성장 주사위 번호는 columnMapping) ===
// Edinburgh1·Glasgow2(빨강) / Oban3·Wick4(노랑) / Aberdeen5·Stranraer6(파랑)
export const SCOTLAND_CITIES: City[] = [
  { id: 'edinburgh', name: 'Edinburgh', coord: { col: 6, row: 5 }, color: 'red',    cubes: [] },
  { id: 'glasgow',   name: 'Glasgow',   coord: { col: 6, row: 2 }, color: 'red',    cubes: [] },
  { id: 'oban',      name: 'Oban',      coord: { col: 3, row: 1 }, color: 'yellow', cubes: [] },
  { id: 'wick',      name: 'Wick',      coord: { col: 0, row: 5 }, color: 'yellow', cubes: [] },
  { id: 'aberdeen',  name: 'Aberdeen',  coord: { col: 2, row: 7 }, color: 'blue',   cubes: [] },
  { id: 'stranraer', name: 'Stranraer', coord: { col: 8, row: 2 }, color: 'blue',   cubes: [] },
];

// === 마을 8개 (전치 좌표) — Stornoway·Belfast는 페리로만 닿는 섬 마을 ===
export const SCOTLAND_TOWNS: Town[] = [
  { id: 'ST', coord: { col: 1, row: 0 }, newCityColor: null, cubes: [] }, // Stornoway (섬)
  { id: 'UL', coord: { col: 1, row: 2 }, newCityColor: null, cubes: [] }, // Ullapool
  { id: 'IN', coord: { col: 2, row: 4 }, newCityColor: null, cubes: [] }, // Inverness
  { id: 'KC', coord: { col: 5, row: 4 }, newCityColor: null, cubes: [] }, // Kirkcaldy
  { id: 'DD', coord: { col: 4, row: 6 }, newCityColor: null, cubes: [] }, // Dundee
  { id: 'AY', coord: { col: 6, row: 1 }, newCityColor: null, cubes: [] }, // Ayr (Glasgow 인접)
  { id: 'BW', coord: { col: 7, row: 7 }, newCityColor: null, cubes: [] }, // Berwick
  { id: 'BF', coord: { col: 8, row: 0 }, newCityColor: null, cubes: [] }, // Belfast (섬)
];

/** 마을 이름 (UI 표시용) */
export const SCOTLAND_TOWN_NAMES: Record<string, string> = {
  ST: 'Stornoway', UL: 'Ullapool', IN: 'Inverness', KC: 'Kirkcaldy',
  DD: 'Dundee', AY: 'Ayr', BW: 'Berwick', BF: 'Belfast',
};

// === 물품 디스플레이 열-도시 매핑 ===
// 도시 6개(열당 3칸 = 18) + 신규 도시 A~H(열당 2칸 = 16) = 34칸.
// 성장은 주사위 4개(라이트)+4개(다크) — 다크 주사위는 E~H 열에만 적용 (ScotlandMapProfile.growthDiceSplit,
// 룰북: "Roll 4 dice for Goods Growth, once for the light and once for the dark Cities" +
// 시트: "Roll 4 dice (x2 if E,F,G, or H is built)" — 도시 6개는 전부 라이트(흰 숫자 박스)).
export const SCOTLAND_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'edinburgh', cityId: 'edinburgh', isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'glasgow',   cityId: 'glasgow',   isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'oban',      cityId: 'oban',      isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'wick',      cityId: 'wick',      isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'aberdeen',  cityId: 'aberdeen',  isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'stranraer', cityId: 'stranraer', isNewCity: false, rowCount: 3, diceNumber: 6 },
  // 신규 도시 열 — 주사위 번호는 표준 시트 관례 (A1 B2 C3 D4 E5 F6 G1 H2)
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2, diceNumber: 2 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

// 물품 큐브: 시트 셋업 "Remove 6 goods of each color" — 룰북 표준(20/20/20/20/16)에서
// 색깔별 −6 = red/blue/purple/yellow 14 + black 10 (mapRegistry goodsCubeCounts로 주입).
export const SCOTLAND_CUBE_COUNTS = {
  red: 14, blue: 14, purple: 14, yellow: 14, black: 10,
} as const;

// === 바다/외곽 타일 (전치 좌표) — orientation:flat + hideLakeHexes로 빈 공간 처리 ===
const LAKE_TILES: { col: number; row: number }[] = [
  // row 0 (화면 col 0): Stornoway(1,0)·Belfast(8,0) 섬 사이 바다
  { col: 0, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }, { col: 4, row: 0 },
  { col: 5, row: 0 }, { col: 6, row: 0 }, { col: 7, row: 0 },
  // row 1 (화면 col 1): 서해안 (민치 해협·클라이드 만)
  { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 7, row: 1 }, { col: 8, row: 1 },
  // row 2 (화면 col 2): 북서 곶 위 바다
  { col: 0, row: 2 },
  // row 3 (화면 col 3): 남서 해안 (루스 만)
  { col: 8, row: 3 },
  // row 5 (화면 col 5): 포스 만(Firth of Forth) 만입부·남해안
  { col: 5, row: 5 }, { col: 8, row: 5 },
  // row 6 (화면 col 6): 북동 해안 (Wick 동쪽 먼바다)
  { col: 0, row: 6 }, { col: 1, row: 6 }, { col: 5, row: 6 },
  // row 7 (화면 col 7): 동해안 (머리 만·타이 만)
  { col: 0, row: 7 }, { col: 1, row: 7 }, { col: 4, row: 7 }, { col: 5, row: 7 },
  { col: 8, row: 7 },
];

// === 산악 지대 (전치 좌표) — 하이랜드 6 + 남부 고지 2 + 그램피언 1 ===
const MOUNTAIN_TILES: { col: number; row: number }[] = [
  { col: 1, row: 3 }, { col: 3, row: 3 }, { col: 4, row: 2 },
  { col: 3, row: 4 }, { col: 3, row: 5 }, { col: 6, row: 3 },
  // 산+강(아래 MOUNTAIN_RIVER_TILES와 겹침 — $5)
  { col: 3, row: 2 }, { col: 2, row: 3 }, { col: 7, row: 3 },
];

// === 산+강 헥스 3곳 (룰북: "A Mountain tile with a river costs $5") ===
// terrain은 mountain, riverEdges로 강줄기 렌더, fixedCost 5 + showCostMarker(원 숫자)로 비용 안내.
// edges = 강이 지나는 두 면 (0=E,1=SE,2=SW,3=W,4=NW,5=NE — 데이터 공간).
const MOUNTAIN_RIVER_TILES: { col: number; row: number; edges: [number, number] }[] = [
  { col: 3, row: 2, edges: [2, 5] }, // 그레이트 글렌 (Inverness 쪽에서 Oban으로)
  { col: 2, row: 3, edges: [2, 5] }, // 그레이트 글렌 하류 (Oban 하구)
  { col: 7, row: 3, edges: [4, 0] }, // 루스 강 (남부 고지 → 남해안 하구)
];

// === 강 평지 10헥스 (전치 좌표) — 네스·디·테이·포스·클라이드·루스 ===
// 전부 edges 명시 (산+강 헥스와의 연결·수원/하구 방향을 자동 연결에 맡기지 않는다).
const RIVER_TILES: { col: number; row: number; edges: [number, number] }[] = [
  // 네스 강: 수원(0,3) → 머리 만 하구(1,4 — Inverness 앞)
  { col: 0, row: 3, edges: [4, 1] },
  { col: 1, row: 4, edges: [4, 0] },
  // 디 강: 동해안(3,7 — Aberdeen 남쪽)에서 내륙으로
  { col: 3, row: 7, edges: [2, 0] },
  // 테이 강: 수원(4,4) → 타이 만 하구(4,5 — Dundee 남쪽)
  { col: 4, row: 4, edges: [4, 1] },
  { col: 4, row: 5, edges: [4, 1] },
  // 포스 강: 수원(5,2) → 포스 만 하구(6,4 — Edinburgh 북쪽)
  { col: 5, row: 2, edges: [4, 1] },
  { col: 5, row: 3, edges: [4, 1] },
  { col: 6, row: 4, edges: [4, 2] },
  // 클라이드 강: Glasgow 서쪽(5,1) → 클라이드 만
  { col: 5, row: 1, edges: [2, 5] },
  // 루스 강 상류(7,2) → 산+강(7,3)으로
  { col: 7, row: 2, edges: [3, 1] },
];

// === 직결 링크 (페리 2 + Ayr↔Glasgow 특수 링크) ===
// 페리(£6)는 양끝 마을이 모두 도시화된 후에만 구매 가능 (requiresCities — 룰북:
// "You may only build a link on a ferry route once the Towns on both ends are Urbanized").
// cityA/cityB는 도시화 전엔 마을 id — placeNewCity가 도시화 시 신도시 id로 갱신한다.
// faces = 시각 앵커 (비인접 쌍의 헥스 변 중점끼리 직선 — 데이터 공간 면 번호).
// Ayr↔Glasgow($2)는 도시화 전엔 표준 마을 가닥이 링크 그 자체($1+$1=$2)라 이 항목은
// "Ayr 도시화 후" 구매/승계 전용이다 (가닥 승계는 placeNewCity가 처리).
export const SCOTLAND_DIRECT_LINKS: DirectLink[] = [
  { cityA: 'ST', cityB: 'UL', cost: 6, owner: null, requiresCities: true, faces: [1, 5] },
  { cityA: 'BF', cityB: 'AY', cost: 6, owner: null, requiresCities: true, faces: [3, 5] },
  { cityA: 'AY', cityB: 'glasgow', cost: 2, owner: null, requiresCities: true },
];

// === 헥스 타일 (지형 정보) 생성 ===
export function generateScotlandHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const cityKeys = new Set(SCOTLAND_CITIES.map((c) => `${c.coord.col},${c.coord.row}`));
  const lakeKeys = new Set(LAKE_TILES.map((t) => `${t.col},${t.row}`));
  const mtnKeys = new Set(MOUNTAIN_TILES.map((t) => `${t.col},${t.row}`));
  const rivKeys = new Set(RIVER_TILES.map((t) => `${t.col},${t.row}`));
  const rivEdges = new Map<string, [number, number]>(
    RIVER_TILES.map((t) => [`${t.col},${t.row}`, t.edges] as const)
  );
  const mtnRiver = new Map<string, [number, number]>(
    MOUNTAIN_RIVER_TILES.map((t) => [`${t.col},${t.row}`, t.edges] as const)
  );

  for (let row = 0; row < SCOTLAND_MAP.rows; row++) {
    for (let col = SCOTLAND_MAP.startCol; col < SCOTLAND_MAP.cols; col++) {
      const key = `${col},${row}`;
      if (cityKeys.has(key)) continue; // 도시 헥스는 지형 없음

      let terrain: TerrainType = 'plain';
      if (lakeKeys.has(key)) terrain = 'lake';
      else if (mtnKeys.has(key)) terrain = 'mountain';
      else if (rivKeys.has(key)) terrain = 'river';

      const tile: HexTile = { coord: { col, row }, terrain };
      if (terrain === 'river') tile.riverEdges = rivEdges.get(key);
      // 산+강 $5: 산 지형 + 강줄기 렌더(riverEdges) + 고정 비용 + 원 숫자 마커
      const mr = mtnRiver.get(key);
      if (mr) {
        tile.riverEdges = mr;
        tile.fixedCost = 5;
        tile.showCostMarker = true;
      }
      tiles.push(tile);
    }
  }

  return tiles;
}

// === 초기 보드 상태 생성 (도시 큐브는 createInitialGameState에서 배치) ===
export function createScotlandBoardState(): BoardState {
  return {
    cities: SCOTLAND_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: SCOTLAND_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateScotlandHexTiles(),
    directLinks: SCOTLAND_DIRECT_LINKS.map((d) => ({ ...d })),
  };
}

// === 색상 상수 (공식 맵 시트 실측 톤 — Southern England와 동일 아트 계열) ===
export const SCOTLAND_COLORS = {
  terrain: {
    plain: '#83d076',     // 연두 평원
    lake: '#f4f4e8',      // 바다/외곽 (빈 공간 톤)
    river: '#4a90c8',     // 강 파랑
    mountain: '#936123',  // 하이랜드 갈색
  },
  background: '#f4f4e8',
  border: '#413928',      // 보드 외곽 짙은 갈색
};
