// 호버 미리보기(updateTrackPreview)가 결과가 같으면 set을 하지 않는지 (2026-09-11 깜빡임 수정)
//
// 이 액션은 마우스가 헥스 위를 지날 때마다 불린다. 예전엔 같은 헥스 위에서 움직여도
// (previewTrack null→null 포함) 매번 새 ui 객체로 set돼, 구독자 전원 리렌더 + persist
// 직렬화가 마우스 이동 빈도로 일어났다. "같은 결과 = ui 참조 불변"을 박제한다.

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';

describe('updateTrackPreview — 동일 결과면 set 생략', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['P1', 'P2']);
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player1' });
    useGameStore.getState().selectSourceHex({ col: 0, row: 0 }); // P 도시
  });

  it('같은 후보 헥스를 다시 호버해도 ui 참조가 바뀌지 않는다', () => {
    const store = useGameStore;
    const target = store.getState().ui.buildableNeighbors[0]?.coord;
    expect(target).toBeDefined();

    store.getState().updateTrackPreview(target!);
    const afterFirst = store.getState().ui;
    expect(afterFirst.previewTrack).not.toBeNull();

    store.getState().updateTrackPreview(target!);
    expect(store.getState().ui).toBe(afterFirst); // 참조 동일 = set 안 함
  });

  it('미리보기가 이미 없을 때 후보 아닌 헥스를 호버해도 ui 참조가 바뀌지 않는다', () => {
    const store = useGameStore;
    const before = store.getState().ui;
    expect(before.previewTrack).toBeNull();

    store.getState().updateTrackPreview({ col: 99, row: 99 }); // 후보 아님 → null 유지
    expect(store.getState().ui).toBe(before);
  });

  it('결과가 달라지면 여전히 갱신된다', () => {
    const store = useGameStore;
    const target = store.getState().ui.buildableNeighbors[0]?.coord;
    store.getState().updateTrackPreview(target!);
    const withPreview = store.getState().ui;

    store.getState().updateTrackPreview({ col: 99, row: 99 }); // 후보 아님 → null로
    expect(store.getState().ui).not.toBe(withPreview);
    expect(store.getState().ui.previewTrack).toBeNull();
  });
});
