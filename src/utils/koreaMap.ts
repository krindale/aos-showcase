// Korea 맵 데이터
// Age of Steam 확장맵 3 — 한국 (Martin Wallace 2004 / James Mathias 아트 2018). 4인 기준(8턴).
//
// 공식 맵 시트(maps/korea-v2.1.pdf → out/maps/korea.png, 2381×3367)를 색상 자동 검출 +
// 테두리 자기상관 격자 피팅(피치 row 174 / col 200, 홀수 row 아래로 +100 시프트)으로 추출했다.
//   원본은 flat-top(평평한 윗변) 헥스 — St.Lucia/Rust Belt/Germany와 동일하게 게임 좌표는
//   전치(transpose)해 저장하고(인접 관계 동형이라 게임 로직 무변경), 렌더만 orientation:'flat'
//   으로 다시 전치한다. 데이터 좌표: col = 화면 세로(0~16), row = 화면 가로(0~13).
//   (검증: SUWON{col5,row4}이 odd-r 규칙으로 INCHEON{col4,row3}=NW, SEOUL{col4,row5}=SW에
//    인접 → 직결 링크 SUWON-INCHEON / SUWON-SEOUL 성립.)
//
// 특수 개념(룰북 한국 — 자세한 적용은 KoreaMapProfile + 엔진 dynamicCityColors):
//  - 동적 도시 색상: 도시는 고정색이 없고, 수요색 = 현재 놓인 큐브 색. 빈 도시는 수요 없음.
//    같은 색 큐브 있는 도시는 통과 불가(거기서 멈춰 배달). createKoreaBoardState가 board에 플래그 set.
//  - 셋업: 평양 4, 부산·인천 3, 나머지 도시 2 (cityCubeCounts)
//  - 건설: 산 $3 (강 없음), 수원-서울 / 수원-인천 직결 링크 $2(트랙 1개)
//  - 도시화: 디스플레이에서 큐브 2개를 신도시에 배치 후 보충, 신도시는 회색
//  - 물품 성장: 평양·수원은 새 물품을 받지 않음 (columnMapping에서 제외 + noGrowthCityIds)
//
// 도시 14(평양·수원 무번호 포함), 마을 16.

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
export const KOREA_MAP = {
  id: 'korea',
  name: 'Korea',
  nameKo: '한국',
  description:
    '평양에서 부산까지 한반도를 종단하는 4인 맵. 도시 색상이 현재 놓인 물품에 따라 ' +
    '동적으로 바뀌는 독특한 수요 규칙과 수원-서울/인천 직결 철로가 특징.',
  players: { min: 4, max: 4 },
  supportedPlayers: [4],
  difficulty: 4,
  cols: 16, // 유효 col: 0 ~ 15 (전치 — 화면 세로). col 16은 빈 행이라 제거(보드 확대).
  rows: 14, // 유효 row: 0 ~ 13 (전치 — 화면 가로). row 0은 빈 좌측 열이라 viewBox 좌측 트림으로 가림.
  startCol: 0,
  maxTurns: 8, // 룰북 표준: 4인 게임 8턴
};

// === 도시 14 (전치 좌표) ===
// color는 동적 색상 맵이라 게임상 사용되지 않는 placeholder(렌더는 cubes 기반 회색). 타입 충족용.
export const KOREA_CITIES: City[] = [
  { id: 'pyongyang', name: 'Pyongyang', coord: { col: 0,  row: 3 },  color: 'red',    cubes: [] },
  { id: 'incheon',   name: 'Incheon',   coord: { col: 4,  row: 3 },  color: 'blue',   cubes: [] },
  { id: 'seoul',     name: 'Seoul',     coord: { col: 4,  row: 5 },  color: 'yellow', cubes: [] },
  { id: 'suwon',     name: 'Suwon',     coord: { col: 5,  row: 4 },  color: 'purple', cubes: [] },
  { id: 'chuncheon', name: 'Chuncheon', coord: { col: 2,  row: 7 },  color: 'red',    cubes: [] },
  { id: 'gangneung', name: 'Gangneung', coord: { col: 3,  row: 11 }, color: 'blue',   cubes: [] },
  { id: 'cheongju',  name: 'Cheongju',  coord: { col: 6,  row: 7 },  color: 'yellow', cubes: [] },
  { id: 'taejon',    name: 'Taejon',    coord: { col: 8,  row: 6 },  color: 'purple', cubes: [] },
  { id: 'jeonju',    name: 'Jeonju',    coord: { col: 10, row: 5 },  color: 'black',  cubes: [] },
  { id: 'gwangju',   name: 'Gwangju',   coord: { col: 13, row: 4 },  color: 'red',    cubes: [] },
  { id: 'daegu',     name: 'Daegu',     coord: { col: 10, row: 10 }, color: 'blue',   cubes: [] },
  { id: 'pohang',    name: 'Pohang',    coord: { col: 9,  row: 13 }, color: 'yellow', cubes: [] },
  { id: 'changwon',  name: 'Changwon',  coord: { col: 12, row: 10 }, color: 'purple', cubes: [] },
  { id: 'busan',     name: 'Busan',     coord: { col: 13, row: 12 }, color: 'black',  cubes: [] },
];

// === 마을 16 (전치 좌표) ===
export const KOREA_TOWNS: Town[] = [
  { id: 'KAN', coord: { col: 1,  row: 9 },  newCityColor: null, cubes: [] }, // Kansong
  { id: 'YEC', coord: { col: 2,  row: 5 },  newCityColor: null, cubes: [] }, // Yeoncheon
  { id: 'TAE', coord: { col: 7,  row: 2 },  newCityColor: null, cubes: [] }, // Taean
  { id: 'CHN', coord: { col: 6,  row: 5 },  newCityColor: null, cubes: [] }, // Cheonan
  { id: 'WON', coord: { col: 5,  row: 8 },  newCityColor: null, cubes: [] }, // Wonju
  { id: 'ULJ', coord: { col: 6,  row: 12 }, newCityColor: null, cubes: [] }, // Uljin
  { id: 'YEJ', coord: { col: 7,  row: 10 }, newCityColor: null, cubes: [] }, // Yeongju
  { id: 'YED', coord: { col: 7,  row: 13 }, newCityColor: null, cubes: [] }, // Yeongdeok
  { id: 'KUS', coord: { col: 9,  row: 4 },  newCityColor: null, cubes: [] }, // Kusan
  { id: 'KIM', coord: { col: 9,  row: 8 },  newCityColor: null, cubes: [] }, // Kimchon
  { id: 'ANU', coord: { col: 10, row: 7 },  newCityColor: null, cubes: [] }, // Anui
  { id: 'ULS', coord: { col: 11, row: 13 }, newCityColor: null, cubes: [] }, // Ulsan
  { id: 'JIN', coord: { col: 12, row: 8 },  newCityColor: null, cubes: [] }, // Jinju
  { id: 'GOS', coord: { col: 13, row: 9 },  newCityColor: null, cubes: [] }, // Goseong
  { id: 'GOH', coord: { col: 15, row: 6 },  newCityColor: null, cubes: [] }, // Goheung
  { id: 'WAN', coord: { col: 15, row: 3 },  newCityColor: null, cubes: [] }, // Wando
];

export const KOREA_TOWN_NAMES: Record<string, string> = {
  KAN: 'Kansong', YEC: 'Yeoncheon', TAE: 'Taean', CHN: 'Cheonan', WON: 'Wonju',
  ULJ: 'Uljin', YEJ: 'Yeongju', YED: 'Yeongdeok', KUS: 'Kusan', KIM: 'Kimchon',
  ANU: 'Anui', ULS: 'Ulsan', JIN: 'Jinju', GOS: 'Goseong', GOH: 'Goheung', WAN: 'Wando',
};

// === 물품 디스플레이 열-도시 매핑 (평양·수원 제외 → 물품 성장 안 받음) ===
// diceNumber = 원본 맵 도시 헥스에 인쇄된 숫자.
//   1: Chuncheon·Pohang  2: Gangneung·Daegu  3: Incheon·Jeonju
//   4: Seoul·Changwon    5: Cheongju·Gwangju  6: Taejon·Busan
export const KOREA_COLUMN_MAPPING: GoodsColumnMapping[] = [
  { columnId: 'chuncheon', cityId: 'chuncheon', isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'pohang',    cityId: 'pohang',    isNewCity: false, rowCount: 3, diceNumber: 1 },
  { columnId: 'gangneung', cityId: 'gangneung', isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'daegu',     cityId: 'daegu',     isNewCity: false, rowCount: 3, diceNumber: 2 },
  { columnId: 'incheon',   cityId: 'incheon',   isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'jeonju',    cityId: 'jeonju',    isNewCity: false, rowCount: 3, diceNumber: 3 },
  { columnId: 'seoul',     cityId: 'seoul',     isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'changwon',  cityId: 'changwon',  isNewCity: false, rowCount: 3, diceNumber: 4 },
  { columnId: 'cheongju',  cityId: 'cheongju',  isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'gwangju',   cityId: 'gwangju',   isNewCity: false, rowCount: 3, diceNumber: 5 },
  { columnId: 'taejon',    cityId: 'taejon',    isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'busan',     cityId: 'busan',     isNewCity: false, rowCount: 3, diceNumber: 6 },
  { columnId: 'A' as GoodsColumnId, cityId: 'A', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'B' as GoodsColumnId, cityId: 'B', isNewCity: true, rowCount: 2, diceNumber: 2 },
  { columnId: 'C' as GoodsColumnId, cityId: 'C', isNewCity: true, rowCount: 2, diceNumber: 3 },
  { columnId: 'D' as GoodsColumnId, cityId: 'D', isNewCity: true, rowCount: 2, diceNumber: 4 },
  { columnId: 'E' as GoodsColumnId, cityId: 'E', isNewCity: true, rowCount: 2, diceNumber: 5 },
  { columnId: 'F' as GoodsColumnId, cityId: 'F', isNewCity: true, rowCount: 2, diceNumber: 6 },
  { columnId: 'G' as GoodsColumnId, cityId: 'G', isNewCity: true, rowCount: 2, diceNumber: 1 },
  { columnId: 'H' as GoodsColumnId, cityId: 'H', isNewCity: true, rowCount: 2, diceNumber: 2 },
];

// 동적 색상 맵이라 5색 모두 유효 (black 포함). Germany와 동일 분포.
export const KOREA_CUBE_COUNTS: Partial<Record<CubeColor, number>> = {
  red: 20, blue: 20, yellow: 20, purple: 20, black: 16,
};

// === 도시-도시 직결 링크 (룰북: 수원-서울 $2, 수원-인천 $2) ===
// 수원이 서울/인천과 보드에서 직접 인접(변 공유)이라 사이 헥스가 없어 일반 트랙으로 못 잇는다.
export const KOREA_DIRECT_LINKS = [
  { cityA: 'suwon', cityB: 'seoul',   cost: 2, owner: null as null },
  { cityA: 'suwon', cityB: 'incheon', cost: 2, owner: null as null },
];

// === 지형 좌표 (추출 결과, [col, row] — col=화면세로, row=화면가로) ===
// 산악(갈색). 강은 없음. 산 건설비용 $3.
const MOUNTAIN: [number, number][] = [
  [0,5],[0,7],[0,9],[1,3],[1,4],[1,5],[1,6],[1,7],[1,8],[2,2],[2,3],[2,4],[2,5],[2,6],[2,8],[2,9],
  [3,5],[3,6],[3,7],[3,8],[3,9],[4,6],[4,7],[4,8],[4,9],[4,10],[5,7],[5,8],[5,9],[5,10],[5,11],
  [6,6],[6,8],[6,9],[6,10],[6,11],[7,3],[7,4],[7,7],[7,8],[7,9],[7,10],[7,11],[7,12],[8,4],[8,7],
  [8,8],[8,9],[8,10],[8,11],[8,12],[9,6],[9,7],[9,8],[9,9],[9,10],[9,11],[9,12],[10,6],[10,7],
  [10,8],[10,9],[10,11],[10,12],[10,13],[11,5],[11,6],[11,7],[11,8],[11,9],[11,11],[11,12],[12,5],
  [12,6],[12,7],[13,5],[13,6],[14,4],
];

// 비-lake(타일을 생성할) 셀 전체 — 산 외 나머지는 평지. 이 집합에 없는 셀은 모두 lake(맵 밖, hideLakeHexes).
// 도시/마을 셀도 포함(도시는 generate에서 제외, 마을은 평지/산 배경 타일 생성).
const LAND: [number, number][] = [
  [0,1],[0,3],[0,5],[0,7],[0,9],[1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[1,7],[1,8],[1,9],
  [2,1],[2,2],[2,3],[2,4],[2,5],[2,6],[2,7],[2,8],[2,9],[2,10],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7],[3,8],[3,9],[3,10],[3,11],
  [4,3],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],[4,10],[4,11],[5,4],[5,5],[5,6],[5,7],[5,8],[5,9],[5,10],[5,11],[5,12],
  [6,3],[6,4],[6,5],[6,6],[6,7],[6,8],[6,9],[6,10],[6,11],[6,12],[6,13],[7,2],[7,3],[7,4],[7,5],[7,6],[7,7],[7,8],[7,9],[7,10],[7,11],[7,12],[7,13],
  [8,4],[8,5],[8,6],[8,7],[8,8],[8,9],[8,10],[8,11],[8,12],[8,13],[9,4],[9,5],[9,6],[9,7],[9,8],[9,9],[9,10],[9,11],[9,12],[9,13],
  [10,4],[10,5],[10,6],[10,7],[10,8],[10,9],[10,10],[10,11],[10,12],[10,13],[11,3],[11,4],[11,5],[11,6],[11,7],[11,8],[11,9],[11,10],[11,11],[11,12],[11,13],
  [12,3],[12,4],[12,5],[12,6],[12,7],[12,8],[12,9],[12,10],[12,11],[12,12],[13,3],[13,4],[13,5],[13,6],[13,7],[13,8],[13,9],[13,12],
  [14,3],[14,4],[14,6],[15,2],[15,3],[15,4],[15,6],
];

const MOUNTAIN_COST = 3;

// === 헥스 타일 생성 ===
export function generateKoreaHexTiles(): HexTile[] {
  const tiles: HexTile[] = [];
  const key = (c: number, r: number) => `${c},${r}`;
  const cityKeys = new Set(KOREA_CITIES.map((c) => key(c.coord.col, c.coord.row)));
  const landKeys = new Set(LAND.map(([c, r]) => key(c, r)));
  const mtnKeys = new Set(MOUNTAIN.map(([c, r]) => key(c, r)));

  for (let row = 0; row < KOREA_MAP.rows; row++) {
    for (let col = KOREA_MAP.startCol; col < KOREA_MAP.cols; col++) {
      const k = key(col, row);
      if (cityKeys.has(k)) continue; // 도시 헥스는 지형 없음
      if (!landKeys.has(k)) { tiles.push({ coord: { col, row }, terrain: 'lake' }); continue; } // 맵 밖 → lake(hideLakeHexes)
      if (mtnKeys.has(k)) { tiles.push({ coord: { col, row }, terrain: 'mountain', fixedCost: MOUNTAIN_COST }); }
      else { tiles.push({ coord: { col, row }, terrain: 'plain' }); }
    }
  }
  return tiles;
}

// === 초기 보드 상태 ===
export function createKoreaBoardState(): BoardState {
  return {
    cities: KOREA_CITIES.map((c) => ({ ...c, cubes: [] })),
    towns: KOREA_TOWNS.map((t) => ({ ...t, cubes: [] })),
    trackTiles: [],
    townSpurs: [],
    hexTiles: generateKoreaHexTiles(),
    directLinks: KOREA_DIRECT_LINKS.map((d) => ({ ...d })),
    dynamicCityColors: true, // 한국: 도시 수요색 = 현재 놓인 큐브 색 (cityAcceptsCube 헬퍼)
  };
}

// === 색상 상수 (공식 맵 톤) ===
export const KOREA_COLORS = {
  terrain: {
    plain: '#80C080',      // 연두 평원
    lake: '#E9E2CB',       // 맵 밖 (베이지, hideLakeHexes로 안 그림)
    river: '#5FA3D4',      // (미사용)
    mountain: '#A07838',   // 산악 갈색
  } as Record<TerrainType, string>,
  background: '#E9E2CB',
  border: '#5B4A2E',
};
