/**
 * Germany 도시 직결 링크(Essen↔Düsseldorf $2) 건설 동작 검증.
 * UI 클릭이 buildDirectLink에 도달하면 실제로 건설/환불/소유가 되는지(엔진 로직) 확인.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';

describe('Germany 도시 직결 링크 건설', () => {
  beforeEach(() => {
    const s = createInitialGameState('germany', ['A', 'B', 'C', 'D'], []);
    useGameStore.setState({ ...s, currentPhase: 'buildTrack' });
  });

  it('buildTrack 단계에서 essen↔duesseldorf 직결을 $2에 건설하고 소유자가 기록된다', () => {
    const before = useGameStore.getState().board.directLinks?.[0];
    expect(before).toBeDefined();
    expect(before?.owner).toBe(null);

    const cp = useGameStore.getState().currentPlayer;
    // 현금 보장
    useGameStore.setState((st) => ({
      players: { ...st.players, [cp]: { ...st.players[cp], cash: 20 } },
    }));
    const cashBefore = useGameStore.getState().players[cp].cash;

    const ok = useGameStore.getState().buildDirectLink('essen', 'duesseldorf');
    expect(ok).toBe(true);

    const link = useGameStore.getState().board.directLinks?.[0];
    expect(link?.owner).toBe(cp);
    expect(useGameStore.getState().players[cp].cash).toBe(cashBefore - 2); // $2 차감
    expect(useGameStore.getState().phaseState.builtTracksThisTurn).toBe(1); // 건설 1회 카운트
  });

  it('인자 순서를 바꿔도(duesseldorf↔essen) 같은 링크를 찾는다', () => {
    const cp = useGameStore.getState().currentPlayer;
    useGameStore.setState((st) => ({
      players: { ...st.players, [cp]: { ...st.players[cp], cash: 20 } },
    }));
    expect(useGameStore.getState().buildDirectLink('duesseldorf', 'essen')).toBe(true);
    expect(useGameStore.getState().board.directLinks?.[0].owner).toBe(cp);
  });

  it('이미 건설된 직결은 다시 건설할 수 없다', () => {
    const cp = useGameStore.getState().currentPlayer;
    useGameStore.setState((st) => ({
      players: { ...st.players, [cp]: { ...st.players[cp], cash: 20 } },
    }));
    expect(useGameStore.getState().buildDirectLink('essen', 'duesseldorf')).toBe(true);
    expect(useGameStore.getState().buildDirectLink('essen', 'duesseldorf')).toBe(false);
  });

  it('현금이 부족하면 건설 실패', () => {
    const cp = useGameStore.getState().currentPlayer;
    useGameStore.setState((st) => ({
      players: { ...st.players, [cp]: { ...st.players[cp], cash: 1 } },
    }));
    expect(useGameStore.getState().buildDirectLink('essen', 'duesseldorf')).toBe(false);
    expect(useGameStore.getState().board.directLinks?.[0].owner).toBe(null);
  });
});
