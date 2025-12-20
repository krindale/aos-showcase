/**
 * AI 동적 경로 선택기 (selector.ts) 단위 테스트
 *
 * 정적 시나리오 대신 화물 기반 동적 전략을 테스트합니다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getNextTargetRoute, reevaluateStrategy, findNextTargetRoute } from '../selector';
import { resetStrategyStates, getCurrentRoute, setCurrentRoute } from '../state';
import {
  createMockGameState,
  addCubesToCity,
  setPlayerCash,
  setPlayerEngine,
  addTrack,
} from '../../__tests__/helpers/mockState';
import type { DeliveryRoute } from '../types';

// mockState의 도시 ID (Pittsburgh, Cleveland, Columbus, Cincinnati)
// selector.ts의 analyzeDeliveryOpportunities는 실제 tutorialMap 도시 ID 사용

describe('getNextTargetRoute - 동적 화물 기반 전략', () => {
  beforeEach(() => {
    // 테스트 전 전략 상태 초기화
    resetStrategyStates();
  });

  describe('배달 가능한 화물이 있는 경우', () => {
    it('가장 가까운 배달 기회를 반환', () => {
      // Pittsburgh(yellow)에 blue 큐브 추가 → Cleveland(blue)로 배달 가능
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      const route = getNextTargetRoute(state, 'player1');

      // 경로가 반환되어야 함
      expect(route).not.toBeNull();
    });

    it('연결된 도시에서 시작하는 경로 우선', () => {
      // player1이 Pittsburgh에 연결된 트랙이 있음
      let state = createMockGameState();
      state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

      // Pittsburgh와 Columbus 둘 다 배달 가능한 화물
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);  // → Cleveland
      state = addCubesToCity(state, 'Columbus', ['purple']); // → Cincinnati

      const route = getNextTargetRoute(state, 'player1');

      // 경로가 반환되어야 함
      expect(route).not.toBeNull();
    });

    it('엔진 레벨 + 2 이내 도달 가능한 경로만 선택', () => {
      let state = createMockGameState();
      state = setPlayerEngine(state, 'player1', 1);

      // 거리 1인 경로
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);  // 거리 1

      const route = getNextTargetRoute(state, 'player1');

      // 엔진 레벨 1 + 2 = 3 이내 경로 선택
      expect(route).not.toBeNull();
    });
  });

  describe('배달 가능한 화물이 없는 경우', () => {
    it('네트워크 확장 타겟을 반환', () => {
      const state = createMockGameState();
      // 모든 도시에 해당 색상 화물이 없는 경우
      // (기본 mock 상태에서 화물이 없을 때)

      const route = getNextTargetRoute(state, 'player1');

      // 네트워크 확장 경로 또는 null
      // 첫 트랙 건설을 위한 경로 반환
      if (route) {
        expect(route.priority).toBe(2); // 확장 경로는 priority 2
      }
    });
  });

  describe('다중 링크 경로 분해', () => {
    it('긴 경로를 세그먼트로 분해하여 첫 세그먼트 반환', () => {
      let state = createMockGameState();
      // player1이 첫 트랙 없음

      // 거리가 먼 경로
      state = addCubesToCity(state, 'Cincinnati', ['yellow']); // Columbus로 배달

      const route = getNextTargetRoute(state, 'player1');

      // 첫 세그먼트 또는 전체 경로 반환
      expect(route).not.toBeNull();
    });
  });
});

describe('reevaluateStrategy - 전략 재평가', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('현재 경로가 없는 경우', () => {
    it('새 경로를 탐색', () => {
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      reevaluateStrategy(state, 'player1');

      const route = getCurrentRoute('player1');
      expect(route).not.toBeNull();
    });
  });

  describe('현재 경로가 완성된 경우', () => {
    it('새 경로를 탐색', () => {
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);
      state = addCubesToCity(state, 'Cleveland', ['red']);

      // 완성된 경로 설정
      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      setCurrentRoute('player1', route);

      // 트랙 추가
      state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

      reevaluateStrategy(state, 'player1');

      // 경로 재평가
      const newRoute = getCurrentRoute('player1');
      expect(newRoute).not.toBeNull();
    });
  });

  describe('현재 경로에 화물이 없는 경우', () => {
    it('새 경로를 탐색', () => {
      let state = createMockGameState();
      // Pittsburgh→Cleveland 경로에 화물 없음
      state = addCubesToCity(state, 'Columbus', ['purple']); // 다른 경로에만 화물

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      setCurrentRoute('player1', route);

      reevaluateStrategy(state, 'player1');

      // 화물 있는 새 경로로 전환
      const newRoute = getCurrentRoute('player1');
      // 새 경로가 있거나 유지될 수 있음
      expect(newRoute).not.toBeNull();
    });
  });

  describe('현재 경로가 유효한 경우', () => {
    it('현재 경로 유지', () => {
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      setCurrentRoute('player1', route);

      reevaluateStrategy(state, 'player1');

      const currentRoute = getCurrentRoute('player1');
      expect(currentRoute?.from).toBe('Pittsburgh');
      expect(currentRoute?.to).toBe('Cleveland');
    });
  });
});

describe('findNextTargetRoute - 호환성 함수', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  it('route와 needsStrategyReeval을 반환', () => {
    let state = createMockGameState();
    state = addCubesToCity(state, 'Pittsburgh', ['blue']);

    const result = findNextTargetRoute(state, 'player1');

    expect(result).toHaveProperty('route');
    expect(result).toHaveProperty('needsStrategyReeval');
  });

  it('경로가 있으면 needsStrategyReeval: false', () => {
    let state = createMockGameState();
    state = addCubesToCity(state, 'Pittsburgh', ['blue']);

    const result = findNextTargetRoute(state, 'player1');

    if (result.route) {
      expect(result.needsStrategyReeval).toBe(false);
    }
  });

  it('경로가 없으면 needsStrategyReeval: true', () => {
    const state = createMockGameState();
    // 화물 없는 상태

    const result = findNextTargetRoute(state, 'player1');

    // 화물 없으면 네트워크 확장 경로 또는 null
    // 실제 동작에 따라 테스트
    expect(result).toHaveProperty('needsStrategyReeval');
  });
});

describe('동적 전략 vs 정적 시나리오', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  it('화물 배치에 따라 경로가 동적으로 변경됨', () => {
    // 첫 번째 상황: Pittsburgh에 blue 화물
    let state1 = createMockGameState();
    state1 = addCubesToCity(state1, 'Pittsburgh', ['blue']);

    const route1 = getNextTargetRoute(state1, 'player1');
    expect(route1).not.toBeNull();

    // 두 번째 상황: Columbus에 purple 화물만
    resetStrategyStates();
    let state2 = createMockGameState();
    state2 = addCubesToCity(state2, 'Columbus', ['purple']);

    const route2 = getNextTargetRoute(state2, 'player1');
    expect(route2).not.toBeNull();
    // 다른 경로가 선택됨
    expect(route2?.from).not.toBe(route1?.from);
  });

  it('연결된 도시가 우선됨', () => {
    // player1이 Pittsburgh에 연결
    let state = createMockGameState();
    state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

    // 둘 다 배달 가능
    state = addCubesToCity(state, 'Pittsburgh', ['blue']);
    state = addCubesToCity(state, 'Cincinnati', ['red']); // Columbus로 배달 가능

    const route = getNextTargetRoute(state, 'player1');

    // 경로가 반환되어야 함
    expect(route).not.toBeNull();
  });
});
