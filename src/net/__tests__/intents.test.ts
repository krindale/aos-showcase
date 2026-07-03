// 게스트 가드(커밋 차단·intent 전송·복원) + 호스트 인텐트 검증 테스트 (Phase 1 스텝 2)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { applyGameIntent, installGuestGuard, isGuestGuardInstalled, removeGuestGuard } from '../intents';
import type { IntentMessage } from '../types';
import type { GameIntentPayload } from '../intents';

function currentSeat(): number {
  const s = useGameStore.getState();
  return s.activePlayers.indexOf(s.currentPlayer);
}

function otherSeat(): number {
  return currentSeat() === 0 ? 1 : 0;
}

let intentSeq = 0;
function intent(seat: number, type: string, payload: GameIntentPayload = {}): IntentMessage {
  return { id: `test-intent-${intentSeq++}`, clientId: 'test-client', seat, type, payload };
}

describe('게스트 가드', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['사람A', '사람B'], []);
  });

  afterEach(() => {
    removeGuestGuard();
  });

  it('커밋 액션을 차단하고 intent로 전송한다 (issueShare)', () => {
    const sent: { type: string; payload: GameIntentPayload }[] = [];
    installGuestGuard((type, payload) => sent.push({ type, payload }));
    expect(isGuestGuardInstalled()).toBe(true);

    const before = useGameStore.getState().players.player1.issuedShares;
    useGameStore.getState().issueShare('player1', 2);

    expect(useGameStore.getState().players.player1.issuedShares).toBe(before); // 로컬 무변경
    expect(sent).toEqual([{ type: 'issueShare', payload: { args: ['player1', 2] } }]);
  });

  it('captureUi 지정 액션은 로컬 ui 선택값을 함께 보낸다 (placeNewCity)', () => {
    const sent: { type: string; payload: GameIntentPayload }[] = [];
    installGuestGuard((type, payload) => sent.push({ type, payload }));

    useGameStore.setState((s) => ({ ui: { ...s.ui, selectedNewCityTile: 'A' } }) as never);
    useGameStore.getState().placeNewCity({ col: 3, row: 3 });

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('placeNewCity');
    expect(sent[0].payload.ui).toEqual({ selectedNewCityTile: 'A' });
  });

  it('guestNoop 액션은 intent도 보내지 않고 로컬 실행도 안 된다 (completeCubeMove·undo)', () => {
    const sent: { type: string }[] = [];
    installGuestGuard((type) => sent.push({ type }));

    useGameStore.getState().completeCubeMove();
    useGameStore.getState().undoLastAction();
    useGameStore.getState().collectIncome();

    expect(sent).toHaveLength(0);
  });

  it('가드 해제 시 원본 액션이 복원된다', () => {
    installGuestGuard(() => {});
    removeGuestGuard();

    const before = useGameStore.getState().players.player1.issuedShares;
    useGameStore.getState().issueShare('player1', 1);
    expect(useGameStore.getState().players.player1.issuedShares).toBe(before + 1);
  });
});

describe('호스트 인텐트 검증 (applyGameIntent)', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['사람A', '사람B'], []);
  });

  it('playerId 인자를 좌석 주인으로 강제한다 (스푸핑 차단)', () => {
    const seat = currentSeat();
    const me = useGameStore.getState().activePlayers[seat];
    const other = useGameStore.getState().activePlayers[otherSeat()];
    const beforeMe = useGameStore.getState().players[me].issuedShares;
    const beforeOther = useGameStore.getState().players[other].issuedShares;

    // 상대 playerId를 넣어 보내도 좌석 주인(me)으로 강제 실행
    const result = applyGameIntent(intent(seat, 'issueShare', { args: [other, 1] }));

    expect(result.ok).toBe(true);
    expect(useGameStore.getState().players[me].issuedShares).toBe(beforeMe + 1);
    expect(useGameStore.getState().players[other].issuedShares).toBe(beforeOther);
  });

  it('차례가 아닌 좌석의 인텐트는 거부한다', () => {
    const result = applyGameIntent(intent(otherSeat(), 'issueShare', { args: ['player1', 1] }));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('차례 아님');
  });

  it('허용 목록에 없는 인텐트는 거부한다', () => {
    expect(applyGameIntent(intent(currentSeat(), 'setState')).ok).toBe(false);
    expect(applyGameIntent(intent(currentSeat(), 'completeCubeMove')).ok).toBe(false); // guestNoop = 호스트 전용
    expect(applyGameIntent(intent(currentSeat(), 'initGame')).ok).toBe(false);
  });

  it('없는 좌석은 거부한다', () => {
    expect(applyGameIntent(intent(5, 'issueShare', { args: ['player1', 1] })).ok).toBe(false);
  });

  it('payload.ui를 실행 전 호스트 ui에 주입한다 (placeNewCity의 selectedNewCityTile)', () => {
    const seat = currentSeat();
    const result = applyGameIntent(
      intent(seat, 'placeNewCity', { args: [{ col: 3, row: 3 }], ui: { selectedNewCityTile: 'B' } })
    );
    // 도시화 행동을 선택하지 않았으므로 액션 자체는 거부되지만, ui 주입은 일어나야 한다
    expect(result.ok).toBe(false);
    expect(useGameStore.getState().ui.selectedNewCityTile).toBe('B');
  });

  it('nextPhase는 현재 차례 좌석만 실행 가능', () => {
    const bad = applyGameIntent(intent(otherSeat(), 'nextPhase'));
    expect(bad.ok).toBe(false);

    const phaseBefore = useGameStore.getState().currentPhase;
    const playerBefore = useGameStore.getState().currentPlayer;
    const good = applyGameIntent(intent(currentSeat(), 'nextPhase'));
    expect(good.ok).toBe(true);
    // issueShares에서 nextPhase → 다음 플레이어 or 다음 단계로 진행됨
    const after = useGameStore.getState();
    expect(after.currentPhase !== phaseBefore || after.currentPlayer !== playerBefore).toBe(true);
  });
});
