/**
 * AI 전략 시스템 타입 정의
 */

import { HexCoord, CubeColor } from '@/types/game';

/**
 * 배달 경로 정의
 */
export interface DeliveryRoute {
  from: string;       // 출발 도시 ID
  to: string;         // 목적지 도시 ID
  priority: number;   // 우선순위 (1 = 최우선, 3 = 후순위)
  overallTo?: string; // 전체 경로의 최종 목적지 (세그먼트 분해 시 원래 목적지 보존)
}

/**
 * 동적 전략 타입 (화물 기반)
 * 정적 시나리오 대신 동적으로 경로를 선택
 */
export interface DynamicStrategy {
  name: string;                  // 전략 ID (예: 'dynamic')
  nameKo: string;                // 전략 한글명
  targetRoutes: DeliveryRoute[]; // 현재 목표 경로
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
 * 경로 탐색 결과 (순수 함수용)
 */
export interface RouteSearchResult {
  route: DeliveryRoute | null;
  needsStrategyReeval: boolean;
  reason?: 'no_strategy' | 'all_routes_exhausted' | 'no_goods';
}
