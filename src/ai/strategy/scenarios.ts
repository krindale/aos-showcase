/**
 * @deprecated 정적 시나리오는 더 이상 사용되지 않습니다.
 *
 * AI는 이제 analyzeDeliveryOpportunities()를 사용하여
 * 실제 화물 배치를 기반으로 동적으로 경로를 선택합니다.
 *
 * 이 파일은 호환성을 위해 유지되지만, 새 코드에서는 사용하지 마세요.
 *
 * @see src/ai/strategy/selector.ts - getNextTargetRoute()
 * @see src/ai/strategy/analyzer.ts - analyzeDeliveryOpportunities()
 */

import { DeliveryRoute } from './types';

/**
 * @deprecated AIStrategy 타입 - 동적 전략에서는 사용하지 않음
 */
export interface AIStrategy {
  name: string;
  nameKo: string;
  description: string;
  targetRoutes: DeliveryRoute[];
  requiredCash: number;
  preferredActions: string[];
  priority: 'speed' | 'income' | 'blocking';
  minEngineLevel: number;
}

/**
 * @deprecated 정적 시나리오 - 더 이상 사용되지 않음
 *
 * AI는 이제 실제 화물 배치를 분석하여 최적 경로를 선택합니다.
 * 이 시나리오들은 참고용으로만 남겨두었습니다.
 */
export const NORTHERN_EXPRESS: AIStrategy = {
  name: 'northern_express',
  nameKo: '북부 직행 (deprecated)',
  description: 'Pittsburgh와 Cleveland를 직접 연결 - 더 이상 사용되지 않음',
  targetRoutes: [
    { from: 'P', to: 'C', priority: 1 },
    { from: 'C', to: 'P', priority: 1 },
  ],
  requiredCash: 10,
  preferredActions: ['firstBuild', 'engineer', 'locomotive'],
  priority: 'speed',
  minEngineLevel: 2,
};

export const COLUMBUS_HUB: AIStrategy = {
  name: 'columbus_hub',
  nameKo: 'Columbus 중앙 허브 (deprecated)',
  description: 'Columbus를 중심으로 다방면 배달 - 더 이상 사용되지 않음',
  targetRoutes: [
    { from: 'P', to: 'O', priority: 1 },
    { from: 'C', to: 'O', priority: 1 },
    { from: 'W', to: 'O', priority: 2 },
    { from: 'I', to: 'O', priority: 2 },
  ],
  requiredCash: 12,
  preferredActions: ['engineer', 'locomotive', 'firstMove'],
  priority: 'income',
  minEngineLevel: 2,
};

export const EASTERN_DOMINANCE: AIStrategy = {
  name: 'eastern_dominance',
  nameKo: '동부 장악 (deprecated)',
  description: 'Pittsburgh에서 Wheeling/Columbus까지 - 더 이상 사용되지 않음',
  targetRoutes: [
    { from: 'P', to: 'W', priority: 1 },
    { from: 'P', to: 'O', priority: 2 },
    { from: 'W', to: 'P', priority: 2 },
  ],
  requiredCash: 14,
  preferredActions: ['engineer', 'locomotive', 'firstBuild'],
  priority: 'income',
  minEngineLevel: 3,
};

export const WESTERN_CORRIDOR: AIStrategy = {
  name: 'western_corridor',
  nameKo: '서부 회랑 (deprecated)',
  description: 'Cincinnati와 Columbus를 연결 - 더 이상 사용되지 않음',
  targetRoutes: [
    { from: 'I', to: 'O', priority: 1 },
    { from: 'O', to: 'I', priority: 1 },
    { from: 'P', to: 'I', priority: 2 },
  ],
  requiredCash: 10,
  preferredActions: ['locomotive', 'firstMove', 'engineer'],
  priority: 'blocking',
  minEngineLevel: 2,
};

/**
 * @deprecated 정적 시나리오 배열 - 더 이상 사용되지 않음
 */
export const ALL_SCENARIOS: AIStrategy[] = [
  NORTHERN_EXPRESS,
  COLUMBUS_HUB,
  EASTERN_DOMINANCE,
  WESTERN_CORRIDOR,
];

/**
 * @deprecated 시나리오 이름으로 찾기 - 더 이상 사용되지 않음
 */
export function getScenarioByName(name: string): AIStrategy | undefined {
  return ALL_SCENARIOS.find(s => s.name === name);
}
