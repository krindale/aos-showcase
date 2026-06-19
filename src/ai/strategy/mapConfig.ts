/**
 * 맵별 AI 설정 (MapAIConfig)
 *
 * AI 의사결정 로직이 "tutorial이면 엔진 3" 같은 맵 분기를 직접 갖지 않도록,
 * 맵별 파라미터를 MapProfile(클래스)에서 유도한다.
 * 새 맵 추가 시 AI 코드 수정 없이 MapProfile 서브클래스만 추가하면 된다.
 *
 * (이 모듈은 기존 호출처 호환을 위한 얇은 어댑터 — 실제 맵별 값은 getMapProfile이 보유)
 */

import { GameState } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import type { IncomeSource } from '@/maps/MapProfile';

export type { IncomeSource };

export interface MapAIConfig {
  /** AI가 올릴 엔진 레벨 상한 (룰북 상한이 아니라 맵 규모에 따른 전략적 상한) */
  engineMax: number;
  /** 게임 총 턴 수 (state.maxTurns에서 유도) */
  totalTurns: number;
  /** 턴당 기본 건설 가능 트랙 수 (Engineer 시 +1) */
  buildsPerTurn: number;
  /** 이 맵의 income 원천 목록 (도시 큐브 / 트랙 큐브 등) */
  incomeSources: IncomeSource[];
}

/**
 * 현재 게임 상태에서 AI 설정 유도 (MapProfile에 위임)
 */
export function getMapAIConfig(state: GameState): MapAIConfig {
  const profile = getMapProfile(state.mapId);
  return {
    engineMax: profile.engineMax,
    totalTurns: state.maxTurns,
    buildsPerTurn: profile.buildsPerTurn,
    incomeSources: profile.incomeSources,
  };
}
