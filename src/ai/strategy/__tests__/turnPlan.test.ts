/**
 * turnPlan.ts (턴 계획) 단위 테스트
 *
 * 검증 항목:
 * 1. ensureTurnPlan: 같은 턴이면 재사용, 턴이 바뀌면 재생성
 * 2. 경로 기반 tracksNeeded / buildBudget / cashNeeded 계산
 * 3. invalidateTurnPlan 후 재생성
 * 4. 게임 리셋(clearTurnPlans) 후 이전 게임 계획이 재사용되지 않음
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockGameState,
  createMockCity,
  createMockBoard,
} from '../../__tests__/helpers/mockState';
import {
  ensureTurnPlan,
  refreshTurnPlan,
  invalidateTurnPlan,
  clearTurnPlans,
} from '../turnPlan';
import { clearCurrentRoutes } from '../state';
import { clearPathCache } from '../analyzer';
import { GameState } from '@/types/game';

/** 배달 기회가 있는 간단한 상태: Cleveland(blue)에 yellow 큐브 → Pittsburgh(yellow) */
function createStateWithRoute(): GameState {
  const cities = [
    createMockCity('Pittsburgh', 'yellow', { col: 4, row: 0 }),
    createMockCity('Cleveland', 'blue', { col: 1, row: 1 }, ['yellow']),
    createMockCity('Columbus', 'red', { col: 2, row: 3 }),
    createMockCity('Cincinnati', 'purple', { col: 0, row: 4 }),
  ];
  return createMockGameState({
    currentPhase: 'issueShares',
    currentTurn: 1,
    board: createMockBoard(cities),
  });
}

describe('turnPlan.ts — 턴 계획', () => {
  beforeEach(() => {
    clearTurnPlans();
    clearCurrentRoutes();
    clearPathCache();
  });

  it('경로가 있으면 tracksNeeded와 비용이 양수로 계산된다', () => {
    const state = createStateWithRoute();
    const plan = refreshTurnPlan(state, 'player1');

    expect(plan.targetRoute).not.toBeNull();
    expect(plan.fullPath).not.toBeNull();
    expect(plan.tracksNeeded).toBeGreaterThan(0);
    expect(plan.totalBuildCost).toBeGreaterThan(0);
    expect(plan.buildBudget).toBeGreaterThan(0);
    // cashNeeded = 건설 예산 + 운영비(주식2+엔진1=3) + 경매 예비금(2)
    expect(plan.cashNeeded).toBe(plan.buildBudget + 3 + 2);
    expect(plan.routeLinks).toBeGreaterThanOrEqual(1);
  });

  it('같은 턴이면 ensureTurnPlan이 기존 계획을 재사용한다', () => {
    const state = createStateWithRoute();
    const plan1 = ensureTurnPlan(state, 'player1');
    const plan2 = ensureTurnPlan(state, 'player1');
    expect(plan2).toBe(plan1); // 동일 객체
  });

  it('턴이 바뀌면 자동으로 재생성된다', () => {
    const state = createStateWithRoute();
    const plan1 = ensureTurnPlan(state, 'player1');

    const nextTurnState = { ...state, currentTurn: 2 };
    const plan2 = ensureTurnPlan(nextTurnState, 'player1');

    expect(plan2).not.toBe(plan1);
    expect(plan2.turn).toBe(2);
  });

  it('invalidateTurnPlan 후 ensureTurnPlan이 재생성한다', () => {
    const state = createStateWithRoute();
    const plan1 = ensureTurnPlan(state, 'player1');
    invalidateTurnPlan('player1', '테스트');
    const plan2 = ensureTurnPlan(state, 'player1');
    expect(plan2).not.toBe(plan1);
  });

  it('clearTurnPlans 후 이전 게임의 계획이 재사용되지 않는다 (게임 리셋)', () => {
    const state = createStateWithRoute();
    const plan1 = ensureTurnPlan(state, 'player1');

    clearTurnPlans(); // 게임 리셋 (AIPlayerManager.clear/resetAll에서 호출)

    const plan2 = ensureTurnPlan(state, 'player1');
    expect(plan2).not.toBe(plan1);
  });

  it('플레이어별로 독립된 계획을 가진다', () => {
    const state = createStateWithRoute();
    const p1 = ensureTurnPlan(state, 'player1');
    const p2 = ensureTurnPlan(state, 'player2');
    expect(p1.playerId).toBe('player1');
    expect(p2.playerId).toBe('player2');
    expect(p1).not.toBe(p2);
  });

  it('배달 기회가 없으면 경로 없는 계획 (기본 운영 예산만)', () => {
    const state = createMockGameState({
      currentPhase: 'issueShares',
      currentTurn: 1,
    }); // 큐브 없음

    const plan = refreshTurnPlan(state, 'player1');
    // 경로가 없거나(null) 네트워크 확장 목표일 수 있음 — cashNeeded는 항상 양수
    expect(plan.cashNeeded).toBeGreaterThan(0);
  });
});
