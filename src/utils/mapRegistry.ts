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
  RUST_BELT_CUBE_COUNTS,
  createRustBeltBoardState,
} from './rustBeltMap';
import {
  GERMANY_MAP,
  GERMANY_ALL_CITIES,
  GERMANY_TOWNS,
  GERMANY_COLUMN_MAPPING,
  GERMANY_COLORS,
  GERMANY_TOWN_NAMES,
  GERMANY_CUBE_COUNTS,
  createGermanyBoardState,
} from './germanyMap';

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
    terrain: Record<TerrainType, string>;
    background: string;
    border: string;
  };
  /** 마을 ID → 표시 이름 (없으면 ID 표시) */
  townNames?: Record<string, string>;
  /** 바다(lake) 헥스를 그리지 않아 섬 모양으로 표시 (St. Lucia) */
  hideLakeHexes?: boolean;
  /** 헥스 배향: 공식 맵이 flat-top이면 'flat' — 렌더만 전치, 게임 로직은 동형 (기본 'pointy') */
  orientation?: 'pointy' | 'flat';
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
    goodsCubeCounts: RUST_BELT_CUBE_COUNTS, // 검정 도시 없음 → black 큐브 제외
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
    orientation: 'pointy',       // 윗변 뾰족 (전치 없이 그대로)
    colors: {
      terrain: GERMANY_COLORS.terrain,
      background: GERMANY_COLORS.background,
      border: GERMANY_COLORS.border,
    },
    // 특수 규칙(Engineer 절반/미완성 금지/Berlin 보너스)은 MapProfile getter로 주입 — 여기선 표준 플래그
    rules: { ...DEFAULT_MAP_RULES },
    createBoardState: createGermanyBoardState,
    goodsCubeCounts: GERMANY_CUBE_COUNTS,
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
