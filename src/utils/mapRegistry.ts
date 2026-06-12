// 맵 레지스트리
// 게임 엔진/UI가 mapId 분기를 직접 갖지 않도록, 맵별 데이터와 룰 플래그를
// 이곳 한 곳으로 수렴합니다. 새 맵 추가 시 이 테이블만 갱신하면 됩니다.
// (AI 전략 파라미터는 src/ai/strategy/mapConfig.ts에서 별도 관리)

import {
  BoardState,
  City,
  Town,
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
  createStLuciaBoardState,
} from './stLuciaMap';

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
}

export const DEFAULT_MAP_RULES: MapRuleConfig = {
  skipGoodsGrowth: false,
  alternateTurnOrder: false,
  firstSeatCost: 0,
  disabledActions: [],
  hexCubeSetup: false,
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
  /** 맵별 특수 룰 */
  rules: MapRuleConfig;
  /** 초기 보드 상태 생성 (도시 큐브는 createInitialGameState에서 배치) */
  createBoardState: () => BoardState;
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
    colors: {
      terrain: ST_LUCIA_COLORS.terrain,
      background: ST_LUCIA_COLORS.background,
      border: ST_LUCIA_COLORS.border,
    },
    rules: {
      skipGoodsGrowth: true,       // 물품 성장 단계 생략
      alternateTurnOrder: true,    // 경매 대신 교대 선공권($5)
      firstSeatCost: 5,
      disabledActions: ['production'], // Production 선택 불가
      hexCubeSetup: true,          // 평지/강 헥스마다 큐브 1개 (도시 큐브 없음)
    },
    createBoardState: createStLuciaBoardState,
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
