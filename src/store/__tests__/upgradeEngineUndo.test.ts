/**
 * 수송 단계 엔진 업그레이드 실행 취소 (2026-07-14 사용자 요청)
 *
 * 엔진 업그레이드는 "물품 이동 대신" 쓰는 수송 기회라, 잘못 누르면 그 턴 이동을 통째로
 * 날린다 → captureUndo로 실행 취소 대상에 포함 (undoLastAction이 엔진 레벨과
 * playerMoves/engineUpgradedThisTurn 플래그를 함께 복원해 이동으로 바꿀 수 있어야 한다).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';

describe('수송 단계 엔진 업그레이드 실행 취소', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['Player1', 'Player2']);
    useGameStore.setState({
      currentPhase: 'moveGoods',
      currentPlayer: 'player1',
    });
  });

  it('업그레이드 후 undoCount 증가, 실행 취소 시 레벨·이동 플래그 복원', () => {
    const before = useGameStore.getState();
    const beforeLevel = before.players.player1.engineLevel;
    expect(before.undoCount).toBe(0);

    useGameStore.getState().upgradeEngine();
    const after = useGameStore.getState();
    expect(after.players.player1.engineLevel).toBe(beforeLevel + 1);
    expect(after.phaseState.playerMoves.player1).toBe(true);
    expect(after.phaseState.engineUpgradedThisTurn?.player1).toBe(true);
    expect(after.undoCount).toBe(1);

    useGameStore.getState().undoLastAction();
    const undone = useGameStore.getState();
    expect(undone.players.player1.engineLevel).toBe(beforeLevel);
    expect(undone.phaseState.playerMoves.player1).toBeFalsy();
    expect(undone.phaseState.engineUpgradedThisTurn?.player1).toBeFalsy();
    expect(undone.undoCount).toBe(0);
  });

  it('AI 차례의 엔진 업그레이드는 실행 취소 대상이 아님 (undoCount 불변)', () => {
    useGameStore.setState((s) => ({
      currentPlayer: 'player2',
      players: { ...s.players, player2: { ...s.players.player2, isAI: true } },
    }));
    useGameStore.getState().upgradeEngine();
    expect(useGameStore.getState().players.player2.engineLevel).toBe(2);
    expect(useGameStore.getState().undoCount).toBe(0); // 스냅샷도 카운트도 없음 (팬텀 취소 방지)
    useGameStore.getState().undoLastAction();
    expect(useGameStore.getState().players.player2.engineLevel).toBe(2);
  });
});
