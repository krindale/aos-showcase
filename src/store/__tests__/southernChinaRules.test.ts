// 남부 중국(Southern China) 맵 특수룰 store 테스트
// 셋업(큐브/행동) · Gain Support 즉시 토큰 · 토큰 반납(건설 4개/기관차 +1) · 보너스 VP
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import { getMapProfile } from '@/maps/getMapProfile';
import { maxTracksForBuilder } from '@/store/helpers/boardRules';
import { calculateVictoryPoints, effectiveEngineLevel, playerBonusVP, resetPlayerActions } from '@/utils/gameLogic';
import { City } from '@/types/game';
import { shouldSpendSupportForLoco } from '@/ai/strategies/supportToken';

function setupChina() {
  const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
  useGameStore.setState(s);
  return useGameStore.getState();
}

const cityById = (id: string): City =>
  useGameStore.getState().board.cities.find((c) => c.id === id)!;

describe('남부 중국 셋업', () => {
  beforeEach(() => { setupChina(); });

  it('Hong Kong·Changsha 큐브 3개, 나머지 도시 2개 (4인 8턴)', () => {
    const state = useGameStore.getState();
    expect(cityById('hongkong').cubes.length).toBe(3);
    expect(cityById('changsha').cubes.length).toBe(3);
    for (const id of ['chongqing', 'ningbo', 'guiyang', 'xiamen', 'nanning', 'guangzhou', 'shenzhen', 'haikou']) {
      expect(cityById(id).cubes.length).toBe(2);
    }
    expect(state.maxTurns).toBe(8);
    expect(state.phaseState.maxTracksThisTurn).toBe(3);
  });

  it('Engineer·Locomotive 비활성 + gainSupport 추가 행동', () => {
    const profile = getMapProfile('southern-china');
    expect(profile.disabledActions).toEqual(['engineer', 'locomotive']);
    expect(profile.extraActions).toEqual(['gainSupport']);
    expect(profile.supportTokensRule).toBe(true);
  });

  it('engineer/locomotive 선택은 거부, gainSupport 선택은 즉시 토큰 +1', () => {
    useGameStore.setState({ currentPhase: 'selectActions', currentPlayer: 'player1' });
    const store = useGameStore.getState();
    store.selectAction('player1', 'engineer');
    expect(useGameStore.getState().players.player1.selectedAction).toBeNull();
    store.selectAction('player1', 'locomotive');
    expect(useGameStore.getState().players.player1.selectedAction).toBeNull();
    expect(useGameStore.getState().players.player1.engineLevel).toBe(1); // 즉시 효과도 없음

    store.selectAction('player1', 'gainSupport');
    const after = useGameStore.getState().players.player1;
    expect(after.selectedAction).toBe('gainSupport');
    expect(after.supportTokens).toBe(1);
  });

  it('다른 맵(rust-belt)에서는 gainSupport 선택 불가', () => {
    const s = createInitialGameState('rust-belt', ['A', 'B', 'C', 'D'], []);
    useGameStore.setState({ ...s, currentPhase: 'selectActions', currentPlayer: 'player1' });
    useGameStore.getState().selectAction('player1', 'gainSupport');
    expect(useGameStore.getState().players.player1.selectedAction).toBeNull();
    expect(useGameStore.getState().players.player1.supportTokens ?? 0).toBe(0);
  });
});

describe('지지 토큰 반납', () => {
  beforeEach(() => {
    setupChina();
    useGameStore.setState((s) => ({
      players: { ...s.players, player1: { ...s.players.player1, supportTokens: 2 } },
    }));
  });

  it("'build' 반납: buildTrack 단계 내 차례에 건설 상한 4", () => {
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'build');
    const state = useGameStore.getState();
    expect(state.players.player1.supportTokens).toBe(1);
    expect(state.players.player1.supportBuildActive).toBe(true);
    expect(state.phaseState.maxTracksThisTurn).toBe(4);
    expect(maxTracksForBuilder(state, 'player1')).toBe(4);
    // 중복 반납 불가
    useGameStore.getState().spendSupportToken('player1', 'build');
    expect(useGameStore.getState().players.player1.supportTokens).toBe(1);
  });

  it("'loco' 반납: moveGoods 단계에 실효 엔진 +1 (영구 레벨·비용은 불변)", () => {
    useGameStore.setState({ currentPhase: 'moveGoods', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'loco');
    const state = useGameStore.getState();
    expect(state.players.player1.supportTokens).toBe(1);
    expect(state.players.player1.supportLocoActive).toBe(true);
    expect(state.players.player1.engineLevel).toBe(1); // 영구 레벨 불변 → 비용 지불에도 미포함
    expect(effectiveEngineLevel(state.players, 'player1')).toBe(2);
    expect(effectiveEngineLevel(state.players, 'player2')).toBe(1);
  });

  it('잘못된 단계/차례/토큰 0개면 반납 거부', () => {
    useGameStore.setState({ currentPhase: 'moveGoods', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'build'); // 단계 불일치
    expect(useGameStore.getState().players.player1.supportTokens).toBe(2);
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player2' });
    useGameStore.getState().spendSupportToken('player1', 'build'); // 차례 아님
    expect(useGameStore.getState().players.player1.supportTokens).toBe(2);
    useGameStore.getState().spendSupportToken('player2', 'build'); // 토큰 없음
    expect(useGameStore.getState().players.player2.supportBuildActive ?? false).toBe(false);
  });

  it('턴 롤오버 시 토큰 효과 플래그는 리셋, 토큰 보유량은 유지', () => {
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'build');
    const players = resetPlayerActions(useGameStore.getState().players, ['player1', 'player2', 'player3', 'player4']);
    expect(players.player1.supportBuildActive).toBe(false);
    expect(players.player1.supportLocoActive).toBe(false);
    expect(players.player1.supportTokens).toBe(1); // 남은 토큰은 유지 (종료 시 3 VP)
  });

  it('미사용 토큰 보너스 VP = 토큰×3 + 페리×1', () => {
    expect(playerBonusVP({ supportTokens: 2, ferriesBuilt: 1 })).toBe(7);
    expect(playerBonusVP({})).toBe(0);
  });

  it('최종 VP 계산에 보너스가 포함된다 (종료 화면과 같은 공식)', () => {
    // 리뷰 S4 회귀 가드: 종료 화면이 VP 공식을 자체 계산하며 보너스를 빠뜨려
    // 승자 판정이 틀리던 버그. calculateVictoryPoints의 4번째 인자로 반드시 전달돼야 한다.
    const income = 10, track = 6, shares = 8;
    const base = calculateVictoryPoints(income, track, shares);
    const withBonus = calculateVictoryPoints(income, track, shares, playerBonusVP({ supportTokens: 3, ferriesBuilt: 1 }));
    expect(base).toBe(10 * 3 + 6 - 8 * 3);
    expect(withBonus).toBe(base + 10); // 토큰 3×3 + 페리 1
  });
});

describe('추가비용 헥스 — 복합 타일 전 단순 타일 선행 (룰북)', () => {
  // 이 엔진의 복합(교차/공존)은 항상 "기존 단순 트랙 위 교체"라 빈 헥스 복합 배치가
  // 전 맵에서 불가능 = 룰이 구조적으로 충족된다. 이 테스트는 그 전제를 박제하는 회귀 가드 —
  // 훗날 빈 헥스 복합 배치가 허용되면 여기가 깨져 추가비용 헥스($4/$5) 제약을 상기시킨다.
  it('빈 추가비용 헥스($4/$5)에는 복합 트랙(교차/공존)을 바로 놓을 수 없다', () => {
    setupChina();
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player1' });
    // (7,7)·(9,8) $5, (4,10) $4 — 트랙이 없는 상태에서는 어떤 복합도 불가 (단순 선행 필수)
    for (const coord of [{ col: 7, row: 7 }, { col: 9, row: 8 }, { col: 4, row: 10 }]) {
      expect(useGameStore.getState().canBuildComplexTrack(coord, [0, 3], 'crossing')).toBe(false);
      expect(useGameStore.getState().canBuildComplexTrack(coord, [0, 3], 'coexist')).toBe(false);
    }
  });
});

describe('봇 지지 토큰 loco 반납 판단 (shouldSpendSupportForLoco)', () => {
  // 채택 근거는 300시드 측정(VP 동률·파산 20%↓, baseline 문서 2026-07-27c).
  // 여기서는 "다른 맵 항등"과 기본 가드만 박제한다 — 이 훅은 gameStore의 AI moveGoods
  // 진입에서 매번 호출되므로, supportTokensRule이 아닌 맵에서 새는 순간 전 맵이 영향받는다.
  it('supportTokensRule이 아닌 맵에서는 항상 false (전 맵 항등)', () => {
    const s = createInitialGameState('rust-belt', ['A', 'B', 'C', 'D'], []);
    useGameStore.setState({
      ...s, currentPhase: 'moveGoods', currentPlayer: 'player1',
      players: { ...s.players, player1: { ...s.players.player1, supportTokens: 3 } },
    });
    expect(shouldSpendSupportForLoco(useGameStore.getState(), 'player1')).toBe(false);
  });

  it('토큰이 없거나 이미 이번 턴 반납했으면 false', () => {
    setupChina();
    useGameStore.setState({ currentPhase: 'moveGoods', currentPlayer: 'player1' });
    // 토큰 0
    expect(shouldSpendSupportForLoco(useGameStore.getState(), 'player1')).toBe(false);
    // 토큰은 있으나 이미 반납해 효과가 켜진 상태
    useGameStore.setState((st) => ({
      players: {
        ...st.players,
        player1: { ...st.players.player1, supportTokens: 2, supportLocoActive: true },
      },
    }));
    expect(shouldSpendSupportForLoco(useGameStore.getState(), 'player1')).toBe(false);
  });

  it('토큰이 있어도 배달할 게 없는 초기 보드에서는 반납하지 않는다', () => {
    setupChina();
    useGameStore.setState((st) => ({
      currentPhase: 'moveGoods', currentPlayer: 'player1',
      players: { ...st.players, player1: { ...st.players.player1, supportTokens: 2 } },
    }));
    // 트랙이 하나도 없어 엔진을 올려도 열리는 배달이 없음 → 확정 3 VP를 팔 이유가 없다
    expect(shouldSpendSupportForLoco(useGameStore.getState(), 'player1')).toBe(false);
  });
});
