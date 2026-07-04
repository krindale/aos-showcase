// 봇 자동 단계 진행 회귀 테스트 (정산·물품성장 교착 방지)
//
// 배경: 온라인에서 게스트가 자기 차례(currentPlayer)의 정산/물품성장 단계 도중 끊겨 봇으로
// 전환되면, 이 단계들은 AI 스케줄러(PLAYER_ACTION_PHASES) 대상이 아니라 진행 주체가 사라져
// 게임이 영구 교착됐다 (실제 사례: Korea 4인, incomeReduction 단계에서 게스트 끊김).
// runAIAutoPhase + scheduleAICheck 자동 진행으로 봇이 대신 넘기도록 수정 → 그 회귀 방지.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../gameStore';
import { scheduleAICheck } from '../helpers/aiScheduler';
import { GamePhase, PlayerId } from '@/types/game';

const setPhase = (phase: GamePhase, player: PlayerId) =>
  useGameStore.setState({ currentPhase: phase, currentPlayer: player });

describe('runAIAutoPhase — 봇이 currentPlayer인 자동 단계 대신 진행', () => {
  beforeEach(() => {
    // player2를 AI로 초기화 = 온라인에서 끊긴 게스트를 봇 전환한 상황을 모사
    useGameStore.getState().initGame('tutorial', ['사람', '봇'], [{ playerIndex: 1, name: '봇' }]);
  });

  it('incomeReduction 단계에서 봇이 currentPlayer면 다음 단계로 자동 진행한다', () => {
    setPhase('incomeReduction', 'player2');
    expect(useGameStore.getState().players.player2.isAI).toBe(true);

    useGameStore.getState().runAIAutoPhase();

    // applyIncomeReduction 실행 후 incomeReduction을 벗어나야 한다 (교착 해소)
    expect(useGameStore.getState().currentPhase).not.toBe('incomeReduction');
  });

  it('goodsGrowth 단계에서 봇이 currentPlayer면 주사위를 자동으로 굴려 성장 적용 후 진행한다', () => {
    setPhase('goodsGrowth', 'player2');

    useGameStore.getState().runAIAutoPhase();

    // growGoods가 productionUsed=true로 표시 + 단계 전환
    expect(useGameStore.getState().phaseState.productionUsed).toBe(true);
    expect(useGameStore.getState().currentPhase).not.toBe('goodsGrowth');
  });

  it('사람이 currentPlayer면 자동 진행하지 않는다 (수동 확인 유지)', () => {
    setPhase('incomeReduction', 'player1'); // player1 = 사람
    expect(useGameStore.getState().players.player1.isAI).toBe(false);

    useGameStore.getState().runAIAutoPhase();

    // 사람 차례 정산은 '진행' 버튼으로 직접 넘겨야 하므로 단계가 유지돼야 한다
    expect(useGameStore.getState().currentPhase).toBe('incomeReduction');
  });
});

describe('scheduleAICheck — 봇 자동 단계 스케줄 연쇄', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame('tutorial', ['사람', '봇'], [{ playerIndex: 1, name: '봇' }]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('정산 단계에서 봇 currentPlayer면 debounce 후 스케줄러가 자동 진행시킨다', () => {
    useGameStore.setState({ currentPhase: 'collectIncome', currentPlayer: 'player2' });

    scheduleAICheck(useGameStore.getState);
    vi.advanceTimersByTime(200); // AI_CHECK_DEBOUNCE(150ms) 경과

    // 봇이 진행 주체가 되어 collectIncome을 벗어났어야 한다
    expect(useGameStore.getState().currentPhase).not.toBe('collectIncome');
  });
});
