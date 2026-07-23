import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import type { PlayerId } from '@/types/game';

/**
 * 회귀: Turn Order 패스(skipBid)를 쓴 플레이어가 활성으로 남아
 * 최고입찰자에게 입찰 차례가 다시 돌아가는 버그.
 *
 * 재현(사용자 보고, 온라인 Western US): A가 Turn Order로 넘기고(skip),
 * B가 3을 배팅해 최고입찰자가 된 뒤 나머지가 모두 포기하면, A가 skip으로
 * passedPlayers에 빠지지 않아 순환이 B에게 되돌아온다. B가 (최고입찰자인데도)
 * 포기를 누르면 passBid가 highestBidder를 갱신하지 않으므로 resolveAuction에서
 * B가 그대로 1등이 되고, skip만 한 A는 어디에도 안 들어가 안전장치로 꼴등이 된다.
 *
 * 올바른 동작: 최고입찰자에게는 입찰 차례가 다시 오지 않는다 → 최고입찰자가
 * 포기하는 상황 자체가 발생하지 않는다.
 */
describe('경매: Turn Order 패스와 최고입찰자 차례', () => {
  // playerOrder = [B, A, C, D, E] — B가 첫 입찰, A(Turn Order 보유)가 두 번째
  const B: PlayerId = 'player1';
  const A: PlayerId = 'player2';
  const C: PlayerId = 'player3';
  const D: PlayerId = 'player4';
  const E: PlayerId = 'player5';

  beforeEach(() => {
    const s = createInitialGameState('germany', ['B', 'A', 'C', 'D', 'E'], []);
    // A에게 직전 턴 Turn Order 선택으로 부여된 무탈락 패스 권한
    s.players[A] = { ...s.players[A], turnOrderPassAvailable: true, turnOrderPassUsed: false };
    // 현금 넉넉히 (입찰/지불이 막히지 않게)
    for (const p of [B, A, C, D, E]) s.players[p] = { ...s.players[p], cash: 50 };
    s.playerOrder = [B, A, C, D, E];
    s.currentPlayer = B;
    s.auction = null;
    useGameStore.setState(s);
  });

  it('모두 포기/스킵해도 최고입찰자(B)에게 입찰 차례가 돌아오지 않는다', () => {
    const st = () => useGameStore.getState();

    st().placeBid(B, 3);          // B 최고입찰자 $3
    st().skipBid(A);              // A Turn Order 무탈락 패스
    st().passBid(C);
    st().passBid(D);
    st().passBid(E);

    // 이 시점에 남은 활성 = {A} (B는 최고입찰자). currentPlayer는 절대 B가 아니어야 한다.
    expect(st().currentPlayer).not.toBe(B);
    expect(st().auction?.highestBidder).toBe(B);
  });

  it('첫 순서 플레이어가 Turn Order 패스를 쓰면 다음 플레이어로 넘어가고 그룹에 남는다', () => {
    const st = () => useGameStore.getState();
    // playerOrder = [B, A, C, D, E] — 첫 순서 B가 아직 auction 없는 상태에서 skip
    // (B에게도 Turn Order 권한을 부여해 첫 순서 skip을 검증)
    useGameStore.setState({
      players: { ...st().players, [B]: { ...st().players[B], turnOrderPassAvailable: true } },
    });

    st().skipBid(B); // auction === null 상태에서 첫 순서 skip

    // 무시되지 않고 다음 플레이어(A)로 넘어간다
    expect(st().currentPlayer).toBe(A);
    // auction이 생성되되 최고입찰자는 없고, B는 탈락(passedPlayers)되지 않았다
    expect(st().auction).not.toBeNull();
    expect(st().auction?.highestBidder).toBeNull();
    expect(st().auction?.passedPlayers).not.toContain(B);
    // 패스 사용 플래그가 세팅된다 (재사용 방지)
    expect(st().players[B].turnOrderPassUsed).toBe(true);
  });

  it('A가 마지막에 포기하면 B가 정상 1등, A는 꼴등이 아니다', () => {
    const st = () => useGameStore.getState();

    st().placeBid(B, 3);
    st().skipBid(A);
    st().passBid(C);
    st().passBid(D);
    st().passBid(E);
    // 남은 활성 A가 포기 → 경매 종료
    st().passBid(A);
    st().resolveAuction();

    const order = st().playerOrder;
    expect(order[0]).toBe(B);                 // 최고입찰자 B가 1등
    expect(order[order.length - 1]).not.toBe(A); // A(Turn Order 패스)는 꼴등이 아님
    // 모든 플레이어가 순서에 정확히 한 번씩 포함
    expect([...order].sort()).toEqual([A, B, C, D, E].sort());
  });
});
