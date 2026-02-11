/**
 * payExpenses 파산 로직 단위 테스트
 *
 * 테스트 시나리오:
 * 1. 현금으로 비용 지불 가능 → 정상 지불
 * 2. 현금 부족, 수입으로 충당 → 수입 감소 (파산 아님)
 * 3. 현금 부족, 수입도 부족 → 파산
 * 4. 2인 게임에서 1명 파산 → gameOver
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import { GAME_CONSTANTS } from '@/types/game';

describe('payExpenses - 파산(Bankruptcy) 로직', () => {
  beforeEach(() => {
    // 매 테스트마다 store를 완전히 초기화
    useGameStore.getState().initGame('tutorial', ['Player1', 'Player2']);
  });

  it('현금이 충분하면 정상 지불', () => {
    const store = useGameStore;

    // 플레이어1: cash=10, shares=2, engine=1 → expense=3
    const state = store.getState();
    expect(state.players.player1.cash).toBe(GAME_CONSTANTS.STARTING_CASH);
    expect(state.players.player1.issuedShares).toBe(GAME_CONSTANTS.STARTING_SHARES);
    expect(state.players.player1.engineLevel).toBe(GAME_CONSTANTS.STARTING_ENGINE);

    // payExpenses 실행
    store.getState().payExpenses();

    const after = store.getState();
    const expense = GAME_CONSTANTS.STARTING_SHARES + GAME_CONSTANTS.STARTING_ENGINE;
    expect(after.players.player1.cash).toBe(GAME_CONSTANTS.STARTING_CASH - expense);
    expect(after.players.player1.eliminated).toBe(false);
    expect(after.currentPhase).not.toBe('gameOver');
  });

  it('현금 부족 + 수입으로 충당 가능 → 수입 감소 (파산 아님)', () => {
    const store = useGameStore;

    // 플레이어1: cash=0, income=5, shares=2, engine=1 → expense=3
    // shortage = 3 - 0 = 3, newIncome = 5 - 3 = 2 ≥ 0 → 파산 아님
    store.setState({
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 5,
        },
      },
    });

    store.getState().payExpenses();

    const after = store.getState();
    expect(after.players.player1.cash).toBe(0);
    expect(after.players.player1.income).toBe(2); // 5 - 3 = 2
    expect(after.players.player1.eliminated).toBe(false);
    expect(after.currentPhase).not.toBe('gameOver');
  });

  it('현금=0, 수입=0, expense > 0 → 파산', () => {
    const store = useGameStore;

    // 플레이어1: cash=0, income=0, shares=2, engine=1 → expense=3
    // shortage = 3 - 0 = 3, newIncome = 0 - 3 = -3 < 0 → 파산!
    store.setState({
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 0,
        },
      },
    });

    store.getState().payExpenses();

    const after = store.getState();
    expect(after.players.player1.eliminated).toBe(true);
    expect(after.players.player1.cash).toBe(0);
    expect(after.players.player1.income).toBe(GAME_CONSTANTS.MIN_INCOME);
  });

  it('2인 게임에서 1명 파산 → gameOver', () => {
    const store = useGameStore;

    // 플레이어1: cash=0, income=0 → 파산 예상
    // 플레이어2: cash=10, income=5 → 정상
    store.setState({
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 0,
        },
        player2: {
          ...store.getState().players.player2,
          cash: 10,
          income: 5,
        },
      },
    });

    store.getState().payExpenses();

    const after = store.getState();
    expect(after.players.player1.eliminated).toBe(true);
    expect(after.players.player2.eliminated).toBe(false);
    expect(after.currentPhase).toBe('gameOver');
    expect(after.winner).toBe('player2');
  });

  it('현금 부분 지불 + 나머지 수입 감소 → 수입이 정확히 0이면 파산 아님', () => {
    const store = useGameStore;

    // 플레이어1: cash=1, income=2, shares=2, engine=1 → expense=3
    // shortage = 3 - 1 = 2, newIncome = 2 - 2 = 0 ≥ 0 → 파산 아님
    store.setState({
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 1,
          income: 2,
        },
      },
    });

    store.getState().payExpenses();

    const after = store.getState();
    expect(after.players.player1.cash).toBe(0);
    expect(after.players.player1.income).toBe(0);
    expect(after.players.player1.eliminated).toBe(false);
    expect(after.currentPhase).not.toBe('gameOver');
  });

  it('현금 부분 지불 + 수입 감소 → 수입이 -1이면 파산', () => {
    const store = useGameStore;

    // 플레이어1: cash=1, income=1, shares=2, engine=1 → expense=3
    // shortage = 3 - 1 = 2, newIncome = 1 - 2 = -1 < 0 → 파산!
    store.setState({
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 1,
          income: 1,
        },
      },
    });

    store.getState().payExpenses();

    const after = store.getState();
    expect(after.players.player1.eliminated).toBe(true);
    expect(after.currentPhase).toBe('gameOver');
  });

  it('nextPhase에서 payExpenses 호출 시 파산 → gameOver로 전환', () => {
    const store = useGameStore;

    // payExpenses 단계에서 nextPhase 호출 시나리오
    store.setState({
      currentPhase: 'payExpenses',
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 0,
        },
        player2: {
          ...store.getState().players.player2,
          cash: 10,
          income: 5,
        },
      },
    });

    // nextPhase가 payExpenses를 호출하고 gameOver를 감지해야 함
    store.getState().nextPhase();

    const after = store.getState();
    expect(after.currentPhase).toBe('gameOver');
    expect(after.players.player1.eliminated).toBe(true);
  });

  it('collectIncome → payExpenses 전체 흐름: 수입=0이면 cash 안 늘고 파산', () => {
    const store = useGameStore;

    // collectIncome 단계 시작: income=0, cash=0
    store.setState({
      currentPhase: 'collectIncome',
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 0,
        },
        player2: {
          ...store.getState().players.player2,
          cash: 10,
          income: 5,
        },
      },
    });

    // nextPhase: collectIncome 실행 → payExpenses로 전환
    store.getState().nextPhase();

    const afterCollect = store.getState();
    expect(afterCollect.currentPhase).toBe('payExpenses');
    expect(afterCollect.players.player1.cash).toBe(0); // income=0이므로 cash 불변

    // nextPhase: payExpenses 실행 → 파산 → gameOver
    store.getState().nextPhase();

    const afterPay = store.getState();
    expect(afterPay.currentPhase).toBe('gameOver');
    expect(afterPay.players.player1.eliminated).toBe(true);
  });

  it('collectIncome → payExpenses 전체 흐름: 수입으로 현금 받으면 파산 회피', () => {
    const store = useGameStore;

    // collectIncome 단계 시작: income=5, cash=0
    // expense=3이므로 collectIncome 후 cash=5 → payExpenses에서 현금 지불 가능
    store.setState({
      currentPhase: 'collectIncome',
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 5,
        },
        player2: {
          ...store.getState().players.player2,
          cash: 10,
          income: 5,
        },
      },
    });

    // nextPhase: collectIncome → payExpenses
    store.getState().nextPhase();

    const afterCollect = store.getState();
    expect(afterCollect.currentPhase).toBe('payExpenses');
    expect(afterCollect.players.player1.cash).toBe(5); // income=5 → cash=5

    // nextPhase: payExpenses → incomeReduction (파산 아님)
    store.getState().nextPhase();

    const afterPay = store.getState();
    expect(afterPay.currentPhase).toBe('incomeReduction');
    expect(afterPay.players.player1.eliminated).toBe(false);
    expect(afterPay.players.player1.cash).toBe(2); // 5 - 3 = 2
  });

  it('사용자 시나리오: 주식2 엔진2 수입2 현금0 → collectIncome 후 payExpenses', () => {
    const store = useGameStore;

    // 사용자 시나리오: shares=2, engine=2, income=2, cash=0
    // expense = 2 + 2 = 4
    store.setState({
      currentPhase: 'collectIncome',
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 2,
          issuedShares: 2,
          engineLevel: 2,
        },
        player2: {
          ...store.getState().players.player2,
          cash: 10,
          income: 5,
        },
      },
    });

    // Step 1: collectIncome → cash += income(2) = 2
    store.getState().nextPhase();
    const afterCollect = store.getState();
    console.log(`[TEST] collectIncome 후: phase=${afterCollect.currentPhase}, cash=${afterCollect.players.player1.cash}, income=${afterCollect.players.player1.income}`);

    expect(afterCollect.currentPhase).toBe('payExpenses');
    expect(afterCollect.players.player1.cash).toBe(2); // 0 + 2 = 2
    expect(afterCollect.players.player1.income).toBe(2); // 아직 변경 없음

    // Step 2: payExpenses → expense=4, cash=2 < 4, shortage=2, newIncome=2-2=0
    store.getState().nextPhase();
    const afterPay = store.getState();
    console.log(`[TEST] payExpenses 후: phase=${afterPay.currentPhase}, cash=${afterPay.players.player1.cash}, income=${afterPay.players.player1.income}, eliminated=${afterPay.players.player1.eliminated}`);

    // 핵심: income이 2에서 0으로 줄어야 함!
    expect(afterPay.players.player1.income).toBe(0); // 2 - 2 = 0
    expect(afterPay.players.player1.cash).toBe(0);
    expect(afterPay.players.player1.eliminated).toBe(false); // 0 >= 0이므로 파산 아님
    expect(afterPay.currentPhase).toBe('incomeReduction'); // 파산 아니므로 계속 진행
  });

  it('사용자 시나리오 후속: 수입0 현금0 → 다음 턴 파산', () => {
    const store = useGameStore;

    // 이전 턴 결과: income=0, cash=0, shares=2, engine=2
    store.setState({
      currentPhase: 'collectIncome',
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 0,
          income: 0,
          issuedShares: 2,
          engineLevel: 2,
        },
        player2: {
          ...store.getState().players.player2,
          cash: 10,
          income: 5,
        },
      },
    });

    // collectIncome: income=0 → cash += 0 = 0
    store.getState().nextPhase();
    expect(store.getState().currentPhase).toBe('payExpenses');
    expect(store.getState().players.player1.cash).toBe(0);

    // payExpenses: expense=4, cash=0 < 4, shortage=4, newIncome=0-4=-4 < 0 → 파산!
    store.getState().nextPhase();
    const afterPay = store.getState();
    console.log(`[TEST] 파산 시나리오: phase=${afterPay.currentPhase}, income=${afterPay.players.player1.income}, eliminated=${afterPay.players.player1.eliminated}`);

    expect(afterPay.currentPhase).toBe('gameOver');
    expect(afterPay.players.player1.eliminated).toBe(true);
    expect(afterPay.winner).toBe('player2');
  });

  it('파산하지 않은 경우 nextPhase는 incomeReduction으로 전환', () => {
    const store = useGameStore;

    // 모두 정상 → incomeReduction으로 전환
    store.setState({
      currentPhase: 'payExpenses',
      players: {
        ...store.getState().players,
        player1: {
          ...store.getState().players.player1,
          cash: 10,
          income: 5,
        },
        player2: {
          ...store.getState().players.player2,
          cash: 10,
          income: 5,
        },
      },
    });

    store.getState().nextPhase();

    const after = store.getState();
    expect(after.currentPhase).toBe('incomeReduction');
    expect(after.players.player1.eliminated).toBe(false);
    expect(after.players.player2.eliminated).toBe(false);
  });
});
