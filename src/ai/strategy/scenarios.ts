/**
 * AI 전략 시나리오 정의
 *
 * 튜토리얼 맵 기준 4개 전략 시나리오
 * 각 경로에 linkCount(예상 링크 수)와 minTurn(추진 최소 턴) 포함
 */

import { AIStrategy } from './types';

/**
 * Scenario 1: 북부 직행 (Northern Express)
 *
 * Pittsburgh ↔ Cleveland 직접 연결 (2링크)
 * - 초반 2링크 경로 집중
 * - 중반 이후 Columbus까지 확장 (3-4링크)
 */
export const NORTHERN_EXPRESS: AIStrategy = {
  name: 'northern_express',
  nameKo: '북부 직행',
  description: 'Pittsburgh-Cleveland 2링크 + Columbus 확장',
  targetRoutes: [
    // 초반: Pittsburgh ↔ Cleveland (2링크)
    { from: 'P', to: 'C', priority: 1, linkCount: 2, minTurn: 0 },
    { from: 'C', to: 'P', priority: 1, linkCount: 2, minTurn: 0 },
    // 중반: Cleveland → Columbus (3링크, 턴 3부터)
    { from: 'C', to: 'O', priority: 2, linkCount: 3, minTurn: 3 },
    // 후반: Pittsburgh → Columbus (3링크, 턴 4부터)
    { from: 'P', to: 'O', priority: 2, linkCount: 3, minTurn: 4 },
  ],
  requiredCash: 12,
  preferredActions: ['firstBuild', 'engineer', 'locomotive'],
  priority: 'speed',
  minEngineLevel: 2,
};

/**
 * Scenario 2: Columbus 중앙 허브 (Columbus Hub)
 *
 * Columbus를 중심으로 다방면 연결
 * - 초반: 2링크 경로 (P→O, C→O)
 * - 중반: 3링크 경로 (W→O)
 * - 후반: 4링크 장거리 (P→I, C→I)
 */
export const COLUMBUS_HUB: AIStrategy = {
  name: 'columbus_hub',
  nameKo: 'Columbus 중앙 허브',
  description: 'Columbus 중심 다방면 허브, 점진적 확장',
  targetRoutes: [
    // 초반: 2링크 경로
    { from: 'P', to: 'O', priority: 1, linkCount: 2, minTurn: 0 },
    { from: 'C', to: 'O', priority: 1, linkCount: 2, minTurn: 0 },
    // 중반: 3링크 경로 (턴 3부터)
    { from: 'W', to: 'O', priority: 2, linkCount: 3, minTurn: 3 },
    { from: 'I', to: 'O', priority: 2, linkCount: 2, minTurn: 3 },
    // 후반: 4링크 장거리 (턴 5부터)
    { from: 'P', to: 'I', priority: 3, linkCount: 4, minTurn: 5 },
    { from: 'C', to: 'I', priority: 3, linkCount: 4, minTurn: 5 },
  ],
  requiredCash: 16,
  preferredActions: ['engineer', 'locomotive', 'firstMove'],
  priority: 'income',
  minEngineLevel: 2,
};

/**
 * Scenario 3: 동부 장악 (Eastern Dominance)
 *
 * Pittsburgh-Wheeling 지역 집중
 * - 초반: P→W (2링크)
 * - 중반: P→O (3링크)
 * - 후반: W→O 연결 (4링크)
 */
export const EASTERN_DOMINANCE: AIStrategy = {
  name: 'eastern_dominance',
  nameKo: '동부 장악',
  description: 'Pittsburgh-Wheeling-Columbus 동부 네트워크',
  targetRoutes: [
    // 초반: 2링크 경로
    { from: 'P', to: 'W', priority: 1, linkCount: 2, minTurn: 0 },
    { from: 'W', to: 'P', priority: 1, linkCount: 2, minTurn: 0 },
    // 중반: 3링크 경로 (턴 3부터)
    { from: 'P', to: 'O', priority: 2, linkCount: 3, minTurn: 3 },
    { from: 'W', to: 'O', priority: 2, linkCount: 3, minTurn: 3 },
    // 후반: 4링크 경로 (턴 5부터)
    { from: 'P', to: 'C', priority: 3, linkCount: 2, minTurn: 4 },
    { from: 'W', to: 'C', priority: 3, linkCount: 4, minTurn: 5 },
  ],
  requiredCash: 18,
  preferredActions: ['engineer', 'locomotive', 'firstBuild'],
  priority: 'income',
  minEngineLevel: 3,
};

/**
 * Scenario 4: 서부 회랑 (Western Corridor)
 *
 * Cincinnati-Columbus 서부 라인
 * - 초반: I→O (2링크)
 * - 중반: O→C, O→P (3링크)
 * - 후반: I→P 대각선 (5링크)
 */
export const WESTERN_CORRIDOR: AIStrategy = {
  name: 'western_corridor',
  nameKo: '서부 회랑',
  description: 'Cincinnati-Columbus-Pittsburgh 서부 네트워크',
  targetRoutes: [
    // 초반: 2링크 경로
    { from: 'I', to: 'O', priority: 1, linkCount: 2, minTurn: 0 },
    { from: 'O', to: 'I', priority: 1, linkCount: 2, minTurn: 0 },
    // 중반: 3링크 경로 (턴 3부터)
    { from: 'O', to: 'C', priority: 2, linkCount: 3, minTurn: 3 },
    { from: 'O', to: 'P', priority: 2, linkCount: 3, minTurn: 3 },
    // 후반: 5링크 장거리 (턴 5부터)
    { from: 'I', to: 'P', priority: 3, linkCount: 5, minTurn: 5 },
    { from: 'I', to: 'C', priority: 3, linkCount: 4, minTurn: 5 },
  ],
  requiredCash: 20,
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
