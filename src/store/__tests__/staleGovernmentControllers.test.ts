/**
 * governmentControllers 타 맵 누출 회귀 테스트
 *
 * 버그: createInitialGameState가 governmentControllers를 몬트리올일 때만 키에
 * 포함시켰는데, initGame의 zustand set()은 얕은 병합이라 몬트리올 게임 뒤에
 * 다른 맵을 시작하면 3인 관리자 배열이 새 게임 상태에 그대로 남았다.
 * → 2인 맵(St.Lucia)에서 TurnTrack이 존재하지 않는 player3의 .color를 읽다 크래시.
 *
 * 시나리오:
 * 1. 몬트리올 게임에서는 governmentControllers가 세팅된다
 * 2. 몬트리올 → St.Lucia 연속 initGame 시 governmentControllers가 남지 않는다
 */

import { describe, it, expect } from 'vitest';
import { useGameStore } from '../gameStore';

describe('governmentControllers 타 맵 누출 (얕은 병합)', () => {
  it('몬트리올 게임은 governmentControllers를 세팅한다', () => {
    useGameStore.getState().initGame('montreal', ['A', 'B', 'C']);

    const state = useGameStore.getState();
    expect(state.governmentControllers).toBeDefined();
    expect(state.governmentControllers).toHaveLength(3);
    // 관리자 순번은 첫 턴 순서 스냅샷 — 전원이 실제 플레이어여야 한다
    for (const pid of state.governmentControllers!) {
      expect(state.players[pid]).toBeDefined();
    }
  });

  it('몬트리올 → St.Lucia 연속 initGame 시 governmentControllers가 남지 않는다', () => {
    useGameStore.getState().initGame('montreal', ['A', 'B', 'C']);
    expect(useGameStore.getState().governmentControllers).toHaveLength(3);

    // 얕은 병합 누출 지점: 새 게임 상태에 키가 없으면 이전 값이 살아남는다
    useGameStore.getState().initGame('st-lucia', ['A', 'B']);

    const state = useGameStore.getState();
    expect(state.governmentControllers).toBeUndefined();
  });

  it('몬트리올 → 튜토리얼(표준 맵)도 동일하게 정리된다', () => {
    useGameStore.getState().initGame('montreal', ['A', 'B', 'C']);
    useGameStore.getState().initGame('tutorial', ['A', 'B']);

    expect(useGameStore.getState().governmentControllers).toBeUndefined();
  });
});
