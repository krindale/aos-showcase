import { describe, it, expect } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import { resetPlayerActions } from '@/utils/gameLogic';
import type { PlayerId } from '@/types/game';

/**
 * 경매(Phase II) 룰북 정합 테스트 — Turn Order 패스·종료 판정·차례 진행·지불 규칙.
 *
 * 룰북 (Deluxe p.4, Determine Player Order):
 * - Turn Order 패스("say 'pass' once to stay in the bidding")는 포기(drop out)가 아니다.
 *   passUsed(turnOrderPassUsed)와 droppedOut(auction.droppedOutPlayers)은 별개 상태.
 * - "Bidding continues until all but one player has dropped out of the bidding."
 *   종료는 미포기 플레이어가 1명 남았을 때뿐 — 패스한 플레이어가 남아 있으면 계속된다.
 * - 차례는 플레이어 순서대로 예외 없이 — 최고입찰자를 건너뛰는 룰은 없다. 최고입찰자도
 *   자기 차례에 입찰(자기 최고가 위로) 또는 포기를 직접 선택한다.
 * - 지불: 첫 포기자 $0(Last 자리) / 마지막까지 남은 2명(승자+마지막 포기자) 자기 입찰액
 *   전액 / 그 외 절반(올림). 입찰한 적 없는 플레이어는 $0.
 */
describe('경매: Turn Order 패스와 종료·차례·지불 (룰북 정합)', () => {
  const P1: PlayerId = 'player1';
  const P2: PlayerId = 'player2';
  const P3: PlayerId = 'player3';
  const P4: PlayerId = 'player4';

  const st = () => useGameStore.getState();

  /** 미포기 잔존자 — 경매 종료 판정과 동일 기준 (droppedOutPlayers만 본다) */
  const remaining = () =>
    st().playerOrder.filter((p) => !st().auction?.droppedOutPlayers.includes(p));
  const isComplete = () => remaining().length <= 1;

  function setup(order: PlayerId[], passHolders: PlayerId[] = []) {
    const s = createInitialGameState('rust-belt', ['가', '나', '다', '라'], []);
    for (const p of [P1, P2, P3, P4]) s.players[p] = { ...s.players[p], cash: 50 };
    for (const p of passHolders) {
      s.players[p] = { ...s.players[p], turnOrderPassAvailable: true, turnOrderPassUsed: false };
    }
    s.playerOrder = order;
    s.activePlayers = [P1, P2, P3, P4];
    s.currentPlayer = order[0];
    s.currentPhase = 'determinePlayerOrder';
    s.auction = null;
    useGameStore.setState(s);
  }

  it('(A) 패스는 포기가 아니다 — 최고입찰자만 남아도 경매는 끝나지 않고 계속된다', () => {
    // 실게임 재현: player1 $1 → player3·player4 포기 → player2 Turn Order 패스
    setup([P1, P3, P4, P2], [P2]);
    st().placeBid(P1, 1);
    st().passBid(P3);
    st().passBid(P4);
    expect(st().currentPlayer).toBe(P2);

    st().skipBid(P2); // Turn Order 패스

    // 경매 종료 아님 — P2는 포기자 목록에 없고 passUsed만 세팅
    expect(isComplete()).toBe(false);
    expect(st().auction?.droppedOutPlayers).not.toContain(P2);
    expect(st().players[P2].turnOrderPassUsed).toBe(true);

    // 차례는 순서대로 다음 미포기 플레이어 = 최고입찰자 P1 (건너뛰지 않음, 자동 통과 없음)
    expect(st().currentPlayer).toBe(P1);

    // P1이 자기 최고가 위로 올리면 차례가 다시 P2 — P2가 선택권을 되찾는다
    st().placeBid(P1, 2);
    expect(st().currentPlayer).toBe(P2);

    // 소진된 패스는 다시 쓸 수 없다 (skipBid가 무시하고 차례 유지 → 입찰/포기만 가능)
    st().skipBid(P2);
    expect(st().currentPlayer).toBe(P2);
    expect(st().auction?.droppedOutPlayers).not.toContain(P2);
  });

  it('(B) 무입찰 패스 — 첫 차례에 패스해도 이후 최소 입찰액은 $1', () => {
    setup([P1, P2, P3, P4], [P1]);

    st().skipBid(P1); // 아직 아무도 입찰하지 않은 상태(auction=null)에서 패스

    expect(st().currentPlayer).toBe(P2);
    expect(st().auction?.highestBid ?? 0).toBe(0);
    expect(st().auction?.droppedOutPlayers).not.toContain(P1);
    expect(st().players[P1].turnOrderPassUsed).toBe(true);

    // 다음 플레이어의 최소 입찰액은 그대로 $1
    st().placeBid(P2, 1);
    expect(st().auction?.highestBid).toBe(1);
    expect(st().auction?.highestBidder).toBe(P2);
  });

  it('(B-2) $0 입찰은 거부된다', () => {
    setup([P1, P2, P3, P4], [P1]);
    st().skipBid(P1);
    st().placeBid(P2, 0); // $0 입찰 불가
    expect(st().auction?.highestBid ?? 0).toBe(0);
    expect(st().auction?.highestBidder ?? null).toBeNull();
    expect(st().currentPlayer).toBe(P2); // 거부됐으니 차례 유지
  });

  it('(C) 패스자 단독 생존 — 나머지 전원 포기 시 패스한 플레이어가 $0으로 1등', () => {
    setup([P1, P2, P3, P4], [P1]);

    st().skipBid(P1); // 무입찰 패스
    st().passBid(P2);
    st().passBid(P3);
    st().passBid(P4);

    // 미포기 1명(P1) → 종료. 승자는 입찰한 적 없는 P1.
    expect(isComplete()).toBe(true);
    expect(remaining()).toEqual([P1]);

    const cashBefore = st().players[P1].cash;
    st().resolveAuction();

    expect(st().playerOrder[0]).toBe(P1); // 패스만 하고도 1등
    expect(st().players[P1].cash).toBe(cashBefore); // $0 지불 ("전액" = 입찰액 $0)
    // 포기 역순 배치: 첫 포기자 P2 = 꼴등
    expect(st().playerOrder).toEqual([P1, P4, P3, P2]);
  });

  it('(D) 왕복 입찰 — 최고입찰자도 자기 차례에 명시적 선택, 역전 후 교착 없이 종료', () => {
    setup([P1, P2, P3, P4], [P2]);

    st().placeBid(P1, 1);
    st().skipBid(P2); // 패스 → 차례는 P3로
    st().passBid(P3);
    st().passBid(P4);

    // 남은 사람 = P1(최고입찰자)·P2(패스 소진). 경매는 계속, 차례는 P1에게 —
    // 최고입찰자라고 자동 통과·건너뛰기 되지 않고 직접 선택을 요구받는다.
    expect(isComplete()).toBe(false);
    expect(st().currentPlayer).toBe(P1);

    // P1: 자기 최고가($1) 위로 올린다
    st().placeBid(P1, 2);
    expect(st().auction?.highestBidder).toBe(P1);
    expect(st().currentPlayer).toBe(P2);

    // P2: 패스는 소진 → 역전 입찰
    st().placeBid(P2, 3);
    expect(st().auction?.highestBidder).toBe(P2);
    expect(st().currentPlayer).toBe(P1); // 최고입찰자가 바뀌었으니 P1이 응수

    // P1: 포기 → 미포기 1명 → 종료
    st().passBid(P1);
    expect(isComplete()).toBe(true);
    expect(remaining()).toEqual([P2]);

    const cashP1 = st().players[P1].cash;
    const cashP2 = st().players[P2].cash;
    st().resolveAuction();

    const order = st().playerOrder;
    expect(order[0]).toBe(P2); // 역전 승리
    expect(order[1]).toBe(P1); // 마지막 포기자 = 2등
    // 지불: 승자 P2 전액 $3, 마지막 포기자 P1도 "마지막 2명"이라 전액 $2
    expect(st().players[P2].cash).toBe(cashP2 - 3);
    expect(st().players[P1].cash).toBe(cashP1 - 2);
  });

  it('(D-2) 최고입찰자가 포기하면 패스만 한 플레이어가 승자가 된다', () => {
    setup([P1, P2, P3, P4], [P2]);

    st().placeBid(P1, 1);
    st().skipBid(P2);
    st().passBid(P3);
    st().passBid(P4);
    expect(st().currentPlayer).toBe(P1);

    // 최고입찰자 P1이 올리는 대신 포기를 선택
    st().passBid(P1);
    expect(isComplete()).toBe(true);
    expect(remaining()).toEqual([P2]);

    const cashP1 = st().players[P1].cash;
    const cashP2 = st().players[P2].cash;
    st().resolveAuction();

    // 승자는 highestBidder(P1)가 아니라 미포기 잔존자 P2
    expect(st().playerOrder[0]).toBe(P2);
    expect(st().playerOrder[1]).toBe(P1); // 마지막 포기자 = 2등
    expect(st().players[P2].cash).toBe(cashP2); // 입찰한 적 없음 → $0
    expect(st().players[P1].cash).toBe(cashP1 - 1); // 마지막 포기자 전액 $1
  });

  it('(E) 롤오버 리셋 — passUsed 리셋, turnOrder 재선택 안 한 플레이어는 권한 소멸', () => {
    setup([P1, P2, P3, P4]);
    useGameStore.setState({
      players: {
        ...st().players,
        // P1: 이번 턴 turnOrder 선택 → 다음 턴 경매에 패스 보유
        [P1]: { ...st().players[P1], selectedAction: 'turnOrder' },
        // P2: 지난 권한으로 패스를 이미 사용, 이번 턴은 turnOrder 재선택 안 함
        [P2]: {
          ...st().players[P2],
          selectedAction: 'firstMove',
          turnOrderPassAvailable: true,
          turnOrderPassUsed: true,
        },
      },
    });

    const reset = resetPlayerActions(st().players, st().activePlayers);

    expect(reset[P1].turnOrderPassAvailable).toBe(true);
    expect(reset[P1].turnOrderPassUsed).toBe(false);
    expect(reset[P2].turnOrderPassAvailable).toBe(false); // 재선택 안 함 → 권한 없음
    expect(reset[P2].turnOrderPassUsed).toBe(false);
  });

  it('(E-2) 권한 없는 플레이어의 skipBid는 무시된다', () => {
    setup([P1, P2, P3, P4]); // 아무도 패스 권한 없음
    st().placeBid(P1, 1);
    expect(st().currentPlayer).toBe(P2);

    st().skipBid(P2); // 권한 없음 → no-op

    expect(st().currentPlayer).toBe(P2); // 차례 그대로
    expect(st().players[P2].turnOrderPassUsed).toBe(false);
  });

  it('(F) 지불 규칙 — 첫 포기 $0 / 마지막 2인 전액 / 중간 절반 올림 / 무입찰자 $0', () => {
    setup([P1, P2, P3, P4]);

    st().placeBid(P1, 1);
    st().placeBid(P2, 2);
    st().placeBid(P3, 3);
    st().passBid(P4); // 첫 포기 (무입찰) → Last, $0
    st().placeBid(P1, 4);
    st().passBid(P2); // 중간 포기 → $2의 절반 올림 = $1
    st().passBid(P3); // 마지막 포기 → 전액 $3

    expect(isComplete()).toBe(true);
    const cash = Object.fromEntries(
      [P1, P2, P3, P4].map((p) => [p, st().players[p].cash])
    ) as Record<PlayerId, number>;

    st().resolveAuction();

    // 순서: 승자 → 포기 역순
    expect(st().playerOrder).toEqual([P1, P3, P2, P4]);
    expect(st().players[P1].cash).toBe(cash[P1] - 4); // 승자 전액
    expect(st().players[P3].cash).toBe(cash[P3] - 3); // 마지막 포기자 전액
    expect(st().players[P2].cash).toBe(cash[P2] - 1); // 중간 절반 올림
    expect(st().players[P4].cash).toBe(cash[P4]);     // 첫 포기자 $0
  });
});
