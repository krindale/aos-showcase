/**
 * AI 전략 시스템 타입 정의
 */

import { SpecialAction, PlayerId, HexCoord, CubeColor } from '@/types/game';

/**
 * 배달 경로 정의
 */
export interface DeliveryRoute {
  from: string;       // 출발 도시 ID
  to: string;         // 목적지 도시 ID
  priority: number;   // 우선순위 (1 = 최우선, 3 = 후순위)
}

/**
 * 전략 우선순위 타입
 */
export type StrategyPriority = 'speed' | 'income' | 'blocking';

/**
 * AI 전략 시나리오 정의
 */
export interface AIStrategy {
  name: string;                           // 시나리오 ID
  nameKo: string;                         // 시나리오 한글명
  description: string;                    // 설명
  targetRoutes: DeliveryRoute[];          // 목표 배달 경로
  requiredCash: number;                   // 필요 현금 (트랙 건설 비용)
  preferredActions: SpecialAction[];      // 선호 행동
  priority: StrategyPriority;             // 전략 우선순위 타입
  minEngineLevel: number;                 // 최소 엔진 레벨
}

/**
 * 물품 배달 기회 분석 결과
 */
export interface DeliveryOpportunity {
  sourceCityId: string;           // 물품이 있는 도시 ID
  sourceCoord: HexCoord;          // 출발 좌표
  cubeColor: CubeColor;           // 물품 색상
  cubeIndex: number;              // 도시 내 큐브 인덱스
  targetCityId: string;           // 목적지 도시 ID
  targetCoord: HexCoord;          // 목적지 좌표
  distance: number;               // 헥스 거리
}

/**
 * 시나리오 평가 결과
 */
export interface ScenarioScore {
  scenario: AIStrategy;
  score: number;
  matchingCubes: number;          // 매칭되는 물품 수
  cashFeasible: boolean;          // 현금 충분 여부
  engineFeasible: boolean;        // 엔진 레벨 충분 여부
}

/**
 * AI 플레이어별 전략 상태
 */
export interface AIStrategyState {
  playerId: PlayerId;
  strategy: AIStrategy;
  selectedTurn: number;           // 전략 선택 턴
  routeProgress: Map<string, number>;  // 경로별 완성도 (0-1)
}

/**
 * 전략 실현 가능성 평가 결과
 */
export interface FeasibilityResult {
  score: number;                  // 0-100 점수
  blockedRoutes: string[];        // 차단된 경로
  noGoodsRoutes: string[];        // 물품 없는 경로
  cashShortage: number;           // 현금 부족액
}

/**
 * 전략 변경 임계값
 */
export const STRATEGY_SWITCH_THRESHOLD = 30;  // 이 점수 미만이면 전략 변경

/**
 * 경로 ID 생성 (출발지-목적지)
 */
export function getRouteId(route: DeliveryRoute): string {
  return `${route.from}-${route.to}`;
}
