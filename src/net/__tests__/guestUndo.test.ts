// 게스트 취소(undoLastAction) 회귀 테스트:
// ① 호스트 스택이 유효하면 게스트 undo intent가 실제로 되돌린다.
// ② 팬텀 취소 안전장치 — undoCount>0인데 스택이 비면(새로고침/호스트 승계) 되돌리지 않고 count만 0.
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { applyGameIntent } from '../intents';
import { clearUndo } from '@/store/helpers/undo';
import type { IntentMessage } from '../types';

function intent(seat: number, type: string): IntentMessage {
  return { id: `undo-${Math.random()}`, clientId: 'c', seat, type, payload: {} };
}

describe('게스트 취소(undoLastAction)', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['사람A', '사람B'], []);
  });

  it('호스트 스택이 유효하면 undo intent가 커밋 행동을 되돌린다', () => {
    const s = useGameStore.getState();
    const seat = s.activePlayers.indexOf(s.currentPlayer);
    const before = useGameStore.getState().players[s.currentPlayer].issuedShares;

    useGameStore.getState().issueShare(s.currentPlayer, 2);
    expect(useGameStore.getState().players[s.currentPlayer].issuedShares).toBe(before + 2);
    expect(useGameStore.getState().undoCount).toBeGreaterThan(0);

    const res = applyGameIntent(intent(seat, 'undoLastAction'));
    expect(res.ok).toBe(true);
    expect(useGameStore.getState().players[s.currentPlayer].issuedShares).toBe(before); // 되돌려짐
    expect(useGameStore.getState().undoCount).toBe(0);
  });

  it('팬텀 취소: undoCount>0인데 스택이 비면 되돌리지 않고 count만 0 (크래시 없음)', () => {
    // 새로고침/호스트 승계 후 상태: 스택은 비었는데 undoCount는 복원값이 남아 있는 상황을 재현.
    const s = useGameStore.getState();
    const seat = s.activePlayers.indexOf(s.currentPlayer);
    useGameStore.getState().issueShare(s.currentPlayer, 1);
    const sharesAfterCommit = useGameStore.getState().players[s.currentPlayer].issuedShares;

    clearUndo(); // 스택만 비움(메모리 유실 모사) — undoCount는 그대로 남김
    useGameStore.setState({ undoCount: 3 } as never); // 팬텀 카운트

    const res = applyGameIntent(intent(seat, 'undoLastAction'));
    expect(res.ok).toBe(true);
    // 스택이 비어 되돌리지 않는다(발행 주식 유지) — 대신 count가 0으로 자가 치유
    expect(useGameStore.getState().players[s.currentPlayer].issuedShares).toBe(sharesAfterCommit);
    expect(useGameStore.getState().undoCount).toBe(0);
  });
});
