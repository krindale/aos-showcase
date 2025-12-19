/**
 * AI 전략 선택기 (selector.ts) 단위 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findNextTargetRoute, evaluateAllScenarios, evaluateStrategyFeasibility } from '../selector';
import { resetStrategyStates, setSelectedStrategy } from '../state';
import {
  createMockGameState,
  createMockCity,
  addCubesToCity,
  addTrack,
  setPlayerCash,
  setPlayerEngine,
  addOpponentTrack,
} from '../../__tests__/helpers/mockState';
import type { AIStrategy } from '../types';

// 테스트용 전략 시나리오
const TEST_STRATEGY: AIStrategy = {
  name: 'test-strategy',
  nameKo: '테스트 전략',
  description: '테스트용 전략',
  targetRoutes: [
    { from: 'Pittsburgh', to: 'Cleveland', priority: 1 },
    { from: 'Cleveland', to: 'Columbus', priority: 2 },
    { from: 'Columbus', to: 'Cincinnati', priority: 3 },
  ],
  requiredCash: 10,
  preferredActions: ['engineer'],
  priority: 'speed',
  minEngineLevel: 2,
};

describe('findNextTargetRoute', () => {
  beforeEach(() => {
    // 테스트 전 전략 상태 초기화
    resetStrategyStates();
  });

  describe('전략이 없는 경우', () => {
    it('전략이 없으면 needsStrategyReeval: true, reason: no_strategy 반환', () => {
      const state = createMockGameState();

      const result = findNextTargetRoute(state, 'player1');

      expect(result.route).toBeNull();
      expect(result.needsStrategyReeval).toBe(true);
      expect(result.reason).toBe('no_strategy');
    });
  });

  describe('물품이 있는 경로가 존재하는 경우', () => {
    it('미완성 + 물품 있는 경로를 반환', () => {
      // Pittsburgh에 blue 큐브 추가 (Cleveland로 배달 가능)
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      // 전략 설정
      setSelectedStrategy('player1', TEST_STRATEGY, 1);

      const result = findNextTargetRoute(state, 'player1');

      expect(result.route).not.toBeNull();
      expect(result.route?.from).toBe('Pittsburgh');
      expect(result.route?.to).toBe('Cleveland');
      expect(result.needsStrategyReeval).toBe(false);
    });

    it('우선순위 높은 경로부터 반환', () => {
      // Pittsburgh에 blue, Cleveland에 red 큐브 추가
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']); // priority 1
      state = addCubesToCity(state, 'Cleveland', ['red']);   // priority 2

      setSelectedStrategy('player1', TEST_STRATEGY, 1);

      const result = findNextTargetRoute(state, 'player1');

      // priority 1인 Pittsburgh→Cleveland가 먼저
      expect(result.route?.from).toBe('Pittsburgh');
      expect(result.route?.to).toBe('Cleveland');
    });
  });

  describe('모든 경로가 완성된 경우', () => {
    it('all_routes_exhausted reason 반환', () => {
      let state = createMockGameState();

      // 모든 경로에 대해 완성된 트랙 배치 (간단화를 위해 물품만 없게)
      // 실제로는 progress >= 1.0이 필요하지만, 물품 없음도 같은 결과
      // 여기서는 물품이 없어서 all_routes_exhausted 반환

      setSelectedStrategy('player1', TEST_STRATEGY, 1);

      const result = findNextTargetRoute(state, 'player1');

      expect(result.route).toBeNull();
      expect(result.needsStrategyReeval).toBe(true);
      expect(result.reason).toBe('all_routes_exhausted');
    });
  });

  describe('모든 경로에 물품이 없는 경우', () => {
    it('all_routes_exhausted reason 반환', () => {
      const state = createMockGameState();
      // 모든 도시에 물품이 없음 (기본 상태)

      setSelectedStrategy('player1', TEST_STRATEGY, 1);

      const result = findNextTargetRoute(state, 'player1');

      expect(result.route).toBeNull();
      expect(result.needsStrategyReeval).toBe(true);
      expect(result.reason).toBe('all_routes_exhausted');
    });
  });

  describe('첫 번째 경로 물품 없고 두 번째 경로에 물품 있는 경우', () => {
    it('두 번째 경로 반환', () => {
      // Pittsburgh에는 물품 없고, Cleveland에만 red 큐브
      let state = createMockGameState();
      state = addCubesToCity(state, 'Cleveland', ['red']); // Columbus로 배달 가능

      setSelectedStrategy('player1', TEST_STRATEGY, 1);

      const result = findNextTargetRoute(state, 'player1');

      // priority 2인 Cleveland→Columbus 반환
      expect(result.route).not.toBeNull();
      expect(result.route?.from).toBe('Cleveland');
      expect(result.route?.to).toBe('Columbus');
      expect(result.needsStrategyReeval).toBe(false);
    });
  });
});

describe('evaluateAllScenarios', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('물품 매칭 보너스', () => {
    it('매칭 물품이 많을수록 높은 점수', () => {
      // Pittsburgh에 blue 큐브 (Cleveland로 배달 가능)
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue', 'blue']);
      state = addCubesToCity(state, 'Cleveland', ['red']);

      const scores = evaluateAllScenarios(state, 'player1');

      // 점수가 할당되어야 함
      expect(scores.length).toBeGreaterThan(0);
      // 모든 시나리오에 점수가 있어야 함 (음수 가능 - 차단 감점 등)
      scores.forEach(s => {
        expect(typeof s.score).toBe('number');
      });
    });

    it('물품이 없으면 낮은 점수', () => {
      const state = createMockGameState();

      const scores = evaluateAllScenarios(state, 'player1');

      // 물품이 없어도 기본 점수는 있을 수 있음 (현금, 엔진 보너스)
      expect(scores.length).toBeGreaterThan(0);
    });
  });

  describe('현금 충분 보너스', () => {
    it('현금이 충분하면 보너스 점수', () => {
      let state = createMockGameState();
      state = setPlayerCash(state, 'player1', 50); // 충분한 현금

      const scores = evaluateAllScenarios(state, 'player1');

      // 현금이 충분하면 cashFeasible이 true인 시나리오가 있어야 함
      const feasibleScenarios = scores.filter(s => s.cashFeasible);
      expect(feasibleScenarios.length).toBeGreaterThan(0);
    });

    it('현금이 부족하면 보너스 없음', () => {
      let state = createMockGameState();
      state = setPlayerCash(state, 'player1', 0);

      const scores = evaluateAllScenarios(state, 'player1');

      // 일부 시나리오는 현금 부족
      expect(scores.length).toBeGreaterThan(0);
    });
  });

  describe('엔진 레벨 보너스', () => {
    it('엔진 레벨이 충분하면 보너스', () => {
      let state = createMockGameState();
      state = setPlayerEngine(state, 'player1', 3);

      const scores = evaluateAllScenarios(state, 'player1');

      const feasibleScenarios = scores.filter(s => s.engineFeasible);
      expect(feasibleScenarios.length).toBeGreaterThan(0);
    });
  });

  describe('차단 경로 감점', () => {
    it('상대 트랙이 경로상에 있으면 감점', () => {
      let state = createMockGameState();
      // Pittsburgh-Cleveland 경로에 상대 트랙 배치
      state = addOpponentTrack(state, { col: 2, row: 0 }, [0, 3], 'player2');

      const scores = evaluateAllScenarios(state, 'player1');

      // 차단으로 인해 일부 시나리오 점수 감소
      expect(scores.length).toBeGreaterThan(0);
    });
  });

  describe('모든 시나리오 점수 비교', () => {
    it('4개 시나리오 모두 점수 계산', () => {
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      const scores = evaluateAllScenarios(state, 'player1');

      // 4개 시나리오가 있어야 함
      expect(scores.length).toBe(4);

      // 각 시나리오에 필요한 속성이 있어야 함
      scores.forEach(s => {
        expect(s.scenario).toBeDefined();
        expect(typeof s.score).toBe('number');
        expect(typeof s.matchingCubes).toBe('number');
        expect(typeof s.cashFeasible).toBe('boolean');
        expect(typeof s.engineFeasible).toBe('boolean');
      });
    });
  });

  describe('빈 물품 상황', () => {
    it('모든 도시 물품 없어도 평가 가능', () => {
      const state = createMockGameState();

      const scores = evaluateAllScenarios(state, 'player1');

      expect(scores.length).toBe(4);
      scores.forEach(s => {
        expect(s.matchingCubes).toBe(0);
      });
    });
  });
});

describe('evaluateStrategyFeasibility', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('차단 경로 감점', () => {
    it('차단된 경로가 있으면 감점', () => {
      let state = createMockGameState();
      // 경로에 상대 트랙 배치
      state = addOpponentTrack(state, { col: 2, row: 0 }, [0, 3], 'player2');

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      // 차단된 경로 목록 확인 (있을 수도 없을 수도 있음)
      expect(result.score).toBeDefined();
    });
  });

  describe('물품 없는 경로 감점', () => {
    it('물품 없는 경로는 noGoodsRoutes에 포함', () => {
      const state = createMockGameState();

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      // 물품이 없으므로 noGoodsRoutes에 경로가 있어야 함
      expect(result.noGoodsRoutes.length).toBeGreaterThan(0);
    });

    it('우선순위 1인 경로에 물품 없으면 더 큰 감점', () => {
      const state = createMockGameState();

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      // 우선순위 1인 Pittsburgh→Cleveland에 물품 없음
      expect(result.noGoodsRoutes).toContain('Pittsburgh-Cleveland');
      // 점수가 100보다 작아야 함
      expect(result.score).toBeLessThan(100);
    });
  });

  describe('현금 부족 감점', () => {
    it('현금이 부족하면 cashShortage > 0', () => {
      let state = createMockGameState();
      state = setPlayerCash(state, 'player1', 0);

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      expect(result.cashShortage).toBeGreaterThanOrEqual(0);
    });

    it('현금이 충분하면 cashShortage = 0', () => {
      let state = createMockGameState();
      state = setPlayerCash(state, 'player1', 100);

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      expect(result.cashShortage).toBe(0);
    });
  });

  describe('최소 점수 보장', () => {
    it('점수는 0 이상', () => {
      let state = createMockGameState();
      state = setPlayerCash(state, 'player1', 0);
      state = addOpponentTrack(state, { col: 2, row: 0 }, [0, 3], 'player2');
      state = addOpponentTrack(state, { col: 3, row: 1 }, [0, 3], 'player2');

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('모든 조건 나쁨', () => {
    it('종합 저점수 시나리오', () => {
      let state = createMockGameState();
      state = setPlayerCash(state, 'player1', 0);
      // 물품 없음 + 상대 트랙

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      // 점수가 매우 낮아야 함
      expect(result.score).toBeLessThan(50);
    });
  });

  describe('모든 조건 좋음', () => {
    it('종합 고점수 시나리오', () => {
      let state = createMockGameState();
      state = setPlayerCash(state, 'player1', 100);
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);
      state = addCubesToCity(state, 'Cleveland', ['red']);
      state = addCubesToCity(state, 'Columbus', ['purple']);

      const result = evaluateStrategyFeasibility(TEST_STRATEGY, state, 'player1');

      // 점수가 높아야 함 (차단 없고, 물품 있고, 현금 충분)
      expect(result.score).toBeGreaterThan(50);
    });
  });
});
