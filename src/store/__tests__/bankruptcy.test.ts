import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { createInitialGameState } from '@/store/helpers/setup';
import type { PlayerId } from '@/types/game';

/**
 * 파산(Phase VII) 처리 회귀 테스트.
 *
 * 사용자 보고(2026-07-24, 온라인 달 2인+2봇): 기차-하나가 2턴에 파산했는데도 3턴
 * 주식 발행에서 그 좌석에 차례가 왔다. 또 파산 사실을 알리는 표시가 전혀 없었다.
 *
 * 요구:
 *  ① 파산자는 이후 모든 단계에서 차례를 받지 않는다 (playerOrder에서 제외)
 *  ② 파산 순간 알림 이벤트(bankruptcyEvent)가 남는다 — 사람·봇 공통
 *  ③ 여러 명이 차례차례 파산해도 매번 새 이벤트(key가 달라짐)
 *  ④ 같은 파산은 key가 같아 팝업이 중복 재생되지 않는다
 *  ⑤ activePlayers(좌석)는 불변 — 온라인 mySeat 매핑이 좌석 인덱스 기준이라 흔들리면 안 된다
 */
describe('파산 처리', () => {
  const P1: PlayerId = 'player1';
  const P2: PlayerId = 'player2';
  const P3: PlayerId = 'player3';
  const P4: PlayerId = 'player4';

  /** 지정 플레이어만 파산하도록 재정 상태를 세팅 (현금 0·수입 0 → 비용 지불 불가) */
  const setup = (broke: PlayerId[]) => {
    const s = createInitialGameState('rustBelt', ['A', 'B', 'C', 'D'], []);
    for (const pid of [P1, P2, P3, P4]) {
      const isBroke = broke.includes(pid);
      s.players[pid] = {
        ...s.players[pid],
        cash: isBroke ? 0 : 100,
        income: isBroke ? 0 : 20,
      };
    }
    s.playerOrder = [P1, P2, P3, P4];
    s.currentPlayer = P1;
    s.currentTurn = 2;
    s.currentPhase = 'payExpenses';
    useGameStore.setState(s);
  };

  beforeEach(() => setup([]));

  it('파산자는 playerOrder에서 빠져 이후 차례를 받지 않는다', () => {
    setup([P1]);
    useGameStore.getState().payExpenses();

    const s = useGameStore.getState();
    expect(s.players[P1].eliminated).toBe(true);
    expect(s.playerOrder).not.toContain(P1);
    expect(s.playerOrder).toEqual([P2, P3, P4]);
  });

  it('activePlayers(좌석)는 그대로 유지된다 — 온라인 좌석 매핑 보호', () => {
    setup([P1]);
    const before = [...useGameStore.getState().activePlayers];
    useGameStore.getState().payExpenses();
    expect(useGameStore.getState().activePlayers).toEqual(before);
  });

  it('파산 순간 알림 이벤트가 남는다 (봇도 동일)', () => {
    setup([P3]);
    useGameStore.setState({
      players: {
        ...useGameStore.getState().players,
        [P3]: { ...useGameStore.getState().players[P3], isAI: true },
      },
    });
    useGameStore.getState().payExpenses();

    const ev = useGameStore.getState().bankruptcyEvent;
    expect(ev).toBeTruthy();
    expect(ev!.players.map((p) => p.id)).toEqual([P3]);
    expect(ev!.turn).toBe(2);
  });

  it('같은 턴에 여러 명이 파산하면 한 팝업에 모두 담긴다', () => {
    setup([P1, P2]);
    useGameStore.getState().payExpenses();

    const s = useGameStore.getState();
    expect(s.bankruptcyEvent!.players.map((p) => p.id).sort()).toEqual([P1, P2].sort());
    expect(s.playerOrder).toEqual([P3, P4]);
  });

  it('여러 명이 차례차례(다른 턴) 파산하면 매번 새 key로 다시 뜬다', () => {
    // 1차: 2턴에 P1 파산
    setup([P1]);
    useGameStore.getState().payExpenses();
    const firstKey = useGameStore.getState().bankruptcyEvent!.key;
    expect(useGameStore.getState().bankruptcyEvent!.players.map((p) => p.id)).toEqual([P1]);

    // 2차: 3턴에 P2 파산 (P1은 이미 탈락 상태로 유지)
    useGameStore.setState({
      currentTurn: 3,
      players: {
        ...useGameStore.getState().players,
        [P2]: { ...useGameStore.getState().players[P2], cash: 0, income: 0 },
      },
    });
    useGameStore.getState().payExpenses();

    const s = useGameStore.getState();
    expect(s.bankruptcyEvent!.key).not.toBe(firstKey); // 새 팝업이 뜬다
    expect(s.bankruptcyEvent!.players.map((p) => p.id)).toEqual([P2]);
    expect(s.playerOrder).toEqual([P3, P4]); // 둘 다 빠짐
  });

  it('파산이 없는 턴엔 이벤트가 새로 생기지 않는다 (팝업 중복 재생 방지)', () => {
    setup([P1]);
    useGameStore.getState().payExpenses();
    const key = useGameStore.getState().bankruptcyEvent!.key;

    // 아무도 파산하지 않는 턴 — 이벤트는 그대로(같은 key)라 모달의 key 가드가 재생을 막는다
    useGameStore.setState({ currentTurn: 3 });
    useGameStore.getState().payExpenses();
    expect(useGameStore.getState().bankruptcyEvent!.key).toBe(key);
  });

  it('경매(resolveAuction)가 파산자를 순서에 되살리지 않는다', () => {
    // 2026-07-24 온라인 달 검증에서 발견: payExpenses가 playerOrder에서 뺀 파산자를
    // resolveAuction의 "모든 플레이어가 순서에 있는지" 안전장치가 activePlayers(좌석 전체)
    // 에서 다시 집어넣어, 파산한 게스트에게 행동 선택 차례가 돌아왔다.
    setup([P1]);
    useGameStore.getState().payExpenses();
    expect(useGameStore.getState().playerOrder).not.toContain(P1);

    // 다음 턴 경매: 생존자들이 모두 포기 → resolveAuction
    useGameStore.setState({
      currentTurn: 3,
      currentPhase: 'determinePlayerOrder',
      currentPlayer: P2,
      auction: {
        highestBid: 0,
        highestBidder: null,
        currentBidder: P2,
        passedPlayers: [P2, P3],
        bids: {},
        lastActedPlayer: P3,
      } as never,
    });
    useGameStore.getState().resolveAuction();

    const order = useGameStore.getState().playerOrder;
    expect(order).not.toContain(P1);          // 파산자 부활 금지
    expect(order.sort()).toEqual([P2, P3, P4].sort()); // 생존자만
  });

  it('파산자가 있어도 행동 선택 단계가 완료된다 (교착 방지)', () => {
    // playerOrder에서 파산자를 뺀 뒤, 완료 판정(allPlayersSelectedAction)이 좌석 전체를
    // 기준으로 하면 파산자가 영원히 "미선택"이라 단계가 안 끝난다 — nextPhase의
    // activePlayers 생존자 필터 회귀 테스트.
    setup([P1]);
    useGameStore.getState().payExpenses();

    const st = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'selectActions',
      currentPlayer: P4, // 생존 순서(P2,P3,P4)의 마지막
      players: {
        ...st.players,
        [P2]: { ...st.players[P2], selectedAction: 'firstMove' },
        [P3]: { ...st.players[P3], selectedAction: 'engineer' },
        [P4]: { ...st.players[P4], selectedAction: 'locomotive' },
        // P1(파산)은 selectedAction: null 그대로
      },
    });
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().currentPhase).toBe('buildTrack'); // 교착 없이 진행
  });

  it('파산자가 있어도 건설/이동 단계가 완료된다 (allPlayersMoved 교착 방지)', () => {
    setup([P1]);
    useGameStore.getState().payExpenses();

    // 건설: 생존자 전원 완료 → moveGoods로
    const st = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: P4,
      phaseState: {
        ...st.phaseState,
        playerMoves: { [P2]: true, [P3]: true, [P4]: false } as never,
      },
    });
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().currentPhase).toBe('moveGoods');

    // 이동 2라운드: 생존자 전원 완료 → collectIncome으로
    const st2 = useGameStore.getState();
    useGameStore.setState({
      currentPlayer: P4,
      phaseState: {
        ...st2.phaseState,
        moveGoodsRound: 2,
        playerMoves: { [P2]: true, [P3]: true, [P4]: false } as never,
      },
    });
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().currentPhase).toBe('collectIncome');
  });

  it('턴 롤오버가 파산자의 selectedAction도 리셋한다 (행동 잠김 방지)', () => {
    setup([P1]);
    const st0 = useGameStore.getState();
    useGameStore.setState({
      players: {
        ...st0.players,
        [P1]: { ...st0.players[P1], selectedAction: 'engineer' }, // 파산 직전 골랐던 행동
      },
    });
    useGameStore.getState().payExpenses();

    // advanceTurn → 새 턴 롤오버
    const st = useGameStore.getState();
    useGameStore.setState({ currentPhase: 'advanceTurn', currentPlayer: st.playerOrder[0] });
    useGameStore.getState().nextPhase();

    const s = useGameStore.getState();
    expect(s.currentTurn).toBe(3);
    // 파산자의 행동이 스테일로 남아 "engineer 선택됨"으로 잠기지 않는다
    expect(s.players[P1].selectedAction).toBeNull();
  });

  it('파산자의 마을 가닥은 삭제가 아니라 공용(owner null) 전환된다', () => {
    setup([P1]);
    const st = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...st.board,
        townSpurs: [
          { id: 'sp1', townCoord: { col: 3, row: 3 }, edge: 0, owner: P1, builtTurn: 1 },
          { id: 'sp2', townCoord: { col: 4, row: 4 }, edge: 2, owner: P2, builtTurn: 1 },
        ],
      } as never,
    });
    useGameStore.getState().payExpenses();

    const spurs = useGameStore.getState().board.townSpurs ?? [];
    expect(spurs).toHaveLength(2);                       // ❌ 수정 전: 파산자 가닥 삭제
    expect(spurs.find(s => s.id === 'sp1')!.owner).toBeNull();  // 공용 전환
    expect(spurs.find(s => s.id === 'sp2')!.owner).toBe(P2);    // 생존자 가닥 무변경
  });

  it('이미 탈락한 플레이어는 다시 파산 처리되지 않는다', () => {
    setup([P1]);
    useGameStore.getState().payExpenses();
    const key = useGameStore.getState().bankruptcyEvent!.key;

    useGameStore.setState({ currentTurn: 3 });
    useGameStore.getState().payExpenses();
    // P1이 두 번 이벤트에 담기지 않음
    expect(useGameStore.getState().bankruptcyEvent!.key).toBe(key);
    expect(useGameStore.getState().playerOrder).toEqual([P2, P3, P4]);
  });
});
