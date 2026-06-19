/**
 * 맵별 AI 설정 (MapAIConfig)
 *
 * AI 의사결정 로직이 "tutorial이면 엔진 3" 같은 맵 분기를 직접 갖지 않도록,
 * 맵/게임 상태에서 유도되는 파라미터를 이곳 한 곳으로 수렴합니다.
 * 새 맵 추가 시 AI 코드 수정 없이 이 테이블만 갱신하면 됩니다.
 */

import { GameState, GAME_CONSTANTS } from '@/types/game';

/** income(배달) 원천 — 맵마다 화물이 있는 곳이 다르다. 새 맵은 여기에 종류만 추가하고
 *  analyzer에서 그 종류의 기회 생성 로직을 한 번 구현하면, 모든 맵이 config로 켜고 끈다. */
export type IncomeSource = 'cityCubes' | 'trackCubes';

export interface MapAIConfig {
  /** AI가 올릴 엔진 레벨 상한 (룰북 상한이 아니라 맵 규모에 따른 전략적 상한) */
  engineMax: number;
  /** 게임 총 턴 수 (state.maxTurns에서 유도) */
  totalTurns: number;
  /** 턴당 기본 건설 가능 트랙 수 (Engineer 시 +1) */
  buildsPerTurn: number;
  /** 이 맵의 income 원천 목록 — 코드 일괄 적용 대신 맵별 주입 (맵 하드코딩 금지 원칙) */
  incomeSources: IncomeSource[];
}

/**
 * 맵별 전략 파라미터 오버라이드 테이블
 * 키가 없는 맵은 룰북 기본값을 사용
 */
const MAP_OVERRIDES: Record<string, Partial<MapAIConfig>> = {
  // 튜토리얼 맵: 7×5로 좁아 최장 배달 거리가 짧음 → 과도한 엔진 업그레이드는 비용 낭비
  tutorial: { engineMax: 3 },
  // St. Lucia: 화물이 도시가 아닌 트랙 위 큐브(헥스큐브 셋업)에 있음 → 트랙 큐브 배달도 income 원천
  'st-lucia': { incomeSources: ['cityCubes', 'trackCubes'] },
};

/**
 * 현재 게임 상태에서 AI 설정 유도
 */
export function getMapAIConfig(state: GameState): MapAIConfig {
  const override = MAP_OVERRIDES[state.mapId] ?? {};

  return {
    engineMax: override.engineMax ?? GAME_CONSTANTS.MAX_ENGINE,
    totalTurns: override.totalTurns ?? state.maxTurns,
    buildsPerTurn: override.buildsPerTurn ?? GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
    incomeSources: override.incomeSources ?? ['cityCubes'], // 기본: 화물이 도시 안에 있는 일반 맵
  };
}
