import { describe, it, expect } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import { predictAuctionOrderSlots } from '@/store/helpers/auctionOrder';
import type { PlayerId } from '@/types/game';

describe('predictAuctionOrderSlots — 경매 진행 중 예상 순서 슬롯', () => {
  const order: PlayerId[] = ['player1', 'player2', 'player3', 'player4', 'player5'];

  it('포기 전엔 전부 미정(null)', () => {
    expect(predictAuctionOrderSlots(order, [])).toEqual([null, null, null, null, null]);
  });

  it('첫 포기자가 맨 우측(꼴등), 이후 우→좌로 쌓인다', () => {
    // player3가 첫 포기 → 맨 우측(5번째). player4가 두 번째 → 그 왼쪽(4번째).
    expect(predictAuctionOrderSlots(order, ['player3'])).toEqual([
      null, null, null, null, 'player3',
    ]);
    expect(predictAuctionOrderSlots(order, ['player3', 'player4'])).toEqual([
      null, null, null, 'player4', 'player3',
    ]);
    expect(predictAuctionOrderSlots(order, ['player3', 'player4', 'player5'])).toEqual([
      null, null, 'player5', 'player4', 'player3',
    ]);
  });

  it('승자를 넘기면 남은 앞자리(1등)가 채워진다', () => {
    // player3,4,5 포기 → 앞 2자리 미정. 승자 player1이 확정되면 첫 null(1등)에 채워짐.
    expect(
      predictAuctionOrderSlots(order, ['player3', 'player4', 'player5'], 'player1'),
    ).toEqual([
      'player1', null, 'player5', 'player4', 'player3',
    ]);
    // 경매 완료(1명만 미포기)면 미정이 1개 → 승자로 완전히 채워진다.
    expect(
      predictAuctionOrderSlots(order, ['player3', 'player4', 'player5', 'player2'], 'player1'),
    ).toEqual([
      'player1', 'player2', 'player5', 'player4', 'player3',
    ]);
  });

  it('resolveAuction의 최종 순서 뒷부분과 규칙이 일치한다', () => {
    // 실제 store에서 경매를 굴려 resolveAuction 결과와 헬퍼 슬롯을 대조.
    const s = createInitialGameState('germany', ['A', 'B', 'C', 'D', 'E'], []);
    for (const p of order) s.players[p] = { ...s.players[p], cash: 50 };
    s.playerOrder = [...order];
    s.currentPlayer = order[0];
    s.auction = null;
    useGameStore.setState(s);
    const st = () => useGameStore.getState();

    // player1이 $3 입찰(최고), 나머지는 순서대로 포기 → passedPlayers = [p2,p3,p4,p5]
    st().placeBid('player1', 3);
    st().passBid('player2');
    st().passBid('player3');
    st().passBid('player4');
    st().passBid('player5');

    const passed = st().auction!.passedPlayers;
    const slots = predictAuctionOrderSlots(order, passed);

    st().resolveAuction();
    const finalOrder = st().playerOrder;

    // 승자(player1)는 1등, 나머지 뒷자리는 헬퍼 슬롯의 non-null과 정확히 일치해야 한다.
    expect(finalOrder[0]).toBe('player1');
    for (let i = 1; i < finalOrder.length; i++) {
      expect(slots[i]).toBe(finalOrder[i]);
    }
  });
});
