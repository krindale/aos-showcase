/**
 * AI 전략 시나리오 정의
 *
 * 튜토리얼 맵 기준 4개 전략 시나리오
 */

import { AIStrategy } from './types';

/**
 * Scenario 1: 북부 직행 (Northern Express)
 *
 * Pittsburgh ↔ Cleveland 직접 연결
 * - 짧은 경로 (4-5 헥스)
 * - 빠른 수입 확보
 * - 초반 선점 유리
 */
export const NORTHERN_EXPRESS: AIStrategy = {
  name: 'northern_express',
  nameKo: '북부 직행',
  description: 'Pittsburgh와 Cleveland를 직접 연결하여 빠른 수입 확보',
  targetRoutes: [
    { from: 'P', to: 'C', priority: 1 },  // Pittsburgh → Cleveland
    { from: 'C', to: 'P', priority: 1 },  // Cleveland → Pittsburgh
  ],
  requiredCash: 10,  // 4-5 트랙 × $2
  preferredActions: ['firstBuild', 'engineer', 'locomotive'],
  priority: 'speed',
  minEngineLevel: 2,
};

/**
 * Scenario 2: Columbus 중앙 허브 (Columbus Hub)
 *
 * Columbus를 중심으로 다방면 연결
 * - 중앙 위치의 이점 활용
 * - 유연한 경로 선택 가능
 * - 여러 물품 배달 기회
 */
export const COLUMBUS_HUB: AIStrategy = {
  name: 'columbus_hub',
  nameKo: 'Columbus 중앙 허브',
  description: 'Columbus를 중심으로 다방면 배달 기회 확보',
  targetRoutes: [
    { from: 'P', to: 'O', priority: 1 },  // Pittsburgh → Columbus
    { from: 'C', to: 'O', priority: 1 },  // Cleveland → Columbus
    { from: 'W', to: 'O', priority: 2 },  // Wheeling → Columbus
    { from: 'I', to: 'O', priority: 2 },  // Cincinnati → Columbus
  ],
  requiredCash: 12,  // 6 트랙 × $2
  preferredActions: ['engineer', 'locomotive', 'firstMove'],
  priority: 'income',
  minEngineLevel: 2,
};

/**
 * Scenario 3: 동부 장악 (Eastern Dominance)
 *
 * Pittsburgh-Wheeling 지역 집중
 * - 긴 경로로 높은 수입
 * - Columbus 확장 가능
 * - 엔진 레벨 3 필요
 */
export const EASTERN_DOMINANCE: AIStrategy = {
  name: 'eastern_dominance',
  nameKo: '동부 장악',
  description: 'Pittsburgh에서 Wheeling/Columbus까지 동부 지역 장악',
  targetRoutes: [
    { from: 'P', to: 'W', priority: 1 },  // Pittsburgh → Wheeling
    { from: 'P', to: 'O', priority: 2 },  // Pittsburgh → Columbus
    { from: 'W', to: 'P', priority: 2 },  // Wheeling → Pittsburgh
  ],
  requiredCash: 14,  // 7 트랙 × $2
  preferredActions: ['engineer', 'locomotive', 'firstBuild'],
  priority: 'income',
  minEngineLevel: 3,
};

/**
 * Scenario 4: 서부 회랑 (Western Corridor)
 *
 * Cincinnati-Columbus 연결
 * - 서부 지역 장악
 * - 상대 확장 차단 가능
 * - Pittsburgh까지 확장 여지
 */
export const WESTERN_CORRIDOR: AIStrategy = {
  name: 'western_corridor',
  nameKo: '서부 회랑',
  description: 'Cincinnati와 Columbus를 연결하여 서부 지역 장악',
  targetRoutes: [
    { from: 'I', to: 'O', priority: 1 },  // Cincinnati → Columbus
    { from: 'O', to: 'I', priority: 1 },  // Columbus → Cincinnati
    { from: 'P', to: 'I', priority: 2 },  // Pittsburgh → Cincinnati
  ],
  requiredCash: 10,  // 5 트랙 × $2
  preferredActions: ['locomotive', 'firstMove', 'engineer'],
  priority: 'blocking',
  minEngineLevel: 2,
};

/**
 * 모든 전략 시나리오 배열
 */
export const ALL_SCENARIOS: AIStrategy[] = [
  NORTHERN_EXPRESS,
  COLUMBUS_HUB,
  EASTERN_DOMINANCE,
  WESTERN_CORRIDOR,
];

/**
 * 시나리오 이름으로 찾기
 */
export function getScenarioByName(name: string): AIStrategy | undefined {
  return ALL_SCENARIOS.find(s => s.name === name);
}
