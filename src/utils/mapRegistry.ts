// 맵 레지스트리
// 게임 엔진/UI가 mapId 분기를 직접 갖지 않도록, 맵별 데이터와 룰 플래그를
// 이곳 한 곳으로 수렴합니다. 새 맵 추가 시 이 테이블만 갱신하면 됩니다.
// (AI 전략 파라미터는 src/ai/strategy/mapConfig.ts에서 별도 관리)

import {
  BoardState,
  City,
  Town,
  CubeColor,
  GoodsColumnMapping,
  SpecialAction,
  TerrainType,
} from '@/types/game';
import {
  TUTORIAL_MAP,
  TUTORIAL_CITIES,
  TUTORIAL_TOWNS,
  TUTORIAL_COLUMN_MAPPING,
  TUTORIAL_COLORS,
  DEFAULT_CUBE_COUNTS,
  createInitialBoardState as createTutorialBoardState,
} from './tutorialMap';
import {
  ST_LUCIA_MAP,
  ST_LUCIA_CITIES,
  ST_LUCIA_TOWNS,
  ST_LUCIA_COLUMN_MAPPING,
  ST_LUCIA_COLORS,
  ST_LUCIA_TOWN_NAMES,
  createStLuciaBoardState,
} from './stLuciaMap';
import {
  RUST_BELT_MAP,
  RUST_BELT_CITIES,
  RUST_BELT_TOWNS,
  RUST_BELT_COLUMN_MAPPING,
  RUST_BELT_COLORS,
  RUST_BELT_TOWN_NAMES,
  createRustBeltBoardState,
} from './rustBeltMap';
import {
  GERMANY_MAP,
  GERMANY_ALL_CITIES,
  GERMANY_TOWNS,
  GERMANY_COLUMN_MAPPING,
  GERMANY_COLORS,
  GERMANY_TOWN_NAMES,
  createGermanyBoardState,
} from './germanyMap';
import {
  WESTERN_US_MAP,
  WESTERN_US_CITIES,
  WESTERN_US_TOWNS,
  WESTERN_US_COLUMN_MAPPING,
  WESTERN_US_COLORS,
  WESTERN_US_TOWN_NAMES,
  createWesternUsBoardState,
} from './westernUsMap';
import {
  KOREA_MAP,
  KOREA_CITIES,
  KOREA_TOWNS,
  KOREA_COLUMN_MAPPING,
  KOREA_COLORS,
  KOREA_TOWN_NAMES,
  createKoreaBoardState,
} from './koreaMap';
import {
  MONTREAL_MAP,
  MONTREAL_CITIES,
  MONTREAL_TOWNS,
  MONTREAL_COLUMN_MAPPING,
  MONTREAL_COLORS,
  MONTREAL_TOWN_NAMES,
  MONTREAL_ROADS,
  createMontrealBoardState,
} from './montrealMap';
import {
  MOON_MAP,
  MOON_CITIES,
  MOON_TOWNS,
  MOON_COLUMN_MAPPING,
  MOON_TOWN_NAMES,
  MOON_COLORS,
  createMoonBoardState,
} from './moonMap';
import {
  SOUTHERN_US_MAP,
  SOUTHERN_US_CITIES,
  SOUTHERN_US_TOWNS,
  SOUTHERN_US_COLUMN_MAPPING,
  SOUTHERN_US_COLORS,
  SOUTHERN_US_TOWN_NAMES,
  createSouthernUsBoardState,
} from './southernUsMap';

/**
 * 맵별 특수 룰 플래그
 * 게임 엔진은 mapId 대신 이 플래그만 보고 분기합니다.
 */
export interface MapRuleConfig {
  /** IX. 물품 성장(Goods Growth) 단계 생략 (St. Lucia) */
  skipGoodsGrowth: boolean;
  /** II. 경매 대신 교대 선공권 방식 — 선공하려면 firstSeatCost 지불 (St. Lucia) */
  alternateTurnOrder: boolean;
  /** alternateTurnOrder에서 선공권 비용 ($) */
  firstSeatCost: number;
  /** 선택할 수 없는 특수 행동 목록 (St. Lucia: production 불가) */
  disabledActions: SpecialAction[];
  /** 셋업: 도시 큐브 대신 평지/강 헥스마다 큐브 1개 배치 (St. Lucia).
   *  건설 시 그 큐브는 트랙 위로 올라가며, 미완성 링크여도 배달 가능. */
  hexCubeSetup: boolean;
  /** AI가 1턴에 무조건 도시화를 선택 (도시 0개로 시작하는 맵 — St. Lucia는
   *  도시화한 도시에 인접해야 첫 트랙 건설 가능하므로 1턴 도시화가 건설의 전제). */
  forceFirstTurnUrbanization: boolean;
}

export const DEFAULT_MAP_RULES: MapRuleConfig = {
  skipGoodsGrowth: false,
  alternateTurnOrder: false,
  firstSeatCost: 0,
  disabledActions: [],
  hexCubeSetup: false,
  forceFirstTurnUrbanization: false,
};

/**
 * 맵 데이터 (게임 초기화 + 보드 렌더링용)
 */
export interface GameMapData {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  supportedPlayers: number[];
  /** 그리드 크기: 유효 col은 startCol ~ cols-1, 유효 row는 0 ~ rows-1 */
  cols: number;
  rows: number;
  startCol: number;
  /** 게임 총 턴 수 */
  maxTurns: number;
  cities: City[];
  towns: Town[];
  /** 물품 디스플레이 열-도시 매핑 */
  columnMapping: GoodsColumnMapping[];
  /** UI 색상 (지형/배경) */
  colors: {
    // swamp 등 일부 지형은 맵마다 없으므로 Partial — GameBoard가 `?? plain`으로 폴백
    terrain: Partial<Record<TerrainType, string>>;
    background: string;
    border: string;
  };
  /** 마을 ID → 표시 이름 (없으면 ID 표시) */
  townNames?: Record<string, string>;
  /** 바다(lake) 헥스를 그리지 않아 섬 모양으로 표시 (St. Lucia) */
  hideLakeHexes?: boolean;
  /** 헥스 배향: 공식 맵이 flat-top이면 'flat' — 렌더만 전치, 게임 로직은 동형 (기본 'pointy') */
  orientation?: 'pointy' | 'flat';
  /** 헥스 건설비용 표기 방식:
   *  'perHex'(기본, Germany) = 헥스마다 숫자 박스 / 'legend'(Western US) = 지도 모서리에 지형색→가격 범례.
   *  지형별로 비용이 균일한 맵('legend')은 헥스마다 숫자를 찍으면 지저분하므로 범례로 표시한다. */
  hexCostMode?: 'perHex' | 'legend';
  /** 범례에 표시할 지형 이름 오버라이드 (Montréal: swamp 지형을 '도로'로 재사용). 미지정 시 기본 이름. */
  terrainNames?: Partial<Record<TerrainType, string>>;
  /** 보드 위에 그릴 도로 라인 (Montréal — 검정 도로 + 노란 점선 중앙선, 원본 시트 재현).
   *  각 라인 = 데이터 좌표 + 화면 px 오프셋(HEX_SIZE 기준)의 폴리라인. 순수 시각 요소. */
  roads?: { coord: { col: number; row: number }; dx?: number; dy?: number }[][];
  /** viewBox 우측 여백을 헥스 N개 폭만큼 줄임 (calculateBoardDimensions가 우측을 약 1헥스 과대 산정 — 맵별 보정). */
  trimRightHexes?: number;
  /** viewBox 좌측 빈 열을 헥스 N개 폭만큼 가림 (Korea: 좌측 row 0이 비어 있어 1). */
  trimLeftHexes?: number;
  /** 게임 화면 보드 표시 배율 (1=기본=폭 100%). 세로로 긴 맵이 화면을 꽉 채워 과대해 보일 때
   *  컨테이너 폭을 줄여 보드를 축소한다 (예: St. Lucia 0.8 = 20% 축소). 미지정=1. */
  boardDisplayScale?: number;
  /** 맵별 특수 룰 */
  rules: MapRuleConfig;
  /** 초기 보드 상태 생성 (도시 큐브는 createInitialGameState에서 배치) */
  createBoardState: () => BoardState;
  /** 물품 디스플레이 큐브 색 구성 (미지정 시 룰북 표준 — black 포함).
   *  Rust Belt처럼 검정 도시가 없는 맵은 black 제외 구성을 지정 (배달 불가 데드 큐브 방지). */
  goodsCubeCounts?: Partial<Record<CubeColor, number>>;
}

// 튜토리얼 맵은 3턴 (TUTORIAL_GAME_CONFIG.maxTurns와 동일해야 함)
const TUTORIAL_MAX_TURNS = 3;

const MAP_REGISTRY: Record<string, GameMapData> = {
  tutorial: {
    id: TUTORIAL_MAP.id,
    name: TUTORIAL_MAP.name,
    nameKo: TUTORIAL_MAP.nameKo,
    description: TUTORIAL_MAP.description,
    supportedPlayers: TUTORIAL_MAP.supportedPlayers,
    cols: TUTORIAL_MAP.cols,
    rows: TUTORIAL_MAP.rows,
    startCol: TUTORIAL_MAP.startCol,
    maxTurns: TUTORIAL_MAX_TURNS,
    cities: TUTORIAL_CITIES,
    towns: TUTORIAL_TOWNS,
    columnMapping: TUTORIAL_COLUMN_MAPPING,
    townNames: { W: 'Wheeling' },
    colors: {
      terrain: TUTORIAL_COLORS.terrain,
      background: TUTORIAL_COLORS.background,
      border: TUTORIAL_COLORS.border,
    },
    rules: { ...DEFAULT_MAP_RULES },
    createBoardState: createTutorialBoardState,
  },

  'st-lucia': {
    id: ST_LUCIA_MAP.id,
    name: ST_LUCIA_MAP.name,
    nameKo: ST_LUCIA_MAP.nameKo,
    description: ST_LUCIA_MAP.description,
    supportedPlayers: ST_LUCIA_MAP.supportedPlayers,
    cols: ST_LUCIA_MAP.cols,
    rows: ST_LUCIA_MAP.rows,
    startCol: ST_LUCIA_MAP.startCol,
    maxTurns: ST_LUCIA_MAP.maxTurns,
    cities: ST_LUCIA_CITIES,
    towns: ST_LUCIA_TOWNS,
    columnMapping: ST_LUCIA_COLUMN_MAPPING,
    townNames: ST_LUCIA_TOWN_NAMES,
    hideLakeHexes: true,
    orientation: 'flat',
    boardDisplayScale: 0.8, // 세로로 긴 2인 맵 — 게임 화면에서 20% 축소
    colors: {
      terrain: ST_LUCIA_COLORS.terrain,
      background: ST_LUCIA_COLORS.background,
      border: ST_LUCIA_COLORS.border,
    },
    rules: {
      skipGoodsGrowth: true,       // 물품 성장 단계 생략
      alternateTurnOrder: true,    // 경매 대신 교대 선공권($5)
      firstSeatCost: 5,
      // 공식 맵 시트: "Turn Order Action: Not available" / "Production Action: Not available"
      disabledActions: ['production', 'turnOrder'],
      hexCubeSetup: true,          // 평지/강 헥스마다 큐브 1개 (도시 큐브 없음)
      forceFirstTurnUrbanization: true, // 첫 트랙은 도시 인접만 — 1턴엔 도시화 선택자만 건설 가능
    },
    createBoardState: createStLuciaBoardState,
  },

  'rust-belt': {
    id: RUST_BELT_MAP.id,
    name: RUST_BELT_MAP.name,
    nameKo: RUST_BELT_MAP.nameKo,
    description: RUST_BELT_MAP.description,
    supportedPlayers: RUST_BELT_MAP.supportedPlayers,
    cols: RUST_BELT_MAP.cols,
    rows: RUST_BELT_MAP.rows,
    startCol: RUST_BELT_MAP.startCol,
    maxTurns: RUST_BELT_MAP.maxTurns,
    cities: RUST_BELT_CITIES,
    towns: RUST_BELT_TOWNS,
    columnMapping: RUST_BELT_COLUMN_MAPPING,
    townNames: RUST_BELT_TOWN_NAMES,
    hideLakeHexes: true,         // 오대호/외곽은 빈 공간으로 (flat-top 렌더)
    orientation: 'flat',
    colors: {
      terrain: RUST_BELT_COLORS.terrain,
      background: RUST_BELT_COLORS.background,
      border: RUST_BELT_COLORS.border,
    },
    rules: { ...DEFAULT_MAP_RULES }, // 룰북 표준 규칙
    createBoardState: createRustBeltBoardState,
    goodsCubeCounts: DEFAULT_CUBE_COUNTS, // 룰북 표준 (red/blue/yellow/purple 20 + black 16)
  },

  germany: {
    id: GERMANY_MAP.id,
    name: GERMANY_MAP.name,
    nameKo: GERMANY_MAP.nameKo,
    description: GERMANY_MAP.description,
    supportedPlayers: GERMANY_MAP.supportedPlayers,
    cols: GERMANY_MAP.cols,
    rows: GERMANY_MAP.rows,
    startCol: GERMANY_MAP.startCol,
    maxTurns: GERMANY_MAP.maxTurns,
    cities: GERMANY_ALL_CITIES,
    towns: GERMANY_TOWNS,
    columnMapping: GERMANY_COLUMN_MAPPING,
    townNames: GERMANY_TOWN_NAMES,
    hideLakeHexes: true,         // 맵 밖(lake) 헥스는 안 그려 독일 국경 윤곽 표현
    orientation: 'flat',         // flat-top 보드 — 전치 저장 + 렌더 전치 (St.Lucia/Rust Belt와 동일)
    colors: {
      terrain: GERMANY_COLORS.terrain,
      background: GERMANY_COLORS.background,
      border: GERMANY_COLORS.border,
    },
    // 특수 규칙(Engineer 절반/미완성 금지/Berlin 보너스)은 MapProfile getter로 주입 — 여기선 표준 플래그
    rules: { ...DEFAULT_MAP_RULES },
    createBoardState: createGermanyBoardState,
    goodsCubeCounts: DEFAULT_CUBE_COUNTS, // 룰북 표준
  },

  'western-us': {
    id: WESTERN_US_MAP.id,
    name: WESTERN_US_MAP.name,
    nameKo: WESTERN_US_MAP.nameKo,
    description: WESTERN_US_MAP.description,
    supportedPlayers: WESTERN_US_MAP.supportedPlayers,
    cols: WESTERN_US_MAP.cols,
    rows: WESTERN_US_MAP.rows,
    startCol: WESTERN_US_MAP.startCol,
    maxTurns: WESTERN_US_MAP.maxTurns,
    cities: WESTERN_US_CITIES,
    towns: WESTERN_US_TOWNS,
    columnMapping: WESTERN_US_COLUMN_MAPPING,
    townNames: WESTERN_US_TOWN_NAMES,
    hideLakeHexes: true,         // 태평양/멕시코만 외곽은 안 그려 대륙 윤곽 표현
    orientation: 'pointy',       // pointy-top 네이티브 — 전치 없음 (St.Lucia/Rust Belt/Germany와 다름)
    hexCostMode: 'legend',       // 지형별 균일 비용(늪/강 $4·산 $5) → 헥스 숫자 대신 좌하단 범례
    trimRightHexes: 1,           // 우측 과대 여백 1헥스 트림 (좌측과 대칭)
    colors: {
      terrain: WESTERN_US_COLORS.terrain,
      background: WESTERN_US_COLORS.background,
      border: WESTERN_US_COLORS.border,
    },
    // 특수 규칙(마을큐브/시작현금/지형비용/동서보너스/시작도시/대륙횡단)은 MapProfile getter로 주입
    rules: { ...DEFAULT_MAP_RULES },
    createBoardState: createWesternUsBoardState,
    goodsCubeCounts: DEFAULT_CUBE_COUNTS, // 룰북 표준 (검정 화물은 도시화로 검정 신도시 만들어 배달)
  },

  'southern-us': {
    id: SOUTHERN_US_MAP.id,
    name: SOUTHERN_US_MAP.name,
    nameKo: SOUTHERN_US_MAP.nameKo,
    description: SOUTHERN_US_MAP.description,
    supportedPlayers: SOUTHERN_US_MAP.supportedPlayers,
    cols: SOUTHERN_US_MAP.cols,
    rows: SOUTHERN_US_MAP.rows,
    startCol: SOUTHERN_US_MAP.startCol,
    maxTurns: SOUTHERN_US_MAP.maxTurns,
    cities: SOUTHERN_US_CITIES,
    towns: SOUTHERN_US_TOWNS,
    columnMapping: SOUTHERN_US_COLUMN_MAPPING,
    townNames: SOUTHERN_US_TOWN_NAMES,
    hideLakeHexes: true,         // 멕시코만/대서양 외곽은 안 그려 해안 윤곽 표현
    orientation: 'flat',         // flat-top 보드 — 전치 저장 + 렌더 전치 (Germany 등과 동일)
    trimLeftHexes: 1,            // 좌측 row 0이 빈 열이라 viewBox에서 가려 보드 확대 (Korea와 동일 기법)
    colors: {
      terrain: SOUTHERN_US_COLORS.terrain,
      background: SOUTHERN_US_COLORS.background,
      border: SOUTHERN_US_COLORS.border,
    },
    // 특수 규칙(면화/항구/Atlanta 호황/남북전쟁)은 MapProfile getter + board.cottonPorts로 주입
    rules: { ...DEFAULT_MAP_RULES },
    createBoardState: createSouthernUsBoardState,
    goodsCubeCounts: DEFAULT_CUBE_COUNTS, // 룰북 표준 — 면화(white)는 주머니에 넣지 않고 마을 위에만
  },

  montreal: {
    id: MONTREAL_MAP.id,
    name: MONTREAL_MAP.name,
    nameKo: MONTREAL_MAP.nameKo,
    description: MONTREAL_MAP.description,
    supportedPlayers: MONTREAL_MAP.supportedPlayers,
    cols: MONTREAL_MAP.cols,
    rows: MONTREAL_MAP.rows,
    startCol: MONTREAL_MAP.startCol,
    maxTurns: MONTREAL_MAP.maxTurns,
    cities: MONTREAL_CITIES,
    towns: MONTREAL_TOWNS,
    columnMapping: MONTREAL_COLUMN_MAPPING,
    townNames: MONTREAL_TOWN_NAMES,
    hideLakeHexes: true,         // 우상단 정부 패널 영역 등 맵 밖은 안 그림
    orientation: 'flat',         // flat-top 보드 — 전치 저장 + 렌더 전치 (Germany 등과 동일)
    hexCostMode: 'legend',       // 지형별 균일 비용 → 범례. 단 원본 시트에 숫자가 인쇄된 헥스
                                 // 3곳(물 "6"×2·"5"×1)만 showCostMarker로 숫자 표시 (원본 재현)
    terrainNames: { swamp: '도로', mountain: '언덕' }, // swamp 지형을 도로로 재사용 (몬트리올 용어)
    roads: MONTREAL_ROADS,       // 원본 시트의 도로 라인 (검정 + 노란 점선) — 순수 시각 요소
    colors: {
      terrain: MONTREAL_COLORS.terrain,
      background: MONTREAL_COLORS.background,
      border: MONTREAL_COLORS.border,
    },
    // 특수 규칙(정부 링크/DGEL/마스터 네트워크/경매 트윅/Repopulation)은 MapProfile getter로 주입
    rules: { ...DEFAULT_MAP_RULES, skipGoodsGrowth: true },
    createBoardState: createMontrealBoardState,
    goodsCubeCounts: DEFAULT_CUBE_COUNTS, // 룰북 표준 — 디스플레이 미사용, 전부 주머니에서 뽑음
  },

  moon: {
    id: MOON_MAP.id,
    name: MOON_MAP.name,
    nameKo: MOON_MAP.nameKo,
    description: MOON_MAP.description,
    supportedPlayers: MOON_MAP.supportedPlayers,
    cols: MOON_MAP.cols,
    rows: MOON_MAP.rows,
    startCol: MOON_MAP.startCol,
    maxTurns: MOON_MAP.maxTurns,
    cities: MOON_CITIES,
    towns: MOON_TOWNS,
    columnMapping: MOON_COLUMN_MAPPING,
    townNames: MOON_TOWN_NAMES,
    hideLakeHexes: true,         // 마름모 보드 밖(lake)은 안 그림
    orientation: 'flat',         // flat-top 보드 — 전치 저장 + 렌더 전치 (Montréal 등과 동일)
    hexCostMode: 'legend',       // 지형별 균일 비용(크레이터 $3/산 $4) → 범례
    terrainNames: { plain: '크레이터' },
    colors: {
      terrain: MOON_COLORS.terrain,
      background: MOON_COLORS.background,
      border: MOON_COLORS.border,
    },
    // 특수 규칙(건설2/Moon Base 네트워크/랩/밤낮/저중력/주사위 성장)은 MapProfile getter +
    // board.wrapEdges·City.noDemand로 주입 — 여기선 표준 플래그 (성장 단계는 있음: cityDiceGrowth)
    rules: { ...DEFAULT_MAP_RULES },
    createBoardState: createMoonBoardState,
    goodsCubeCounts: DEFAULT_CUBE_COUNTS, // 룰북 표준 — 밤 도시 수요(black) 포함 5색
  },

  korea: {
    id: KOREA_MAP.id,
    name: KOREA_MAP.name,
    nameKo: KOREA_MAP.nameKo,
    description: KOREA_MAP.description,
    supportedPlayers: KOREA_MAP.supportedPlayers,
    cols: KOREA_MAP.cols,
    rows: KOREA_MAP.rows,
    startCol: KOREA_MAP.startCol,
    maxTurns: KOREA_MAP.maxTurns,
    cities: KOREA_CITIES,
    towns: KOREA_TOWNS,
    columnMapping: KOREA_COLUMN_MAPPING,
    townNames: KOREA_TOWN_NAMES,
    hideLakeHexes: true,         // 맵 밖(lake) 헥스는 안 그려 한반도 윤곽 표현
    orientation: 'flat',         // flat-top 보드 — 전치 저장 + 렌더 전치 (Germany 등과 동일)
    hexCostMode: 'legend',       // 산 단일 비용($3) → 헥스마다 숫자 대신 범례
    trimLeftHexes: 1,            // 좌측 row 0이 빈 열이라 viewBox에서 가려 보드 확대
    colors: {
      terrain: KOREA_COLORS.terrain,
      background: KOREA_COLORS.background,
      border: KOREA_COLORS.border,
    },
    // 특수 규칙(동적 도시색/도시화 보충/no-growth)은 MapProfile getter + board 플래그로 주입 — 여기선 표준 플래그
    rules: { ...DEFAULT_MAP_RULES },
    createBoardState: createKoreaBoardState,
    goodsCubeCounts: DEFAULT_CUBE_COUNTS, // 룰북 표준
  },
};

/**
 * mapId로 맵 데이터 조회 (알 수 없는 맵은 튜토리얼로 폴백)
 */
export function getMapData(mapId: string): GameMapData {
  return MAP_REGISTRY[mapId] ?? MAP_REGISTRY.tutorial;
}

/**
 * mapId로 맵 특수 룰 조회
 */
export function getMapRules(mapId: string): MapRuleConfig {
  return getMapData(mapId).rules;
}

/**
 * 플레이 가능한 맵 ID 목록 (정적 라우트 생성용)
 */
export function getPlayableMapIds(): string[] {
  return Object.keys(MAP_REGISTRY);
}

/**
 * columnMapping에서 cityId의 물품 디스플레이 슬롯 구간(시작 인덱스·행 수)을 찾는다.
 * 도시화 디스플레이 보충(gameStore.placeNewCity)과 AI 도시화 수요색 예측(ai/urbanization)이
 * 같은 인덱싱을 써야 하므로 단일 소스로 공유 (없으면 null).
 */
export function getDisplaySlotRange(
  mapId: string,
  cityId: string,
): { startIndex: number; rowCount: number } | null {
  let slotIdx = 0;
  for (const m of getMapData(mapId).columnMapping) {
    if (m.cityId === cityId) return { startIndex: slotIdx, rowCount: m.rowCount };
    slotIdx += m.rowCount;
  }
  return null;
}
